"""Risk Factor Neutralization.

Fetches Fama-French 5-factor + Momentum data, caches to local Parquet,
and computes orthogonalized idiosyncratic alpha for arbitrary holding periods.
"""

from __future__ import annotations

import warnings
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
import pandas_datareader.data as web
import polars as pl
import statsmodels.api as sm

from andria.core.config import get_settings
from andria.core.logging import get_logger

logger = get_logger(__name__)

_FF_CACHE_FILENAME = "ff5_momentum_daily.parquet"
_FF_CACHE_STALE_DAYS = 7


class RiskFactorModel:
    """Neutralizes portfolio returns against Fama-French 5-factor + Momentum."""

    def __init__(self, start_date: str = "2000-01-01") -> None:
        self.start_date = start_date
        cfg = get_settings()
        self._cache_path: Path = cfg.market_data.cache_dir / _FF_CACHE_FILENAME
        self._factors_df: pl.DataFrame | None = None
        self.last_diagnostics: dict[str, float | int | str | bool | None] = {}

    def _cache_is_fresh(self) -> bool:
        if not self._cache_path.exists():
            return False
        mtime = datetime.fromtimestamp(self._cache_path.stat().st_mtime, tz=UTC)
        age_days = (datetime.now(UTC) - mtime).days
        return age_days < _FF_CACHE_STALE_DAYS

    def _load_from_cache(self) -> pl.DataFrame | None:
        if self._cache_path.exists():
            logger.info("ff_factors_cache_hit", path=str(self._cache_path))
            return pl.read_parquet(self._cache_path)
        return None

    def _save_to_cache(self, df: pl.DataFrame) -> None:
        self._cache_path.parent.mkdir(parents=True, exist_ok=True)
        df.write_parquet(self._cache_path, compression="zstd")
        logger.info("ff_factors_cached", path=str(self._cache_path), rows=df.height)

    def fetch_factors(self) -> pl.DataFrame:
        """Downloads (or loads from cache) FF5 + Momentum daily factors."""
        if self._cache_is_fresh():
            cached = self._load_from_cache()
            if cached is not None:
                self._factors_df = cached
                return self._factors_df

        logger.info("fetching_fama_french_factors", start_date=self.start_date)
        try:
            with warnings.catch_warnings():
                warnings.filterwarnings(
                    "ignore",
                    message="The argument 'date_parser' is deprecated",
                    category=FutureWarning,
                )
                ff5 = web.DataReader(
                    "F-F_Research_Data_5_Factors_2x3_daily",
                    "famafrench",
                    start=self.start_date,
                )[0]
                mom = web.DataReader(
                    "F-F_Momentum_Factor_daily",
                    "famafrench",
                    start=self.start_date,
                )[0]
        except Exception as exc:
            # Fall back to stale cache rather than failing entirely
            stale = self._load_from_cache()
            if stale is not None:
                logger.warning("ff_fetch_failed_using_stale_cache", error=str(exc))
                self._factors_df = stale
                return self._factors_df
            raise RuntimeError(f"Failed to download Fama-French data: {exc}") from exc

        ff_combined = ff5.join(mom, how="inner") / 100.0
        ff_combined = ff_combined.reset_index()
        ff_combined.columns = ["date", "mkt_rf", "smb", "hml", "rmw", "cma", "rf", "mom"]

        # pandas_datareader's famafrench daily reader returns a PeriodIndex (dtype
        # "period[D]"), not a DatetimeIndex -- verified live, not just in docs. The
        # is_datetime64_any_dtype branch below is therefore never taken for the real
        # data path, and pl.from_pandas() then silently converts the raw Period column
        # to an Int64 ordinal, which breaks every downstream join_asof against a real
        # Date column ("datatypes of join keys don't match ... date: i64").
        if isinstance(ff_combined["date"].dtype, pd.PeriodDtype):
            ff_combined["date"] = ff_combined["date"].dt.to_timestamp().dt.date
        elif pd.api.types.is_datetime64_any_dtype(ff_combined["date"]):
            ff_combined["date"] = ff_combined["date"].dt.date

        df = pl.from_pandas(ff_combined)

        log_cols = [
            (1 + pl.col(c)).log().alias(f"log_{c}")
            for c in ["mkt_rf", "smb", "hml", "rmw", "cma", "rf", "mom"]
        ]
        cum_cols = [
            pl.col(f"log_{c}").cum_sum().alias(f"cum_{c}")
            for c in ["mkt_rf", "smb", "hml", "rmw", "cma", "rf", "mom"]
        ]
        self._factors_df = df.with_columns(log_cols).with_columns(cum_cols).sort("date")
        self._save_to_cache(self._factors_df)
        logger.info("fama_french_processed", rows=self._factors_df.height)
        return self._factors_df

    def orthogonalize(self, ledger: pl.DataFrame) -> pl.DataFrame:
        """Extracts idiosyncratic alpha via exact holding-period factor attribution."""
        if self._factors_df is None:
            self.fetch_factors()

        req_cols = {"exec_date", "actual_exit_date", "net_fwd_return"}
        if not req_cols.issubset(set(ledger.columns)):
            raise ValueError(f"Ledger missing columns: {req_cols - set(ledger.columns)}")

        # Ledgers arriving here may already carry their own "date" column (e.g. left
        # over from ExecutionEngine's T+1 fill-price asof join) -- verified live, not
        # just theoretical. Each of the two joins below also brings in `factors`'
        # "date" column; left uncleared, the first join's auto-suffixed "date_right"
        # collides with the second join's attempt to create the same suffix, raising
        # "column with name 'date_right' already exists". Drop the join key from each
        # side immediately after use instead of letting it accumulate.
        ledger = ledger.drop("date", strict=False).sort("exec_date")
        factors = self._factors_df.sort("date")  # type: ignore[union-attr]

        cum_cols = [f"cum_{c}" for c in ["mkt_rf", "smb", "hml", "rmw", "cma", "rf", "mom"]]

        entry_joined = ledger.join_asof(
            factors.select(["date"] + cum_cols),
            left_on="exec_date",
            right_on="date",
            strategy="backward",
        ).drop("date")
        entry_joined = entry_joined.rename({c: f"entry_{c}" for c in cum_cols})

        entry_joined = entry_joined.sort("actual_exit_date")
        exit_joined = entry_joined.join_asof(
            factors.select(["date"] + cum_cols),
            left_on="actual_exit_date",
            right_on="date",
            strategy="backward",
        )
        final_ledger = exit_joined.rename({c: f"exit_{c}" for c in cum_cols})

        factor_names = ["mkt_rf", "smb", "hml", "rmw", "cma", "rf", "mom"]
        hp_exprs = [
            ((pl.col(f"exit_cum_{f}") - pl.col(f"entry_cum_{f}")).exp() - 1).alias(f"hp_{f}")
            for f in factor_names
        ]
        final_ledger = final_ledger.with_columns(hp_exprs)

        null_counts = {
            "entry_factor_nulls": final_ledger.filter(pl.col("entry_cum_mkt_rf").is_null()).height,
            "exit_factor_nulls": final_ledger.filter(pl.col("exit_cum_mkt_rf").is_null()).height,
            "net_fwd_return_nulls": final_ledger.filter(pl.col("net_fwd_return").is_null()).height,
        }
        logger.info("orthogonalization_pre_drop_stats", **null_counts)

        final_ledger = final_ledger.with_row_index("_idx")
        reg_data = final_ledger.drop_nulls(
            subset=[f"hp_{f}" for f in factor_names] + ["net_fwd_return"]
        ).to_pandas()

        if len(reg_data) < 10:
            logger.warning(
                "not_enough_data_for_orthogonalization",
                trades_survived=len(reg_data),
                total_ledger=final_ledger.height,
            )
            self.last_diagnostics = {
                "status": "skipped",
                "reason": "not_enough_data",
                "trades_survived": len(reg_data),
                "total_ledger": final_ledger.height,
                "r_squared": None,
                "annualized_alpha_bps": None,
            }
            return final_ledger.drop(["_idx"]).with_columns(
                pl.lit(None).cast(pl.Float64).alias("idiosyncratic_alpha")
            )

        y = reg_data["net_fwd_return"] - reg_data["hp_rf"]
        X = reg_data[["hp_mkt_rf", "hp_smb", "hp_hml", "hp_rmw", "hp_cma", "hp_mom"]]
        X = sm.add_constant(X, has_constant="add")

        model = sm.OLS(y, X).fit()
        r_squared = round(float(model.rsquared), 3)
        annualized_alpha_bps = round(float(model.params["const"]) * 4 * 10_000, 1)
        logger.info(
            "risk_factor_regression_complete",
            r_squared=r_squared,
            annualized_alpha_bps=annualized_alpha_bps,
        )
        self.last_diagnostics = {
            "status": "complete",
            "trades_survived": len(reg_data),
            "total_ledger": final_ledger.height,
            "r_squared": r_squared,
            "annualized_alpha_bps": annualized_alpha_bps,
        }

        betas = model.params.drop("const")
        expected = X.drop(columns=["const"]).dot(betas) + reg_data["hp_rf"]
        reg_data["idiosyncratic_alpha"] = reg_data["net_fwd_return"] - expected

        alpha_df = pl.DataFrame(
            {"_idx": reg_data["_idx"], "idiosyncratic_alpha": reg_data["idiosyncratic_alpha"]}
        )
        return final_ledger.join(alpha_df, on="_idx", how="left").drop(["_idx"])
