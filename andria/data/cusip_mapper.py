"""CUSIP → Ticker mapping via OpenFIGI (Phase 4.1).

SEC's own open data (``company_tickers_exchange.json``) maps CIK → ticker for
*filers*, not CUSIP → ticker for the *securities being held* — it cannot resolve
the CUSIPs appearing in 13F INFOTABLE rows. OpenFIGI's public mapping API
(https://api.openfigi.com/v3/mapping) is Bloomberg's free, keyless CUSIP → FIGI/
ticker crosswalk and is the correct tool for this job; it is rate-limited without
an API key (verified live: the unauthenticated endpoint rejects with HTTP 413
"Request may only contain 10 mapping jobs" above that count, not the 100 some
documentation implies),
which this mapper respects with batching and inter-request delay.

A small hand-curated override table remains as a fast, zero-latency path for the
handful of CUSIPs that dominate 13F dollar-weighted holdings (mega-cap tech), so
a full OpenFIGI round trip isn't needed for the most common lookups.

Cache:
    The resolved mapping is persisted to ``dataset/processed/cusip_ticker_map.parquet``
    and reused on subsequent runs. Refresh by calling ``CUSIPMapper.build(force=True)``.

Usage::

    from andria.data.cusip_mapper import CUSIPMapper
    mapper = CUSIPMapper()
    ticker_map = mapper.resolve(["037833100", "594918104", "UNMAPPED_CUSIP"])
    # {"037833100": "AAPL", "594918104": "MSFT", "UNMAPPED_CUSIP": None}
"""

from __future__ import annotations

import time

import polars as pl
import requests

from andria.core.config import get_settings
from andria.core.logging import get_logger

logger = get_logger(__name__)

_OPENFIGI_URL = "https://api.openfigi.com/v3/mapping"
_OPENFIGI_BATCH_SIZE = 10  # keyless OpenFIGI hard limit; larger batches return HTTP 413
_OPENFIGI_REQUEST_DELAY_SECONDS = 2.5  # keyless OpenFIGI is rate-limited to ~25 req/min
_HEADERS = {"User-Agent": "andria-systems research@andria.local", "Content-Type": "application/json"}

# Preferred exchange codes for picking a single US-listed ticker out of OpenFIGI's
# per-exchange result set for a CUSIP (composite US listing first, then primary venues).
_PREFERRED_EXCH_CODES = ("US", "UN", "UW", "UQ", "UA")


