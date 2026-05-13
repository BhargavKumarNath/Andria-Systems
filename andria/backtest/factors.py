"""Risk Factor Neutralization.

Fetches Fama-French 5-factor + Momentum data and computes orthogonalized idiosyncratic alpha.
"""

from __future__ import annotations
import warnings

import pandas as pd
import pandas_datareader.data as web
import polars as pl
import statsmodels.api as sm
from andria.core.logging import get_logger
logger = get_logger(__name__)


class RiskFactorModel:
    """Neutralizes portfolio returns against systematic risk factors."""

    def __init__(self, start_date: str = "2000-01-01"):
        self.start_date = start_date
        self._factors_df: pl.DataFrame | None = None

    def fetch_factors(self) -> pl.DataFrame:
        """Downloads FF5 + Momentum from Ken French's data library."""
        logger.info("fetching_fama_french_factors", start_date=self.start_date)
        
        try:
            with warnings.catch_warnings():
                warnings.filterwarnings(
                    "ignore",
                    message="The argument 'date_parser' is deprecated",
                    category=FutureWarning,
                )
                # Fama-French 5 Factors Daily
                ff5 = web.DataReader(
                    "F-F_Research_Data_5_Factors_2x3_daily",
                    "famafrench",
                    start=self.start_date,
                )[0]
                # Momentum Daily
                mom = web.DataReader(
                    "F-F_Momentum_Factor_daily",
                    "famafrench",
                    start=self.start_date,
                )[0]
        except Exception as e:
            logger.error("fama_french_download_failed", error=str(e))
            raise RuntimeError(f"Failed to download Fama-French data: {e}")

        # Combine
        ff_combined = ff5.join(mom, how='inner')
        
        # Ken French data is in percentages (e.g. 1.5 = 1.5%). Convert to decimals
        ff_combined = ff_combined / 100.0
        
        # Reset index to get Date column
        ff_combined = ff_combined.reset_index()
        ff_combined.columns = ["date", "mkt_rf", "smb", "hml", "rmw", "cma", "rf", "mom"]
        
        # Convert date to standard datetime.date
        if pd.api.types.is_datetime64_any_dtype(ff_combined["date"]):
            ff_combined["date"] = ff_combined["date"].dt.date
            
        # Convert to Polars
        df = pl.from_pandas(ff_combined)
        
        # To quickly compute the factor return over ANY arbitrary [start, end] holding period
        # without looping, we compute cumulative log returns.
        # factor_return = exp(cum_log[end] - cum_log[start]) - 1
        log_cols = []
        for col in ["mkt_rf", "smb", "hml", "rmw", "cma", "rf", "mom"]:
            log_cols.append((1 + pl.col(col)).log().alias(f"log_{col}"))
            
        df = df.with_columns(log_cols)
        
        cum_cols = []
        for col in ["mkt_rf", "smb", "hml", "rmw", "cma", "rf", "mom"]:
            cum_cols.append(pl.col(f"log_{col}").cum_sum().alias(f"cum_{col}"))
            
        self._factors_df = df.with_columns(cum_cols).sort("date")
        logger.info("fama_french_processed", rows=self._factors_df.height)
        return self._factors_df

    def orthogonalize(self, ledger: pl.DataFrame) -> pl.DataFrame:
        """Extracts idiosyncratic alpha by regressing trade returns against FF5+Mom.
        
        Calculates the exact factor return for each trade's specific holding period
        using cumulative log differences, then runs OLS.
        """
        if self._factors_df is None:
            self.fetch_factors()
            
        req_cols = {"exec_date", "actual_exit_date", "net_fwd_return"}
        if not req_cols.issubset(set(ledger.columns)):
            raise ValueError(f"Ledger missing columns: {req_cols}")

        # Ensure sorted for asof joins
        ledger = ledger.sort("exec_date")
        factors = self._factors_df.sort("date")

        # 1. Join Cumulative Factors at Entry (exec_date)
        cum_factor_cols = [f"cum_{c}" for c in ["mkt_rf", "smb", "hml", "rmw", "cma", "rf", "mom"]]
        
        entry_joined = ledger.join_asof(
            factors.select(["date"] + cum_factor_cols),
            left_on="exec_date",
            right_on="date",
            strategy="backward"
        )
        # Rename cumulative columns to entry_cum_*
        rename_map = {col: f"entry_{col}" for col in cum_factor_cols}
        entry_joined = entry_joined.rename(rename_map).drop(["date"])

        # 2. Join Cumulative Factors at Exit (actual_exit_date)
        entry_joined = entry_joined.sort("actual_exit_date")
        exit_joined = entry_joined.join_asof(
            factors.select(["date"] + cum_factor_cols),
            left_on="actual_exit_date",
            right_on="date",
            strategy="backward"
        )
        # Rename cumulative columns to exit_cum_*
        rename_map = {col: f"exit_{col}" for col in cum_factor_cols}
        final_ledger = exit_joined.rename(rename_map).drop(["date"])

        # 3. Compute Holding Period Factor Returns
        hp_factor_exprs = []
        factor_names = ["mkt_rf", "smb", "hml", "rmw", "cma", "rf", "mom"]
        for f in factor_names:
            # hp_return = exp(exit_cum_log - entry_cum_log) - 1
            expr = (pl.col(f"exit_cum_{f}") - pl.col(f"entry_cum_{f}")).exp() - 1
            hp_factor_exprs.append(expr.alias(f"hp_{f}"))
            
        final_ledger = final_ledger.with_columns(hp_factor_exprs)
        
        # Debug: Count nulls before dropping
        null_counts = {
            "entry_factor_nulls": final_ledger.filter(pl.col("entry_cum_mkt_rf").is_null()).height,
            "exit_factor_nulls": final_ledger.filter(pl.col("exit_cum_mkt_rf").is_null()).height,
            "net_fwd_return_nulls": final_ledger.filter(pl.col("net_fwd_return").is_null()).height,
        }
        logger.info("orthogonalization_pre_drop_stats", **null_counts)

        # Drop rows where we couldn't match factors (e.g. out of bounds)
        final_ledger = final_ledger.with_row_index("_idx")
        reg_data = final_ledger.drop_nulls(subset=[f"hp_{f}" for f in factor_names] + ["net_fwd_return"]).to_pandas()
        
        if len(reg_data) < 10:
            logger.warning("not_enough_data_for_orthogonalization", 
                           trades_survived=len(reg_data),
                           total_ledger=final_ledger.height)
            return final_ledger.drop(["_idx"]).with_columns(pl.lit(None).alias("idiosyncratic_alpha"))

        # 4. Run OLS Regression
        # y = net_fwd_return - rf
        # X = mkt_rf, smb, hml, rmw, cma, mom
        y = reg_data["net_fwd_return"] - reg_data["hp_rf"]
        X = reg_data[["hp_mkt_rf", "hp_smb", "hp_hml", "hp_rmw", "hp_cma", "hp_mom"]]
        X = sm.add_constant(X, has_constant="add")
        
        model = sm.OLS(y, X).fit()
        logger.info("risk_factor_regression_complete", 
                    r_squared=round(float(model.rsquared), 3), 
                    annualized_alpha_bps=round(float(model.params["const"]) * 4 * 10000, 1))
        
        # 5. Extract Idiosyncratic Alpha (Residuals + Intercept)
        # alpha = actual - expected_from_beta
        # expected_from_beta = X * betas (excluding constant)
        betas = model.params.drop("const")
        expected_systematic_return = X.drop(columns=["const"]).dot(betas) + reg_data["hp_rf"]
        
        reg_data["idiosyncratic_alpha"] = reg_data["net_fwd_return"] - expected_systematic_return
        
        # Merge back to Polars using the pre-drop ledger row index.
        alpha_df = pl.DataFrame({"_idx": reg_data["_idx"], "idiosyncratic_alpha": reg_data["idiosyncratic_alpha"]})
        final_ledger = final_ledger.join(alpha_df, on="_idx", how="left").drop(["_idx"])
        
        return final_ledger
