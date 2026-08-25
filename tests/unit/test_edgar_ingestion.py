"""EDGARIngester: source_quarter must reflect the true report period, not the filing batch.

Regression test for a real bug found while ingesting live SEC data: current bulk 13F
zips are packaged as rolling filing-received windows (e.g. "01sep2024-30nov2024"), and
a single batch routinely contains late amendments spanning many distinct report quarters.
Deriving source_quarter from the batch directory name (the original implementation)
silently mislabels every non-primary-quarter row.
"""
from __future__ import annotations

from pathlib import Path

from andria.core.config import Settings
from andria.ingestion.edgar import EDGARIngester

_INFOTABLE_HEADER = (
    "ACCESSION_NUMBER\tINFOTABLE_SK\tNAMEOFISSUER\tTITLEOFCLASS\tCUSIP\tFIGI\tVALUE\t"
    "SSHPRNAMT\tSSHPRNAMTTYPE\tPUTCALL\tINVESTMENTDISCRETION\tOTHERMANAGER\t"
    "VOTING_AUTH_SOLE\tVOTING_AUTH_SHARED\tVOTING_AUTH_NONE"
)
_COVERPAGE_HEADER = (
    "ACCESSION_NUMBER\tREPORTCALENDARORQUARTER\tISAMENDMENT\tAMENDMENTNO\tAMENDMENTTYPE\t"
    "CONFDENIEDEXPIRED\tDATEDENIEDEXPIRED\tDATEREPORTED\tREASONFORNONCONFIDENTIALITY\t"
    "FILINGMANAGER_NAME\tFILINGMANAGER_STREET1\tFILINGMANAGER_STREET2\tFILINGMANAGER_CITY\t"
    "FILINGMANAGER_STATEORCOUNTRY\tFILINGMANAGER_ZIPCODE\tREPORTTYPE\tFORM13FFILENUMBER\t"
    "CRDNUMBER\tSECFILENUMBER\tPROVIDEINFOFORINSTRUCTION5\tADDITIONALINFORMATION"
)


def _infotable_row(accession: str, cusip: str, value: str) -> str:
    return f"{accession}\t1\tISSUER\tCOM\t{cusip}\t\t{value}\t100\tSH\t\tSOLE\t\t100\t0\t0"


def _coverpage_row(accession: str, report_quarter: str, is_amendment: str, mgr: str) -> str:
    return (
        f"{accession}\t{report_quarter}\t{is_amendment}\t\t\t\t\t\t\t{mgr}\t"
        "STREET\t\tCITY\tNY\t10001\t13F HOLDINGS REPORT\t028-00000\t\t\tN\t"
    )


def test_source_quarter_derived_from_reportcalendarorquarter_not_batch_dir(tmp_path: Path) -> None:
    # One real-world-style batch directory ("01sep2024-30nov2024") containing:
    #  - a primary Q3-2024 filing
    #  - a late amendment that actually reports on Q1-2020
    batch_dir = tmp_path / "raw" / "01sep2024-30nov2024"
    batch_dir.mkdir(parents=True)

    (batch_dir / "INFOTABLE.tsv").write_text(
        "\n".join([
            _INFOTABLE_HEADER,
            _infotable_row("ACC-PRIMARY", "037833100", "1000000"),
            _infotable_row("ACC-OLD-AMENDMENT", "594918104", "2000000"),
        ])
    )
    (batch_dir / "COVERPAGE.tsv").write_text(
        "\n".join([
            _COVERPAGE_HEADER,
            _coverpage_row("ACC-PRIMARY", "30-SEP-2024", "false", "Current Capital"),
            _coverpage_row("ACC-OLD-AMENDMENT", "31-MAR-2020", "true", "Legacy Capital"),
        ])
    )

    cfg = Settings(paths={"raw_edgar": batch_dir.parent, "processed": tmp_path / "processed"})
    ingester = EDGARIngester(cfg)
    out_dir = ingester.run()

    import polars as pl
    df = pl.read_parquet(out_dir, hive_partitioning=True)

    primary = df.filter(pl.col("ACCESSION_NUMBER") == "ACC-PRIMARY").to_dicts()[0]
    old_amendment = df.filter(pl.col("ACCESSION_NUMBER") == "ACC-OLD-AMENDMENT").to_dicts()[0]

    assert primary["source_quarter"] == "2024Q3"
    # The critical regression check: this row must NOT be mislabeled "2024Q3" just
    # because it happened to be filed inside the "01sep2024-30nov2024" batch.
    assert old_amendment["source_quarter"] == "2020Q1"
    assert old_amendment["source_quarter"] != primary["source_quarter"]

    # Hive partitions on disk should reflect the corrected quarter, not the raw batch label.
    partition_dirs = {p.name for p in out_dir.iterdir() if p.is_dir()}
    assert partition_dirs == {"source_quarter=2024Q3", "source_quarter=2020Q1"}


