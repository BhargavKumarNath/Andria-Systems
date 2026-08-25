"""Unit tests for RACSEngine.

Regression test for a real bug found while running the pipeline against live data:
`conn.execute(f\"\"\"  # nosec B608` placed the bandit-suppression comment *inside*
the SQL string literal (after the opening triple-quote) rather than before it, so
every RACSEngine.compute() call crashed with a DuckDB ParserException on the literal
'#' character. No existing test invoked RACSEngine end-to-end, so this shipped
undetected — the RACS engine could never actually run.
"""
from __future__ import annotations

from datetime import date
from pathlib import Path

import duckdb
import polars as pl
import pytest

from andria.core.config import Settings
from andria.core.db import DuckDBConnectionFactory
from andria.signals.racs import RACSEngine

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


def _row(mgr: str, quarter: str, cusip: str, value: float) -> dict:
    return {
        **_EDGAR_ROW_DEFAULTS,
        "ACCESSION_NUMBER": f"{mgr}{quarter}{cusip}",
        "CUSIP": cusip,
        "VALUE": str(value),
        "source_quarter": quarter,
        "REPORTCALENDARORQUARTER": quarter,
        "ISAMENDMENT": "false",
        "FILINGMANAGER_NAME": mgr,
    }


@pytest.fixture
def racs_result(tmp_path: Path) -> pl.DataFrame:
    # Two "Conviction Activists" both buy AAA in 2020Q1 (qualifies: >= 2 buyers);
    # only one manager buys BBB (should be excluded by min_activist_buyers=2).
    rows = [
        _row("ACTIVIST_A", "2020Q1", "AAA", 1000.0),
        _row("ACTIVIST_B", "2020Q1", "AAA", 1000.0),
        _row("ACTIVIST_A", "2020Q1", "BBB", 500.0),
        _row("PASSIVE_C", "2020Q1", "AAA", 5000.0),
        # Holds an unrelated CUSIP so AAA isn't 100% crowded (3/3 holders would
        # otherwise zero out regime_adjusted_racs via the (1 - crowding_penalty) term).
        _row("PASSIVE_D", "2020Q1", "CCC", 200.0),
    ]
    edgar_dir = tmp_path / "edgar"
    edgar_dir.mkdir(parents=True)
    con = duckdb.connect()
    con.register("df", pl.DataFrame(rows).to_arrow())
    con.execute(f"COPY df TO '{edgar_dir}' (FORMAT PARQUET, PARTITION_BY (source_quarter))")
    con.close()

    clusters_df = pl.DataFrame({
        "manager_name": ["ACTIVIST_A", "ACTIVIST_B", "PASSIVE_C"],
        "archetype_label": ["Conviction Activists", "Conviction Activists", "Index Huggers"],
    })
    clusters_path = tmp_path / "clustered_managers.parquet"
    clusters_df.write_parquet(clusters_path)

    regime_df = pl.DataFrame({
        "date": [date(2020, 3, 31)],
        "regime_label": ["Goldilocks"],
        "regime_prob": [0.9],
    })

    cfg = Settings(paths={"processed": tmp_path, "artifacts": tmp_path / "artifacts"})
    (tmp_path / "artifacts" / "clusters").mkdir(parents=True)
    clusters_df.write_parquet(tmp_path / "artifacts" / "clusters" / "clustered_managers.parquet")

    engine = RACSEngine(cfg, factory=DuckDBConnectionFactory(memory_limit_gb=1))
    return engine.compute(regime_df)


def test_racs_compute_runs_without_sql_syntax_error(racs_result: pl.DataFrame) -> None:
    # This alone would have caught the # nosec B608-inside-string-literal bug:
    # the buggy version raised duckdb.ParserException before ever returning.
    assert racs_result.height >= 1


def test_racs_excludes_single_buyer_positions(racs_result: pl.DataFrame) -> None:
    # BBB has only one activist buyer (ACTIVIST_A) and min_activist_buyers=2, so it
    # must not appear in the output at all.
    assert "BBB" not in racs_result["cusip"].to_list()


def test_racs_includes_qualifying_consensus_position(racs_result: pl.DataFrame) -> None:
    row = racs_result.filter(pl.col("cusip") == "AAA").to_dicts()[0]
    assert row["activist_buyers"] == 2
    assert row["regime_label"] == "Goldilocks"
    assert row["regime_adjusted_racs"] > 0
