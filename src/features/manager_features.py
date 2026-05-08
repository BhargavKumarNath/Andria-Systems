"""
Manager Feature Engineering Module.
Aggregates raw 13F Edgar holdings into cross-sectional behavioral features per manager.
Uses DuckDB to process out of core and returns a Polars DataFrame
"""
import duckdb
import polars as pl
import structlog
from typing import Optional

logger = structlog.get_logger()

def build_manager_features(
    db_conn: duckdb.DuckDBPyConnection, 
    source_table: str = "edgar_core_sample"
) -> pl.DataFrame:
    """
    Computes Manager DNA features (HHI, Put Ratio, Log AUM, Conviction) using SQL.
        
    Args:
        db_conn: Active DuckDB connection.
        source_table: Name of the table or view containing sampled EDGAR data.
        
    Returns:
        Polars DataFrame containing[FILINGMANAGER_NAME, avg_hhi, put_ratio, log_aum]
    """
    logger.info("building_manager_features", source_table=source_table)
    
    query = f"""
    WITH PortfolioWeights AS (
        SELECT 
            FILINGMANAGER_NAME, 
            REPORTCALENDARORQUARTER,
            CUSIP,
            CAST(VALUE AS DOUBLE) as value_num,
            exposure_type,
            VALUE / NULLIF(SUM(VALUE) OVER (PARTITION BY FILINGMANAGER_NAME, REPORTCALENDARORQUARTER), 0) AS weight
        FROM {source_table}
        WHERE VALUE > 0
    ),
    QuarterlyAggs AS (
        SELECT 
            FILINGMANAGER_NAME,
            REPORTCALENDARORQUARTER,
            SUM(weight * weight) AS hhi,
            SUM(CASE WHEN exposure_type = 'Put' THEN value_num ELSE 0 END) / NULLIF(SUM(value_num), 0) AS put_ratio,
            SUM(value_num) AS total_aum
        FROM PortfolioWeights
        GROUP BY FILINGMANAGER_NAME, REPORTCALENDARORQUARTER
    )
    SELECT 
        FILINGMANAGER_NAME,
        AVG(hhi) AS avg_hhi,
        AVG(put_ratio) AS avg_put_ratio,
        LN(AVG(total_aum) + 1) AS log_avg_aum,
        COUNT(DISTINCT REPORTCALENDARORQUARTER) AS quarters_active
    FROM QuarterlyAggs
    GROUP BY FILINGMANAGER_NAME
    HAVING quarters_active >= 4 -- Require at least 1 year of history to remove noise
    """
    
    # Execute and fetch directly to Polars (zero-copy via Arrow)
    df = db_conn.execute(query).pl()
    
    # Impute nulls that might arise from 0 divisions safely
    df = df.with_columns([
        pl.col("avg_put_ratio").fill_null(0.0),
        pl.col("avg_hhi").fill_null(0.0)
    ])
    
    logger.info("manager_features_built", manager_count=df.select(pl.len()).item())
    return df
