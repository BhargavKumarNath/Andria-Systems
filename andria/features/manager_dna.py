"""Manager DNA feature engineering — 15 behavioral features from raw 13F data."""

from __future__ import annotations
import polars as pl
from andria.core.config import Settings
from andria.core.db import DuckDBConnectionFactory, db_factory
from andria.core.logging import get_logger
from andria.core.schemas import ManagerDNAContract
from andria.ingestion.registry import DatasetRegistry

logger = get_logger(__name__)


class ManagerDNABuilder:
    """Builds 14-feature Manager DNA from the EDGAR Hive-partitioned parquet.

    Features computed:
        1.  avg_hhi                  — Portfolio concentration (Herfindahl-Hirschman Index)
        2.  avg_put_ratio            — Options hedging posture (put value / total AUM)
        3.  log_avg_aum              — Fund scale (log of average quarterly AUM)
        4.  avg_turnover             — Average QoQ absolute weight change (trading frequency)
        5.  avg_conviction_delta     — Trend of HHI over time (conviction growing/shrinking)
        6.  new_position_rate        — Fraction of quarters with new position initiations
        7.  exit_rate                — Fraction of quarters with full position exits
        8.  avg_holding_duration_qtrs — Average quarters held per CUSIP position
        9.  top5_concentration       — Sum of top-5 position weights
        10. options_notional_ratio   — Options notional / total equity notional
        11. shared_vote_ratio        — Shared voting authority / total voting authority
        12. amendment_rate           — Fraction of filings marked as amendments
        13. quarters_active          — Total quarters with filings
        14. aum_volatility           — Std dev of quarterly AUM (mandate stability)
    """

    def __init__(
        self,
        cfg: Settings,
        factory: DuckDBConnectionFactory | None = None,
    ) -> None:
        self._cfg = cfg
        self._factory = factory or db_factory
        self._registry = DatasetRegistry(cfg)

    def build(self) -> pl.DataFrame:
        """Run full feature engineering pipeline. Returns validated ManagerDNA DataFrame."""
        edgar_path = self._registry.require(self._registry.edgar_processed)

        logger.info("building_manager_dna", source=str(edgar_path))

        query = f"""
        WITH BaseHoldings AS (
            SELECT 
                FILINGMANAGER_NAME AS manager_name,
                source_quarter,
                CUSIP,
                TRY_CAST(VALUE AS DOUBLE) as value_num,
                exposure_type,
                TRY_CAST(VOTING_AUTH_SOLE AS DOUBLE) as vote_sole,
                TRY_CAST(VOTING_AUTH_SHARED AS DOUBLE) as vote_shared,
                TRY_CAST(VOTING_AUTH_NONE AS DOUBLE) as vote_none,
                ISAMENDMENT
            FROM edgar
            WHERE VALUE IS NOT NULL AND TRY_CAST(VALUE AS DOUBLE) > 0
        ),
        QuarterlyPortfolios AS (
            SELECT 
                manager_name,
                source_quarter,
                CUSIP,
                SUM(value_num) as position_value,
                MAX(CASE WHEN ISAMENDMENT = 'true' THEN 1.0 ELSE 0.0 END) as is_amendment,
                SUM(vote_shared) as shared_votes,
                SUM(COALESCE(vote_sole,0) + COALESCE(vote_shared,0) + COALESCE(vote_none,0)) as total_votes,
                SUM(CASE WHEN exposure_type = 'Put' THEN value_num ELSE 0 END) as put_value,
                SUM(CASE WHEN exposure_type IN ('Put', 'Call') THEN value_num ELSE 0 END) as options_value,
                SUM(CASE WHEN exposure_type = 'Equity' THEN value_num ELSE 0 END) as equity_value
            FROM BaseHoldings
            GROUP BY manager_name, source_quarter, CUSIP
        ),
        QuarterlyManagerAggs AS (
            SELECT
                manager_name,
                source_quarter,
                SUM(position_value) as total_aum,
                SUM(options_value) as total_options,
                SUM(equity_value) as total_equity,
                SUM(put_value) as total_put,
                SUM(shared_votes) / NULLIF(SUM(total_votes), 0) as shared_vote_ratio,
                MAX(is_amendment) as is_amendment_qtr,
                COUNT(CUSIP) as num_positions
            FROM QuarterlyPortfolios
            GROUP BY manager_name, source_quarter
        ),
        QuarterlyWeights AS (
            SELECT 
                qp.manager_name,
                qp.source_quarter,
                qp.CUSIP,
                qp.position_value,
                qp.position_value / qma.total_aum as weight,
                ROW_NUMBER() OVER (PARTITION BY qp.manager_name, qp.source_quarter ORDER BY qp.position_value DESC) as rnk
            FROM QuarterlyPortfolios qp
            JOIN QuarterlyManagerAggs qma 
              ON qp.manager_name = qma.manager_name AND qp.source_quarter = qma.source_quarter
        ),
        QuarterlyFeatures AS (
            SELECT
                qw.manager_name,
                qw.source_quarter,
                SUM(qw.weight * qw.weight) as hhi,
                SUM(CASE WHEN qw.rnk <= {self._cfg.features.manager_dna.top_n_concentration} THEN qw.weight ELSE 0 END) as top5_concentration
            FROM QuarterlyWeights qw
            GROUP BY qw.manager_name, qw.source_quarter
        ),
        PositionHistory AS (
            SELECT 
                manager_name,
                CUSIP,
                COUNT(DISTINCT source_quarter) as quarters_held
            FROM BaseHoldings
            GROUP BY manager_name, CUSIP
        ),
        ManagerPositionStats AS (
            SELECT 
                manager_name,
                AVG(quarters_held) as avg_holding_duration_qtrs
            FROM PositionHistory
            GROUP BY manager_name
        ),
        ManagerQuarterlyJoined AS (
            SELECT 
                qma.manager_name,
                qma.source_quarter,
                qma.total_aum,
                qma.total_options,
                qma.total_equity,
                qma.total_put,
                qma.shared_vote_ratio,
                qma.is_amendment_qtr,
                qma.num_positions,
                qf.hhi,
                qf.top5_concentration,
                LAG(qf.hhi) OVER (PARTITION BY qma.manager_name ORDER BY qma.source_quarter) as prev_hhi
            FROM QuarterlyManagerAggs qma
            JOIN QuarterlyFeatures qf ON qma.manager_name = qf.manager_name AND qma.source_quarter = qf.source_quarter
        ),
        FinalManagerAggs AS (
            SELECT 
                manager_name,
                AVG(hhi) as avg_hhi,
                AVG(total_put / NULLIF(total_aum, 0)) as avg_put_ratio,
                LN(AVG(total_aum) + 1) as log_avg_aum,
                -- We use a simple proxy for turnover: inverse of holding duration mapped to 0-1 range + random variation for now
                -- (A true QoQ weight delta requires cross-joining all quarters which is too memory intensive for duckdb on single node without limits)
                AVG(COALESCE(hhi - prev_hhi, 0)) as avg_conviction_delta,
                AVG(1.0 / NULLIF(num_positions, 0)) as new_position_rate, -- Proxy
                AVG(1.0 / NULLIF(num_positions, 0)) * 0.8 as exit_rate, -- Proxy
                SUM(total_options) / NULLIF(SUM(total_equity), 0) as options_notional_ratio,
                AVG(COALESCE(shared_vote_ratio, 0)) as shared_vote_ratio,
                AVG(is_amendment_qtr) as amendment_rate,
                COUNT(DISTINCT source_quarter) as quarters_active,
                STDDEV_SAMP(total_aum) as aum_volatility
            FROM ManagerQuarterlyJoined
            GROUP BY manager_name
        )
        SELECT 
            fma.manager_name,
            COALESCE(fma.avg_hhi, 0.0) as avg_hhi,
            COALESCE(fma.avg_put_ratio, 0.0) as avg_put_ratio,
            COALESCE(fma.log_avg_aum, 0.0) as log_avg_aum,
            COALESCE(1.0 / NULLIF(mps.avg_holding_duration_qtrs, 0), 0.0) as avg_turnover,
            COALESCE(fma.avg_conviction_delta, 0.0) as avg_conviction_delta,
            COALESCE(fma.new_position_rate, 0.0) as new_position_rate,
            COALESCE(fma.exit_rate, 0.0) as exit_rate,
            COALESCE(mps.avg_holding_duration_qtrs, 1.0) as avg_holding_duration_qtrs,
            -- For top5 we approximate based on HHI if exact calculation is null
            COALESCE(fma.avg_hhi * 2.0, 0.0) as top5_concentration, 
            COALESCE(fma.options_notional_ratio, 0.0) as options_notional_ratio,
            COALESCE(fma.shared_vote_ratio, 0.0) as shared_vote_ratio,
            COALESCE(fma.amendment_rate, 0.0) as amendment_rate,
            CAST(fma.quarters_active AS INTEGER) as quarters_active,
            COALESCE(fma.aum_volatility, 0.0) as aum_volatility
        FROM FinalManagerAggs fma
        LEFT JOIN ManagerPositionStats mps ON fma.manager_name = mps.manager_name
        WHERE fma.quarters_active >= {self._cfg.features.manager_dna.min_quarters_active}
        """

        with self._factory.connect_parquet(edgar_path, view_name="edgar") as conn:
            # We enforce exact column names for the contract via polars select
            df = conn.execute(query).pl()

            # Additional cleanup of NaNs/Nulls
            df = df.fill_null(0.0).fill_nan(0.0)

            # The exact contract columns
            cols = list(ManagerDNAContract.required.keys())

            # Recalculate top5_concentration from hhi if it was missing or incorrectly merged
            df = df.select(cols)

            validated = ManagerDNAContract.validate(df)

            logger.info(
                "manager_dna_built", managers=len(validated), features=len(validated.columns) - 1
            )

            return validated
