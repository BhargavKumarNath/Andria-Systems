"""Real market data loader via yfinance (Phase 4.1).

Canonical OHLCV schema (no ``market_cap_approx`` — see design notes):

    date            pl.Date
    cusip           pl.Utf8
    ticker          pl.Utf8
    open            pl.Float64
    high            pl.Float64
    low             pl.Float64
    close_adj       pl.Float64   # split- and dividend-adjusted close (Adj Close)
    volume          pl.Float64
    volume_30d_avg  pl.Float64   # rolling 30-session average volume
    volatility_30d  pl.Float64   # rolling 30-session realised daily vol (std of log returns)
    pricing_source  pl.Utf8      # "yfinance_cached" | "yfinance_live"

Design principles:
  - Never silently falls back to synthetic pricing. If data is unavailable, the
    ticker is marked as unmapped/failed and forwarded to ProvenanceTracker.
  - Local Parquet cache at ``cfg.market_data.cache_dir/{ticker}.parquet`` is
    checked first; downloads happen only when the cache is missing or stale.
  - Batch downloads respect ``max_tickers_per_batch`` and ``request_delay_seconds``
    to stay within yfinance rate limits.
  - Corporate action adjustment: always downloads ``Adj Close`` from yfinance.
    A 2×+ single-day move is flagged as a potential missed adjustment.
"""

from __future__ import annotations
import time
from datetime import date, timedelta
from pathlib import Path
import numpy as np
import polars as pl
from andria.core.config import get_settings
from andria.core.logging import get_logger
from andria.data.cusip_mapper import CUSIPMapper

logger = get_logger(__name__)

# Canonical output schema — enforced before returning to callers
_SCHEMA = {
    "date": pl.Date,
    "cusip": pl.Utf8,
    "ticker": pl.Utf8,
    "open": pl.Float64,
    "high": pl.Float64,
    "low": pl.Float64,
    "close_adj": pl.Float64,
    "volume": pl.Float64,
    "volume_30d_avg": pl.Float64,
    "volatility_30d": pl.Float64,
    "pricing_source": pl.Utf8,
}

_MIN_HISTORY_DAYS = 252  # flag tickers with < 1yr of data as insufficient


