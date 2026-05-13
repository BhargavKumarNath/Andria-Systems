"""RACS v2 — Regime-Conditioned Activist Conviction Score."""

from __future__ import annotations
import polars as pl
from andria.core.config import Settings
from andria.core.db import DuckDBConnectionFactory, db_factory
from andria.core.logging import get_logger
from andria.core.schemas import RACSContract
from andria.ingestion.registry import DatasetRegistry

logger = get_logger(__name__)


class RACSEngine:
    """Computes regime-conditioned RACS signals from EDGAR + clustering artifacts.

    Pipeline:
    1. Identify 'Conviction Activists' from the clustered manager artifact.
    2. Aggregate their positions from EDGAR to calculate `consensus_weight` and count `activist_buyers_count`.
    3. Calculate `racs_raw` = consensus_weight * log(activist_buyers_count).
    4. Compute `crowding_penalty` (Gini coefficient proxy or total institutional owners).
    5. Join with `regime_df`. Define an 'activism_favorable' regime mask
       (e.g., 'Goldilocks' or 'Recovery').
    6. Calculate `regime_adjusted_racs` = racs_raw * (1 - crowding_penalty) * (1 + regime_weight * regime_confidence).
    """

    def __init__(self, cfg: Settings, factory: DuckDBConnectionFactory | None = None) -> None:
        self._cfg = cfg
        self._factory = factory or db_factory
        self._registry = DatasetRegistry(cfg)

        self._min_buyers = self._cfg.signals.racs.min_activist_buyers
        self._regime_weight = self._cfg.signals.racs.regime_weight

        # Favorable regimes for activist outperformance
        self._favorable_regimes = ["Goldilocks", "Recovery"]

    def compute(self, regime_df: pl.DataFrame) -> pl.DataFrame:
        """Compute RACS signals joined with regime probabilities.

        Uses staged temporary tables to keep memory within safe limits.
        """
        edgar_path = self._registry.require(self._registry.edgar_processed)
        clusters_path = self._registry.require(self._registry.clustered_managers)

        logger.info("computing_racs_v2", edgar=str(edgar_path), clusters=str(clusters_path))

        # Register the regime dataframe in duckdb so we can join it
        # Since regime_df has a Date column and edgar has source_quarter (e.g. 2021Q1),
        # We'll extract year/quarter from regime_df to match.
        regime_df = regime_df.with_columns(
            [
                pl.col("date").dt.year().cast(pl.Utf8).alias("r_year"),
                pl.col("date").dt.quarter().cast(pl.Utf8).alias("r_qtr"),
            ]
        ).with_columns((pl.col("r_year") + "Q" + pl.col("r_qtr")).alias("source_quarter"))

        with self._factory.connect_parquet(edgar_path, view_name="edgar") as conn:
            # Register DataFrames as views
            clusters_df = pl.read_parquet(clusters_path)
            conn.register("clusters", clusters_df.to_arrow())
            conn.register("regimes", regime_df.to_arrow())

            # Stage 1: Identify activist managers (tiny result)
            logger.info("racs_stage", stage="1/5", detail="identifying activist managers")
            conn.execute("""
                CREATE TEMP TABLE activists AS
                SELECT manager_name
                FROM clusters
                WHERE archetype_label LIKE '%Conviction Activists%'
            """)
            n_act = conn.execute("SELECT COUNT(*) FROM activists").fetchone()[0]
            logger.info("racs_stage_done", stage="1/5", activist_count=n_act)

            # Stage 2: Activist holdings + weights (filtered subset)
            logger.info("racs_stage", stage="2/5", detail="computing activist weights")
            conn.execute("""
                CREATE TEMP TABLE activist_weights AS
                WITH holdings AS (
                    SELECT
                        e.source_quarter,
                        e.CUSIP,
                        e.FILINGMANAGER_NAME,
                        TRY_CAST(e.VALUE AS DOUBLE) AS value_num
                    FROM edgar e
                    JOIN activists a ON e.FILINGMANAGER_NAME = a.manager_name
                    WHERE e.VALUE IS NOT NULL AND TRY_CAST(e.VALUE AS DOUBLE) > 0
                      AND e.exposure_type = 'Equity'
                ),
                quarterly_aum AS (
                    SELECT FILINGMANAGER_NAME, source_quarter, SUM(value_num) AS total_aum
                    FROM holdings
                    GROUP BY 1, 2
                )
                SELECT
                    h.source_quarter,
                    h.CUSIP,
                    h.FILINGMANAGER_NAME,
                    h.value_num / qa.total_aum AS weight
                FROM holdings h
                JOIN quarterly_aum qa
                  ON h.FILINGMANAGER_NAME = qa.FILINGMANAGER_NAME
                 AND h.source_quarter = qa.source_quarter
            """)
            logger.info("racs_stage_done", stage="2/5")

            # Stage 3: Raw RACS scores (small – one row per CUSIP/quarter)
            logger.info("racs_stage", stage="3/5", detail="computing raw RACS scores")
            conn.execute(f"""
                CREATE TEMP TABLE raw_racs AS
                SELECT
                    source_quarter,
                    CUSIP,
                    SUM(weight)                                                    AS consensus_weight,
                    COUNT(DISTINCT FILINGMANAGER_NAME)                              AS activist_buyers_count,
                    SUM(weight) * LN(COUNT(DISTINCT FILINGMANAGER_NAME) + 1.1)     AS racs_raw
                FROM activist_weights
                GROUP BY 1, 2
                HAVING COUNT(DISTINCT FILINGMANAGER_NAME) >= {self._min_buyers}
            """)
            # Free activist_weights
            conn.execute("DROP TABLE activist_weights")
            logger.info("racs_stage_done", stage="3/5")

            # Stage 4: Crowding penalty (only for relevant CUSIPs)
            logger.info("racs_stage", stage="4/5", detail="computing crowding penalty")
            conn.execute("""
                CREATE TEMP TABLE crowding AS
                WITH total_holders AS (
                    SELECT source_quarter, CUSIP,
                           COUNT(DISTINCT FILINGMANAGER_NAME) AS total_inst_holders
                    FROM edgar
                    WHERE CUSIP IN (SELECT DISTINCT CUSIP FROM raw_racs)
                      AND TRY_CAST(VALUE AS DOUBLE) > 0 AND exposure_type = 'Equity'
                    GROUP BY 1, 2
                ),
                total_mgrs AS (
                    SELECT source_quarter, COUNT(DISTINCT FILINGMANAGER_NAME) AS total_managers
                    FROM edgar
                    GROUP BY 1
                )
                SELECT
                    th.source_quarter,
                    th.CUSIP,
                    CAST(th.total_inst_holders AS DOUBLE) / tm.total_managers AS crowding_penalty
                FROM total_holders th
                JOIN total_mgrs tm ON th.source_quarter = tm.source_quarter
            """)
            logger.info("racs_stage_done", stage="4/5")

            # Stage 5: Final join with regime + score adjustment
            logger.info("racs_stage", stage="5/5", detail="joining with regime and final scoring")
            df = conn.execute(f"""
                SELECT
                    r.source_quarter                                         AS quarter,
                    r.CUSIP                                                  AS cusip,
                    CAST(COALESCE(r.activist_buyers_count, 0) AS INTEGER)    AS activist_buyers,
                    CAST(COALESCE(r.activist_buyers_count, 0) AS INTEGER)    AS strong_buys,
                    COALESCE(r.consensus_weight, 0.0)                        AS total_activist_value,
                    CAST(COALESCE(r.activist_buyers_count, 0) AS INTEGER)    AS total_funds,
                    COALESCE(r.racs_raw, 0.0)                                AS conviction_raw,
                    COALESCE(c.crowding_penalty, 0.0)                        AS crowding_penalty,
                    COALESCE(r.consensus_weight, 0.0)                        AS racs_score,
                    COALESCE(rg.regime_label, 'Unknown')                     AS regime_label,
                    r.racs_raw
                    * (1.0 - COALESCE(c.crowding_penalty, 0.0))
                    * (1.0 + CASE
                                WHEN rg.regime_label IN ('Goldilocks', 'Recovery')
                                    THEN {self._regime_weight} * COALESCE(rg.regime_prob, 0.0)
                                WHEN rg.regime_label IS NOT NULL
                                    THEN -{self._regime_weight} * COALESCE(rg.regime_prob, 0.0)
                                ELSE 0.0
                             END)                                            AS regime_adjusted_racs
                FROM raw_racs r
                JOIN crowding c ON r.source_quarter = c.source_quarter AND r.CUSIP = c.CUSIP
                LEFT JOIN regimes rg ON r.source_quarter = rg.source_quarter
            """).pl()
            logger.info("racs_stage_done", stage="5/5")

        validated = RACSContract.validate(df)
        logger.info("racs_signals_computed", rows=len(validated))

        return validated

