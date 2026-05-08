"""
Data Quality Pipeine Module
Provides lazy-evaluated integrity checks on large out of core Parquet files.
"""
import os
from typing import Dict, Any
import polars as pl
import structlog

logger = structlog.get_logger()

def check_suspicious_dates(
        parquet_path: str, date_col: str = "filing_date_parsed", min_date: str = "2010-01-01"
) -> Dict[str, Any]:
    """
    Scans a Parquet dataset to flag rows with suspicious historical dates.
    Uses Polars lazy evaluation to stay well under RAM limits

    Args:
        parquet_path: Glob or path to Parquet files.
        date_col: The date column to inspect.
        min_date: The earliest valid logical date (YYYY-MM-DD).
        
    Returns:
        Dictionary containing counts of suspicious records.
    """
    if not os.path.exists(parquet_path) and "*" not in parquet_path:
        raise FileNotFoundError(f"Dataset not found: {parquet_path}")
    
    logger.info("checking_suspecious_dates", path=parquet_path)

    lf = pl.scan_parquet(parquet_path)
    min_date_val = pl.lit(min_date).str.to_date()

    # Lazy aggregate for memory efficiency
    stats = lf.select([
        pl.len().alias("total_rows"),
        pl.col(date_col).filter(pl.col(date_col) < min_date_val).count().alias("suspicious_count")
    ]).collect()

    total = stats.get_column("total_rows")[0]
    suspicious = stats.get_column("suspicious_count")[0]

    return {
        "total_rows": total,
        "suspicious_count": suspicious,
        "suspicious_pct": round((suspicious / total) * 100, 4) if total > 0 else 0.0
    }

def check_null_rates(parquet_path: str, columns: list[str]) -> Dict[str, float]:
    """
    Calculates exact null percentages for specific columns using streaming.
    """
    lf = pl.scan_parquet(parquet_path)

    exprs = [
        (pl.col(c).is_null().sum() / pl.len() * 100).alias(c) for c in columns
    ]

    result = lf.select(exprs).collect().to_dicts()[0]

    return {
        k: round(v, 2) if isinstance(v, (int, float)) else v
        for k, v in result.items()
    }

