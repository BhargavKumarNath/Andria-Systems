"""
Data Summary Verification Layer.
Prevents drift by cross-checking actual parquet statistics against expected schemas.
"""
import polars as pl


def verify_dataset_shape(parquet_path: str, expected_rows: int, expected_cols: int, tolerance_pct: float = 0.01) -> bool:
    """
    Verifies that the preprocessed dataset matches the expected summary statistics.

    Args:
        parquet_path: Path to dataset.
        expected_rows: The exact row count expected (e.g. from data_summary.txt).
        expected_cols: The exact column count expected.
        tolerance_pct: Acceptable drift in row count.
        
    Returns:
        True if within tolerance, raises ValueError otherwise.
    """
    lf = pl.scan_parquet(parquet_path)
    actual_cols = len(lf.collect_schema().names())
    actual_rows = lf.select(pl.len()).collect().item()

    if actual_cols != expected_cols:
        raise ValueError(f"Schema mismatch. Expected {expected_cols} cols, got {actual_cols}")
    
    diff_pct = abs(actual_rows - expected_rows) / expected_rows
    if diff_pct > tolerance_pct:
        raise ValueError(f"Row count drift detected. Expected ~{expected_rows}, got {actual_rows} (Drift: {diff_pct:.2%})")

    return True