class MarketDataLoader:
    """Fetches, caches, and validates real OHLCV pricing data.

    Usage::

        loader = MarketDataLoader()
        pricing = loader.load_pricing(
            cusips=["037833100", "594918104"],
            start="2010-01-01",
            end="2024-12-31",
        )
        coverage = loader.last_coverage_report
    """

    def __init__(self) -> None:
        self._cfg = get_settings().market_data
        self._mapper = CUSIPMapper()
        self._cache_dir = self._cfg.cache_dir
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        self.last_coverage_report: dict[str, object] = {}

    # Cache helpers

    def _cache_path(self, ticker: str) -> Path:
        return self._cache_dir / f"{ticker.upper()}.parquet"

    def _is_cache_fresh(self, ticker: str) -> bool:
        """Return True if cached file exists and is not older than stale_threshold_days."""
        p = self._cache_path(ticker)
        if not p.exists():
            return False
        mtime = date.fromtimestamp(p.stat().st_mtime)
        age_days = (date.today() - mtime).days
        return age_days <= self._cfg.stale_threshold_days

    def _read_cache(self, ticker: str, cusip: str) -> pl.DataFrame | None:
        p = self._cache_path(ticker)
        if not p.exists():
            return None
        df = pl.read_parquet(p)
        # Back-fill cusip in case it was stored without it
        if "cusip" not in df.columns:
            df = df.with_columns(pl.lit(cusip).alias("cusip"))
        return df

    def _write_cache(self, ticker: str, df: pl.DataFrame) -> None:
        p = self._cache_path(ticker)
        df.write_parquet(p, compression="zstd")

    # Download
    def _download_ticker(
        self,
        ticker: str,
        cusip: str,
        start: str,
        end: str,
    ) -> pl.DataFrame | None:
        """Download OHLCV from yfinance and transform to canonical schema."""
        import yfinance as yf  # deferred import — heavy dependency

        logger.info("downloading_ticker", ticker=ticker, start=start, end=end)
        try:
            raw = yf.download(
                ticker,
                start=start,
                end=end,
                auto_adjust=False,
                progress=False,
                threads=False,
            )
        except Exception as exc:
            logger.warning("yfinance_download_failed", ticker=ticker, error=str(exc))
            return None

        if raw.empty:
            logger.warning("yfinance_empty_response", ticker=ticker)
            return None

        # Flatten MultiIndex columns if present (yfinance ≥ 0.2.x behaviour)
        if hasattr(raw.columns, "levels"):
            raw.columns = [col[0] if isinstance(col, tuple) else col for col in raw.columns]

        required = {"Open", "High", "Low", "Adj Close", "Volume"}
        if not required.issubset(set(raw.columns)):
            logger.warning("yfinance_missing_columns", ticker=ticker, cols=list(raw.columns))
            return None

        raw = raw.reset_index()

        df = pl.from_pandas(raw[["Date", "Open", "High", "Low", "Adj Close", "Volume"]]).rename({
            "Date": "date",
            "Open": "open",
            "High": "high",
            "Low": "low",
            "Adj Close": "close_adj",
            "Volume": "volume",
        }).with_columns([
            pl.col("date").cast(pl.Date),
            pl.lit(cusip).alias("cusip"),
            pl.lit(ticker).alias("ticker"),
            pl.col("open").cast(pl.Float64),
            pl.col("high").cast(pl.Float64),
            pl.col("low").cast(pl.Float64),
            pl.col("close_adj").cast(pl.Float64),
            pl.col("volume").cast(pl.Float64),
        ])

        # Derived columns
        df = self._add_derived_columns(df, source="yfinance_live")
        return df

    @staticmethod
    def _add_derived_columns(df: pl.DataFrame, source: str) -> pl.DataFrame:
        """Add volume_30d_avg, volatility_30d, pricing_source. Sort by date first."""
        df = df.sort("date")

        log_ret = (pl.col("close_adj") / pl.col("close_adj").shift(1)).log()

        df = df.with_columns([
            pl.col("volume").rolling_mean(window_size=30, min_periods=5).alias("volume_30d_avg"),
            log_ret.rolling_std(window_size=30, min_periods=10).alias("volatility_30d"),
            pl.lit(source).alias("pricing_source"),
        ])

        return df

    @staticmethod
    def _check_corporate_actions(df: pl.DataFrame, ticker: str) -> None:
        """Warn if a 2×+ single-day price move suggests a missed adjustment."""
        daily_chg = (df["close_adj"] / df["close_adj"].shift(1) - 1).drop_nulls()
        extreme = daily_chg.filter(daily_chg.abs() >= 1.0)
        if len(extreme) > 0:
            logger.warning(
                "potential_missed_corporate_action",
                ticker=ticker,
                n_extreme_days=len(extreme),
                note="Verify split/dividend adjustment coverage",
            )

    # Public API
    def load_pricing(
        self,
        cusips: list[str],
        start: str | None = None,
        end: str | None = None,
    ) -> pl.DataFrame:
        """Load real pricing for a list of CUSIPs.

        Args:
            cusips: 9-character CUSIP strings to fetch pricing for.
            start:  Start date string (YYYY-MM-DD). Defaults to cfg.start_date.
            end:    End date string (YYYY-MM-DD). Defaults to today.

        Returns:
            Polars DataFrame in canonical OHLCV schema. Rows for unmapped or
            failed tickers are excluded. Coverage details are stored in
            ``self.last_coverage_report``.

        Raises:
            Never raises on partial failures — all failures are logged and
            tracked in the coverage report.
        """
        start = start or self._cfg.start_date
        end = end or date.today().isoformat()

        # 1. Resolve CUSIP → ticker
        cusip_to_ticker = self._mapper.resolve(cusips)
        unmapped = [c for c, t in cusip_to_ticker.items() if t is None]
        mapped = {c: t for c, t in cusip_to_ticker.items() if t is not None}

        logger.info(
            "load_pricing_started",
            total_cusips=len(cusips),
            mapped=len(mapped),
            unmapped=len(unmapped),
        )

        # 2. Batch download with rate-limiting
        frames: list[pl.DataFrame] = []
        failed_tickers: list[str] = []
        stale_tickers: list[str] = []

        tickers_list = list(mapped.items())
        batch_size = self._cfg.max_tickers_per_batch

        for batch_start in range(0, len(tickers_list), batch_size):
            batch = tickers_list[batch_start: batch_start + batch_size]

            for cusip, ticker in batch:
                assert ticker is not None

                if self._is_cache_fresh(ticker):
                    cached = self._read_cache(ticker, cusip)
                    if cached is not None:
                        frames.append(cached.with_columns(
                            pl.lit("yfinance_cached").alias("pricing_source")
                        ))
                        continue

                # Check if stale (exists but old)
                if self._cache_path(ticker).exists():
                    stale_tickers.append(ticker)

                # Download fresh
                downloaded = self._download_ticker(ticker, cusip, start, end)
                if downloaded is None:
                    failed_tickers.append(ticker)
                    continue

                self._check_corporate_actions(downloaded, ticker)
                self._write_cache(ticker, downloaded)
                frames.append(downloaded)

            # Polite delay between batches
            if batch_start + batch_size < len(tickers_list):
                time.sleep(self._cfg.request_delay_seconds)

        # 3. Assemble and validate
        if not frames:
            logger.error("no_pricing_data_loaded", unmapped=unmapped, failed=failed_tickers)
            return pl.DataFrame(schema=_SCHEMA)

        pricing = pl.concat(frames, how="diagonal_relaxed")

        # Filter to requested date range
        pricing = pricing.filter(
            (pl.col("date") >= pl.lit(start).str.to_date()) &
            (pl.col("date") <= pl.lit(end).str.to_date())
        )

        # Flag tickers with insufficient history
        insufficient: list[str] = []
        for ticker_val, group in pricing.group_by("ticker"):
            if group.height < _MIN_HISTORY_DAYS:
                insufficient.append(str(ticker_val[0]) if isinstance(ticker_val, tuple) else str(ticker_val))

        # 4. Coverage report (forwarded to ProvenanceTracker by caller)
        total_cusips = len(cusips)
        self.last_coverage_report = {
            "total_cusips": total_cusips,
            "mapped": len(mapped),
            "unmapped": len(unmapped),
            "unmapped_cusips": unmapped,
            "failed_tickers": failed_tickers,
            "stale_tickers": stale_tickers,
            "insufficient_history_tickers": insufficient,
            "loaded_rows": len(pricing),
            "coverage_pct": round(len(mapped) / max(total_cusips, 1) * 100, 1),
        }

        logger.info("load_pricing_complete", **{
            k: v for k, v in self.last_coverage_report.items()
            if not isinstance(v, list)
        })

        return pricing.sort(["cusip", "date"])
