import os
import psutil
import pytest
import polars as pl
from datetime import date
from src.data.quality_checks import check_suspicious_dates, check_null_rates
from src.data.verify_data_summary import verify_dataset_shape

# Fixture to generate a 100 row sample dataset for tests
@pytest.fixture(scope="session")
def sample_edgar_parquet(tmp_path_factory):
    file_path = tmp_path_factory.mktemp("data") / "sample_edgar.parquet"

    df = pl.DataFrame({
        "ACCESSION_NUMBER":[f"0001-{i}" for i in range(100)],
        "PUTCALL":["Call", "Put", None] * 33 + ["Call"],
        "filing_date_parsed":[date(1900, 1, 1) if i < 5 else date(2023, 1, 1) for i in range(100)]
    })
    df.write_parquet(file_path)
    return str(file_path)

def test_check_suspicious_dates(sample_edgar_parquet):
    # Given: A dataset with exactly 5 suspicious dates (1900-01-01)
    
    # When: Executing the quality check
    results = check_suspicious_dates(sample_edgar_parquet, min_date="2010-01-01")

    # Then: Assert expected behavior
    assert results["total_rows"] == 100
    assert results["suspicious_count"] == 5
    assert results["suspicious_pct"] == 5.0

def test_check_null_rates(sample_edgar_parquet):
    # Given: A dataset where ~33% of PUTCALL is null

    # When:
    results = check_null_rates(sample_edgar_parquet, ["PUTCALL"])

    # Then:
    assert results["PUTCALL"] == 33.0

def test_verify_dataset_shape(sample_edgar_parquet):
    # Should pass
    assert verify_dataset_shape(sample_edgar_parquet, 100, 3, tolerance_pct=0.0) is True

    # Should fail column count
    with pytest.raises(ValueError, match="Schema mismatch"):
        verify_dataset_shape(sample_edgar_parquet, 100, 99)
    
    # Should fail now count
    with pytest.raises(ValueError, match="Row count drift"):
        verify_dataset_shape(sample_edgar_parquet, 5000, 3)

def test_memory_constraint_suspicious_dates(sample_edgar_parquet):
    """Ensure the operation stays well under the 12GB constraint"""
    process = psutil.Process(os.getpid())
    mem_before = process.memory_info().rss

    check_suspicious_dates(sample_edgar_parquet)

    mem_after = process.memory_info().rss
    memory_used_mb = (mem_after - mem_before) / (1024 * 1024)

    # Assertion: Uses less than 12 GB (12288 MB). 
    # Because of Polars lazy execution, this should actually be < 50MB.
    assert memory_used_mb < 12288, f"Memory limit exceeded: Used {memory_used_mb} MB"


    