class CUSIPMapper:
    """Resolves CUSIPs to ticker symbols via a static fast-path plus OpenFIGI.

    Unmapped CUSIPs are **never** filled with synthetic data — they are returned
    as ``None`` and left for the caller (``MarketDataLoader`` / ``ProvenanceTracker``)
    to exclude and track explicitly.
    """

    # High-confidence static overrides always applied first (avoids an OpenFIGI
    # round trip for the CUSIPs that dominate 13F dollar-weighted holdings).
    _STATIC_OVERRIDES: dict[str, str] = {
        "037833100": "AAPL",
        "594918104": "MSFT",
        "023135106": "AMZN",
        "02079K305": "GOOGL",
        "67066G104": "NVDA",
        "46625H100": "JPM",
        "882508104": "TSM",
        "70450Y103": "PYPL",
        "30231G102": "XOM",
        "30303M102": "META",
        "912797LA1": "SPY",
    }

    def __init__(self) -> None:
        self._cfg = get_settings().market_data
        self._map: dict[str, str | None] | None = None

    def _load_cache(self) -> bool:
        """Load cached mapping from Parquet. Returns True if cache exists."""
        path = self._cfg.cusip_map_path
        if path.exists():
            df = pl.read_parquet(path)
            self._map = dict(zip(df["cusip"].to_list(), df["ticker"].to_list(), strict=False))
            logger.info("cusip_map_cache_loaded", n_entries=len(self._map))
            return True
        return False

    def _save_cache(self) -> None:
        """Persist the current mapping to Parquet."""
        if self._map is None:
            return
        path = self._cfg.cusip_map_path
        path.parent.mkdir(parents=True, exist_ok=True)
        df = pl.DataFrame({
            "cusip": list(self._map.keys()),
            "ticker": [v for v in self._map.values()],
        })
        df.write_parquet(path, compression="zstd")
        logger.info("cusip_map_cache_saved", path=str(path), n_entries=len(self._map))

    def _pick_ticker(self, matches: list[dict[str, object]]) -> str | None:
        """Pick one ticker from OpenFIGI's per-exchange result set for a single CUSIP."""
        equity = [m for m in matches if m.get("marketSector") == "Equity" and m.get("ticker")]
        if not equity:
            return None
        for code in _PREFERRED_EXCH_CODES:
            for m in equity:
                if m.get("exchCode") == code:
                    return str(m["ticker"])
        return str(equity[0]["ticker"])

    def _resolve_via_openfigi(self, cusips: list[str]) -> dict[str, str | None]:
        """Batch-resolve CUSIPs against OpenFIGI's public mapping endpoint.

        Keyless OpenFIGI accepts at most 10 identifiers per request and is rate-limited;
        batches are separated by ``_OPENFIGI_REQUEST_DELAY_SECONDS`` to stay under it.
        """
        result: dict[str, str | None] = dict.fromkeys(cusips)
        batches = [
            cusips[i : i + _OPENFIGI_BATCH_SIZE]
            for i in range(0, len(cusips), _OPENFIGI_BATCH_SIZE)
        ]
        for batch_idx, batch in enumerate(batches):
            payload = [{"idType": "ID_CUSIP", "idValue": c} for c in batch]
            try:
                resp = requests.post(_OPENFIGI_URL, json=payload, headers=_HEADERS, timeout=30)
                resp.raise_for_status()
                jobs = resp.json()
            except Exception as exc:
                logger.warning(
                    "openfigi_batch_failed", batch=batch_idx, size=len(batch), error=str(exc)
                )
                jobs = [{} for _ in batch]

            for cusip, job in zip(batch, jobs, strict=False):
                matches = job.get("data") if isinstance(job, dict) else None
                result[cusip] = self._pick_ticker(matches) if matches else None

            logger.info(
                "openfigi_batch_resolved",
                batch=f"{batch_idx + 1}/{len(batches)}",
                resolved=sum(1 for v in result.values() if v),
            )
            if batch_idx < len(batches) - 1:
                time.sleep(_OPENFIGI_REQUEST_DELAY_SECONDS)

        return result

    def build(self, force: bool = False) -> None:
        """Build and cache the CUSIP→ticker mapping from the static overrides alone.

        OpenFIGI resolution happens lazily and incrementally in ``resolve()`` — the
        actual CUSIP universe is only known at call time (it depends on which
        managers/positions the pipeline is currently processing), so eagerly
        resolving "everything" here isn't meaningful. ``build()`` seeds the cache
        with the static overrides so ``resolve()`` never round-trips for them.

        Args:
            force: Rebuild even if a cached file exists.
        """
        if not force and self._load_cache():
            return

        logger.info("building_cusip_ticker_map")
        self._map = dict(self._STATIC_OVERRIDES)
        self._save_cache()
        logger.info("cusip_map_seeded", n_static_overrides=len(self._STATIC_OVERRIDES))

    def resolve(self, cusips: list[str]) -> dict[str, str | None]:
        """Return a {cusip: ticker_or_None} mapping for the given CUSIPs.

        CUSIPs already in the static overrides or the on-disk cache are returned
        immediately. Anything new is resolved via OpenFIGI, and the result — hit
        or miss — is written back to the cache so a CUSIP is never re-queried.

        Args:
            cusips: List of 9-character CUSIP strings (case-insensitive).

        Returns:
            Dict mapping each input CUSIP to a ticker symbol, or ``None`` if unmapped.
        """
        if self._map is None and not self._load_cache():
            self.build()
        assert self._map is not None

        cleaned = [c.strip().upper() for c in cusips]
        to_resolve = sorted({c for c in cleaned if c not in self._map})

        if to_resolve:
            logger.info("cusip_openfigi_resolution_start", n_cusips=len(to_resolve))
            resolved = self._resolve_via_openfigi(to_resolve)
            self._map.update(resolved)
            self._save_cache()

        result: dict[str, str | None] = {}
        unmapped: list[str] = []
        for original, clean in zip(cusips, cleaned, strict=False):
            ticker = self._map.get(clean)
            result[original] = ticker
            if ticker is None:
                unmapped.append(original)

        if unmapped:
            logger.warning(
                "cusip_unmapped",
                count=len(unmapped),
                examples=unmapped[:5],
                note="Unmapped CUSIPs will be excluded from real-data backtest",
            )

        return result

    @property
    def mapped_count(self) -> int:
        """Number of CUSIPs with a resolved ticker."""
        if self._map is None:
            return 0
        return sum(1 for v in self._map.values() if v is not None)