def test_min_valid_date_drops_malformed_report_dates(tmp_path: Path) -> None:
    """Real bug found on live SEC data: a handful of filings have malformed
    REPORTCALENDARORQUARTER values (e.g. year 1900 typos). ingest.min_valid_date
    is documented as a data-quality gate but was never actually applied."""
    batch_dir = tmp_path / "raw" / "2020q1"
    batch_dir.mkdir(parents=True)

    (batch_dir / "INFOTABLE.tsv").write_text(
        "\n".join([
            _INFOTABLE_HEADER,
            _infotable_row("ACC-GOOD", "037833100", "1000000"),
            _infotable_row("ACC-GARBAGE-DATE", "594918104", "2000000"),
        ])
    )
    (batch_dir / "COVERPAGE.tsv").write_text(
        "\n".join([
            _COVERPAGE_HEADER,
            _coverpage_row("ACC-GOOD", "31-MAR-2020", "false", "Real Capital"),
            _coverpage_row("ACC-GARBAGE-DATE", "31-MAR-1900", "false", "Typo Capital"),
        ])
    )

    cfg = Settings(paths={"raw_edgar": batch_dir.parent, "processed": tmp_path / "processed"})
    cfg.ingest.min_valid_date = "2004-01-01"
    ingester = EDGARIngester(cfg)
    out_dir = ingester.run()

    import polars as pl
    df = pl.read_parquet(out_dir, hive_partitioning=True)

    assert df.height == 1
    assert df["ACCESSION_NUMBER"][0] == "ACC-GOOD"


def test_batch_dirs_mode_appends_incrementally(tmp_path: Path) -> None:
    """Memory-safe incremental ingestion: one batch per run() call, appended
    to the same output dataset, must accumulate rather than overwrite."""
    raw = tmp_path / "raw"
    for batch, accession, cusip, report_qtr in [
        ("batch_a", "ACC-A", "037833100", "31-MAR-2020"),
        ("batch_b", "ACC-B", "594918104", "30-JUN-2020"),
    ]:
        d = raw / batch
        d.mkdir(parents=True)
        (d / "INFOTABLE.tsv").write_text(
            "\n".join([_INFOTABLE_HEADER, _infotable_row(accession, cusip, "1000000")])
        )
        (d / "COVERPAGE.tsv").write_text(
            "\n".join([_COVERPAGE_HEADER, _coverpage_row(accession, report_qtr, "false", "Mgr")])
        )

    cfg = Settings(paths={"raw_edgar": raw, "processed": tmp_path / "processed"})
    ingester = EDGARIngester(cfg)
    ingester.run(batch_dirs=["batch_a"])
    out_dir = ingester.run(batch_dirs=["batch_b"])

    import polars as pl
    df = pl.read_parquet(out_dir, hive_partitioning=True)
    assert set(df["ACCESSION_NUMBER"].to_list()) == {"ACC-A", "ACC-B"}
    assert set(df["source_quarter"].to_list()) == {"2020Q1", "2020Q2"}
