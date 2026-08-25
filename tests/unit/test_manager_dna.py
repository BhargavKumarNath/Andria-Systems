"""Unit tests for ManagerDNABuilder — position-dynamics and concentration correctness."""
from __future__ import annotations

from pathlib import Path

import duckdb
import polars as pl
import pytest

from andria.core.config import Settings
from andria.core.db import DuckDBConnectionFactory
from andria.features.manager_dna import ManagerDNABuilder

_EDGAR_ROW_DEFAULTS = {
    "INFOTABLE_SK": "1", "NAMEOFISSUER": "ISSUER", "TITLEOFCLASS": "COM",
    "FIGI": None, "SSHPRNAMT": "100", "SSHPRNAMTTYPE": "SH", "PUTCALL": None,
    "INVESTMENTDISCRETION": "SOLE", "OTHERMANAGER": None,
    "VOTING_AUTH_SOLE": "100", "VOTING_AUTH_SHARED": "0", "VOTING_AUTH_NONE": "0",
    "source_file_infotable": "x", "AMENDMENTNO": None, "AMENDMENTTYPE": None,
    "CONFDENIEDEXPIRED": None, "DATEDENIEDEXPIRED": None, "DATEREPORTED": None,
    "REASONFORNONCONFIDENTIALITY": None,
    "FILINGMANAGER_STREET1": None, "FILINGMANAGER_STREET2": None, "FILINGMANAGER_CITY": None,
    "FILINGMANAGER_STATEORCOUNTRY": None, "FILINGMANAGER_ZIPCODE": None, "REPORTTYPE": None,
    "FORM13FFILENUMBER": None, "CRDNUMBER": None, "SECFILENUMBER": None,
    "PROVIDEINFOFORINSTRUCTION5": None, "ADDITIONALINFORMATION": None,
    "source_file_coverpage": "x", "filing_date_parsed": None, "meta_json": None, "meta_file": None,
    "exposure_type": "Equity",
}


def _row(mgr: str, quarter: str, cusip: str, value: float, amendment: str = "false") -> dict:
    return {
        **_EDGAR_ROW_DEFAULTS,
        "ACCESSION_NUMBER": f"{mgr}{quarter}{cusip}",
        "CUSIP": cusip,
        "VALUE": str(value),
        "source_quarter": quarter,
        "REPORTCALENDARORQUARTER": quarter,
        "ISAMENDMENT": amendment,
        "FILINGMANAGER_NAME": mgr,
    }


@pytest.fixture
def dna_result(tmp_path: Path) -> pl.DataFrame:
    """Runs the real ManagerDNABuilder against a small, hand-checkable EDGAR fixture.

    MGR_A holds:
      AAA in Q1, Q2, Q3   -> new at Q1 (first filed qtr), exits after Q3 (absent Q4)
      BBB in Q2, Q3, Q4   -> new at Q2 (not held Q1), never exits (held through last filed qtr)
      CCC in Q4 only      -> new at Q4, right-censored (no next quarter to check for exit)

    Expected over 7 held (cusip, quarter) pairs:
      new_position_rate = 3/7
      exit_rate         = 1/5  (5 non-right-censored pairs; only AAA@Q3 is a true exit)
    """
    rows = [
        _row("MGR_A", "2020Q1", "AAA", 1000.0),
        _row("MGR_A", "2020Q2", "AAA", 1000.0),
        _row("MGR_A", "2020Q3", "AAA", 1000.0),
        _row("MGR_A", "2020Q2", "BBB", 500.0),
        _row("MGR_A", "2020Q3", "BBB", 500.0),
        _row("MGR_A", "2020Q4", "BBB", 500.0),
        _row("MGR_A", "2020Q4", "CCC", 300.0),
    ]
    edgar_dir = tmp_path / "edgar"
    edgar_dir.mkdir(parents=True)
    con = duckdb.connect()
    con.register("df", pl.DataFrame(rows).to_arrow())
    con.execute(f"COPY df TO '{edgar_dir}' (FORMAT PARQUET, PARTITION_BY (source_quarter))")
    con.close()

    cfg = Settings(paths={"processed": tmp_path})
    cfg.features.manager_dna.min_quarters_active = 1
    builder = ManagerDNABuilder(cfg, factory=DuckDBConnectionFactory(memory_limit_gb=2))
    return builder.build()


def test_new_position_rate_uses_prior_filed_quarter(dna_result: pl.DataFrame) -> None:
    row = dna_result.filter(pl.col("manager_name") == "MGR_A").to_dicts()[0]
    assert row["new_position_rate"] == pytest.approx(3 / 7)


def test_exit_rate_excludes_right_censored_last_quarter(dna_result: pl.DataFrame) -> None:
    row = dna_result.filter(pl.col("manager_name") == "MGR_A").to_dicts()[0]
    assert row["exit_rate"] == pytest.approx(1 / 5)


def test_top5_concentration_is_not_a_function_of_hhi(dna_result: pl.DataFrame) -> None:
    row = dna_result.filter(pl.col("manager_name") == "MGR_A").to_dicts()[0]
    # MGR_A never holds more than 2 positions in a quarter, so every position is within
    # the top-5 and weights sum to 1.0 each quarter -> avg top5_concentration == 1.0.
    # Regression guard: this must NOT equal avg_hhi * 2 (the old, incorrect proxy).
    assert row["top5_concentration"] == pytest.approx(1.0)
    assert row["top5_concentration"] != pytest.approx(row["avg_hhi"] * 2.0)
