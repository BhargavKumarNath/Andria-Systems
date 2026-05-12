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
        """Compute RACS signals joined with regime probabilities."""
        edgar_path = self._registry.require(self._registry.edgar_processed)
        clusters_path = self._registry.require(self._registry.clustered_managers)

        logger.info("computing_racs_v2", edgar=str(edgar_path), clusters=str(clusters_path))

        # Register the regime dataframe in duckdb so we can join it
        # Since regime_df has a Date column and edgar has source_quarter (e.g. 2021Q1),
        # we need to map them. We'll extract year/quarter from regime_df to match.
        regime_df = regime_df.with_columns(
            [
                pl.col("date").dt.year().cast(pl.Utf8).alias("r_year"),
                pl.col("date").dt.quarter().cast(pl.Utf8).alias("r_qtr"),
            ]
        ).with_columns((pl.col("r_year") + "Q" + pl.col("r_qtr")).alias("source_quarter"))

        with self._factory.connect_parquet(edgar_path, view_name="edgar") as conn:
            # Register DataFrames as views
            conn.register("clusters", clusters_path)
            conn.register("regimes", regime_df.to_arrow())

            # The RACS SQL pipeline
            query = f"""
            WITH Activists AS (
                SELECT manager_name 
                FROM clusters
                WHERE archetype_label LIKE '%Conviction Activists%'
            ),
            ActivistHoldings AS (
                SELECT 
                    e.source_quarter,
                    e.CUSIP,
                    e.FILINGMANAGER_NAME,
                    TRY_CAST(e.VALUE AS DOUBLE) as value_num,
                    TRY_CAST(e.SSHPRNAMT AS DOUBLE) as shares
                FROM edgar e
                JOIN Activists a ON e.FILINGMANAGER_NAME = a.manager_name
                WHERE e.VALUE IS NOT NULL AND TRY_CAST(e.VALUE AS DOUBLE) > 0
                  AND e.exposure_type = 'Equity'
            ),
            QuarterlyTotalAUM AS (
                SELECT 
                    FILINGMANAGER_NAME, 
                    source_quarter, 
                    SUM(value_num) as total_aum
                FROM ActivistHoldings
                GROUP BY 1, 2
            ),
            ActivistWeights AS (
                SELECT 
                    h.source_quarter,
                    h.CUSIP,
                    h.FILINGMANAGER_NAME,
                    h.value_num / t.total_aum as weight
                FROM ActivistHoldings h
                JOIN QuarterlyTotalAUM t 
                  ON h.FILINGMANAGER_NAME = t.FILINGMANAGER_NAME AND h.source_quarter = t.source_quarter
            ),
            -- 1. Raw RACS: consensus conviction
            RawRACS AS (
                SELECT 
                    source_quarter,
                    CUSIP,
                    SUM(weight) as consensus_weight,
                    COUNT(DISTINCT FILINGMANAGER_NAME) as activist_buyers_count,
                    SUM(weight) * LN(COUNT(DISTINCT FILINGMANAGER_NAME) + 1.1) as racs_raw
                FROM ActivistWeights
                GROUP BY 1, 2
                HAVING COUNT(DISTINCT FILINGMANAGER_NAME) >= {self._min_buyers}
            ),
            -- 2. Crowding Penalty: fraction of total institutional managers holding this CUSIP
            TotalHolders AS (
                SELECT 
                    source_quarter,
                    CUSIP,
                    COUNT(DISTINCT FILINGMANAGER_NAME) as total_inst_holders
                FROM edgar
                WHERE TRY_CAST(VALUE AS DOUBLE) > 0 AND exposure_type = 'Equity'
                GROUP BY 1, 2
            ),
            TotalManagersPerQuarter AS (
                SELECT 
                    source_quarter, 
                    COUNT(DISTINCT FILINGMANAGER_NAME) as total_managers
                FROM edgar
                GROUP BY 1
            ),
            Crowding AS (
                SELECT 
                    th.source_quarter,
                    th.CUSIP,
                    th.total_inst_holders,
                    tm.total_managers,
                    CAST(th.total_inst_holders AS DOUBLE) / tm.total_managers as crowding_penalty
                FROM TotalHolders th
                JOIN TotalManagersPerQuarter tm ON th.source_quarter = tm.source_quarter
            ),
            -- 3. Combine with Regime
            Joined AS (
                SELECT 
                    r.source_quarter,
                    r.CUSIP,
                    r.consensus_weight,
                    r.activist_buyers_count,
                    r.racs_raw,
                    c.crowding_penalty,
                    rg.regime_label,
                    rg.regime_prob
                FROM RawRACS r
                JOIN Crowding c ON r.source_quarter = c.source_quarter AND r.CUSIP = c.CUSIP
                LEFT JOIN regimes rg ON r.source_quarter = rg.source_quarter
            )
            SELECT 
                source_quarter,
                CUSIP,
                COALESCE(racs_raw, 0.0) as racs_raw,
                COALESCE(crowding_penalty, 0.0) as crowding_penalty,
                COALESCE(consensus_weight, 0.0) as consensus_weight,
                CAST(COALESCE(activist_buyers_count, 0) AS INTEGER) as activist_buyers_count,
                
                -- Adjust final RACS:
                -- 1. Apply crowding penalty (reduce score if crowded)
                -- 2. Apply regime boost/drag
                racs_raw 
                * (1.0 - COALESCE(crowding_penalty, 0.0))
                * (1.0 + CASE 
                            WHEN regime_label IN ('Goldilocks', 'Recovery') 
                                THEN {self._regime_weight} * COALESCE(regime_prob, 0.0)
                            WHEN regime_label IS NOT NULL
                                THEN -{self._regime_weight} * COALESCE(regime_prob, 0.0)
                            ELSE 0.0 
                         END) as regime_adjusted_racs
            FROM Joined
            """

            df = conn.execute(query).pl()

        validated = RACSContract.validate(df)
        logger.info("racs_signals_computed", rows=len(validated))

        return validated
