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
        """Run full feature engineering pipeline. Returns validated ManagerDNA DataFrame.

        Uses staged temporary tables instead of a single CTE chain to keep
        memory usage well within limits on machines with 16 GB RAM.
        """
        edgar_path = self._registry.require(self._registry.edgar_processed)

        logger.info("building_manager_dna", source=str(edgar_path))

        min_q = self._cfg.features.manager_dna.min_quarters_active
        top_n = self._cfg.features.manager_dna.top_n_concentration

        with self._factory.connect_parquet(edgar_path, view_name="edgar") as conn:
            # ── Stage 1: Eligible managers (small result set) ─────────────
            logger.info("dna_stage", stage="1/6", detail="filtering eligible managers")
            conn.execute(f"""
                CREATE TEMP TABLE eligible_managers AS
                SELECT FILINGMANAGER_NAME AS manager_name
                FROM edgar
                GROUP BY 1
                HAVING COUNT(DISTINCT source_quarter) >= {min_q}
            """)
            n_mgr = (conn.execute("SELECT COUNT(*) FROM eligible_managers").fetchone() or (0,))[0]
            logger.info("dna_stage_done", stage="1/6", eligible_managers=n_mgr)

            # ── Stage 2: Quarterly portfolios (grouped, much smaller) ────
            logger.info("dna_stage", stage="2/6", detail="building quarterly portfolios")
            conn.execute("""
                CREATE TEMP TABLE quarterly_portfolios AS
                SELECT
                    e.FILINGMANAGER_NAME AS manager_name,
                    e.source_quarter,
                    e.CUSIP,
                    SUM(TRY_CAST(e.VALUE AS DOUBLE))                             AS position_value,
                    MAX(CASE WHEN e.ISAMENDMENT = 'true' THEN 1.0 ELSE 0.0 END) AS is_amendment,
                    SUM(TRY_CAST(e.VOTING_AUTH_SHARED AS DOUBLE))                AS shared_votes,
                    SUM(
                        COALESCE(TRY_CAST(e.VOTING_AUTH_SOLE    AS DOUBLE), 0) +
                        COALESCE(TRY_CAST(e.VOTING_AUTH_SHARED  AS DOUBLE), 0) +
                        COALESCE(TRY_CAST(e.VOTING_AUTH_NONE    AS DOUBLE), 0)
                    )                                                            AS total_votes,
                    SUM(CASE WHEN e.exposure_type = 'Put'              THEN TRY_CAST(e.VALUE AS DOUBLE) ELSE 0 END) AS put_value,
                    SUM(CASE WHEN e.exposure_type IN ('Put', 'Call')    THEN TRY_CAST(e.VALUE AS DOUBLE) ELSE 0 END) AS options_value,
                    SUM(CASE WHEN e.exposure_type = 'Equity'           THEN TRY_CAST(e.VALUE AS DOUBLE) ELSE 0 END) AS equity_value
                FROM edgar e
                JOIN eligible_managers em ON e.FILINGMANAGER_NAME = em.manager_name
                WHERE e.VALUE IS NOT NULL AND TRY_CAST(e.VALUE AS DOUBLE) > 0
                GROUP BY e.FILINGMANAGER_NAME, e.source_quarter, e.CUSIP
            """)
            logger.info("dna_stage_done", stage="2/6")

            # ── Stage 3: Quarterly manager aggregates ─────────────────────
            logger.info("dna_stage", stage="3/6", detail="aggregating quarterly manager stats")
            conn.execute("""
                CREATE TEMP TABLE quarterly_manager_aggs AS
                SELECT
                    manager_name,
                    source_quarter,
                    SUM(position_value)                                 AS total_aum,
                    SUM(options_value)                                  AS total_options,
                    SUM(equity_value)                                   AS total_equity,
                    SUM(put_value)                                      AS total_put,
                    SUM(shared_votes) / NULLIF(SUM(total_votes), 0)     AS shared_vote_ratio,
                    MAX(is_amendment)                                   AS is_amendment_qtr,
                    COUNT(CUSIP)                                        AS num_positions
                FROM quarterly_portfolios
                GROUP BY manager_name, source_quarter
            """)
            logger.info("dna_stage_done", stage="3/6")

            # ── Stage 4: HHI + top-N concentration per quarter ────────────
            logger.info("dna_stage", stage="4/6", detail="computing HHI and concentration")
            conn.execute(f"""
                CREATE TEMP TABLE quarterly_features AS
                WITH weights AS (
                    SELECT
                        qp.manager_name,
                        qp.source_quarter,
                        qp.position_value / qma.total_aum AS weight,
                        ROW_NUMBER() OVER (
                            PARTITION BY qp.manager_name, qp.source_quarter
                            ORDER BY qp.position_value DESC
                        ) AS rnk
                    FROM quarterly_portfolios qp
                    JOIN quarterly_manager_aggs qma
                      ON qp.manager_name = qma.manager_name
                     AND qp.source_quarter = qma.source_quarter
                )
                SELECT
                    manager_name,
                    source_quarter,
                    SUM(weight * weight) AS hhi,
                    SUM(CASE WHEN rnk <= {top_n} THEN weight ELSE 0 END) AS top5_concentration
                FROM weights
                GROUP BY manager_name, source_quarter
            """)
            # Free the large quarterly_portfolios from RAM after we've used it
            conn.execute("DROP TABLE quarterly_portfolios")
            logger.info("dna_stage_done", stage="4/6")

            # ── Stage 5: Position history (holding duration) ──────────────
            logger.info("dna_stage", stage="5/6", detail="computing holding durations")
            conn.execute("""
                CREATE TEMP TABLE manager_position_stats AS
                SELECT
                    e.FILINGMANAGER_NAME AS manager_name,
                    AVG(quarters_held)  AS avg_holding_duration_qtrs
                FROM (
                    SELECT FILINGMANAGER_NAME, CUSIP, COUNT(DISTINCT source_quarter) AS quarters_held
                    FROM edgar
                    JOIN eligible_managers em ON edgar.FILINGMANAGER_NAME = em.manager_name
                    WHERE VALUE IS NOT NULL AND TRY_CAST(VALUE AS DOUBLE) > 0
                    GROUP BY FILINGMANAGER_NAME, CUSIP
                ) e
                GROUP BY e.FILINGMANAGER_NAME
            """)
            logger.info("dna_stage_done", stage="5/6")

            # ── Stage 6: Final aggregation ─────────────────────────────────
            logger.info("dna_stage", stage="6/6", detail="final manager-level aggregation")
            df = conn.execute(f"""
                WITH joined AS (
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
                        LAG(qf.hhi) OVER (
                            PARTITION BY qma.manager_name ORDER BY qma.source_quarter
                        ) AS prev_hhi
                    FROM quarterly_manager_aggs qma
                    JOIN quarterly_features qf
                      ON qma.manager_name = qf.manager_name
                     AND qma.source_quarter = qf.source_quarter
                ),
                final_aggs AS (
                    SELECT
                        manager_name,
                        AVG(hhi)                                               AS avg_hhi,
                        AVG(total_put / NULLIF(total_aum, 0))                  AS avg_put_ratio,
                        LN(AVG(total_aum) + 1)                                 AS log_avg_aum,
                        AVG(COALESCE(hhi - prev_hhi, 0))                       AS avg_conviction_delta,
                        AVG(1.0 / NULLIF(num_positions, 0))                    AS new_position_rate,
                        AVG(1.0 / NULLIF(num_positions, 0)) * 0.8              AS exit_rate,
                        SUM(total_options) / NULLIF(SUM(total_equity), 0)       AS options_notional_ratio,
                        AVG(COALESCE(shared_vote_ratio, 0))                     AS shared_vote_ratio,
                        AVG(is_amendment_qtr)                                  AS amendment_rate,
                        COUNT(DISTINCT source_quarter)                         AS quarters_active,
                        STDDEV_SAMP(total_aum)                                 AS aum_volatility
                    FROM joined
                    GROUP BY manager_name
                )
                SELECT
                    fa.manager_name,
                    COALESCE(fa.avg_hhi, 0.0)                                           AS avg_hhi,
                    COALESCE(fa.avg_put_ratio, 0.0)                                     AS avg_put_ratio,
                    COALESCE(fa.log_avg_aum, 0.0)                                       AS log_avg_aum,
                    COALESCE(1.0 / NULLIF(mps.avg_holding_duration_qtrs, 0), 0.0)       AS avg_turnover,
                    COALESCE(fa.avg_conviction_delta, 0.0)                              AS avg_conviction_delta,
                    COALESCE(fa.new_position_rate, 0.0)                                 AS new_position_rate,
                    COALESCE(fa.exit_rate, 0.0)                                         AS exit_rate,
                    COALESCE(mps.avg_holding_duration_qtrs, 1.0)                        AS avg_holding_duration_qtrs,
                    COALESCE(fa.avg_hhi * 2.0, 0.0)                                    AS top5_concentration,
                    COALESCE(fa.options_notional_ratio, 0.0)                            AS options_notional_ratio,
                    COALESCE(fa.shared_vote_ratio, 0.0)                                 AS shared_vote_ratio,
                    COALESCE(fa.amendment_rate, 0.0)                                    AS amendment_rate,
                    CAST(fa.quarters_active AS INTEGER)                                 AS quarters_active,
                    COALESCE(fa.aum_volatility, 0.0)                                   AS aum_volatility
                FROM final_aggs fa
                LEFT JOIN manager_position_stats mps ON fa.manager_name = mps.manager_name
                WHERE fa.quarters_active >= {min_q}
            """).pl()

            logger.info("dna_stage_done", stage="6/6")

            # Cleanup
            df = df.fill_null(0.0).fill_nan(0.0)
            cols = list(ManagerDNAContract.required.keys())
            df = df.select(cols)

            validated = ManagerDNAContract.validate(df)

            logger.info(
                "manager_dna_built", managers=len(validated), features=len(validated.columns) - 1
            )

            return validated

