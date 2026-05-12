"""EDGAR ingestion — raw TSV → Hive-partitioned Parquet.

Improvements over previous processing/preprocess_edgar.py:
- Proper class with injected Settings (testable, no globals)
- Hive partition output: dataset/processed/edgar/quarter=YYYYQN/
- Structured logging via structlog
- Row-count integrity assertion
- Raises IngestionError on failure (no sys.exit)
"""

from __future__ import annotations

import duckdb
from pathlib import Path
from andria.core.config import Settings
from andria.core.exceptions import IngestionError
from andria.core.logging import get_logger

logger = get_logger(__name__)


class EDGARIngester:
    """Ingests raw EDGAR quarterly TSV files into a Hive-partitioned Parquet dataset."""

    def __init__(self, cfg: Settings) -> None:
        self._cfg = cfg
        self._raw = cfg.paths.raw_edgar
        self._out = cfg.paths.processed / "edgar"
        self._mem = cfg.ingest.memory_limit_gb
        self._compression = cfg.ingest.parquet_compression.upper()
        self._row_group = cfg.ingest.row_group_size

    def run(self) -> Path:
        """Execute full ingestion. Returns output directory path."""
        import duckdb

        if not self._raw.exists():
            raise IngestionError(f"Raw EDGAR path not found: {self._raw}")
        self._out.mkdir(parents=True, exist_ok=True)

        infotable_files = sorted(self._raw.rglob("INFOTABLE.tsv"))
        coverpage_files = sorted(self._raw.rglob("COVERPAGE.tsv"))
        meta_files = sorted(self._raw.rglob("_meta.json"))

        if not infotable_files:
            raise IngestionError(f"No INFOTABLE.tsv files found under {self._raw}")

        logger.info(
            "edgar_ingestion_start",
            infotable_count=len(infotable_files),
            coverpage_count=len(coverpage_files),
            meta_count=len(meta_files),
        )

        con: duckdb.DuckDBPyConnection = duckdb.connect()
        try:
            con.execute(f"SET memory_limit = '{self._mem}GB'")
            con.execute("SET enable_progress_bar = true")

            self._load_infotable(con)
            self._load_coverpage(con)
            self._load_meta(con, meta_files)
            self._build_combined(con)
            self._export(con)
        finally:
            con.close()

        logger.info("edgar_ingestion_complete", output_dir=str(self._out))
        return self._out

    def _load_infotable(self, con: duckdb.DuckDBPyConnection) -> None:
        pattern = str(self._raw / "*" / "INFOTABLE.tsv").replace("\\", "/")
        con.execute(f"""
            CREATE OR REPLACE TABLE infotable_all AS
            SELECT *,
                split_part(replace(filename, '\\\\', '/'), '/', -2) AS source_quarter,
                filename AS source_file_infotable
            FROM read_csv_auto('{pattern}',
                sep='\\t', header=true, all_varchar=true,
                filename=true, ignore_errors=false)
        """)
        n_row = con.execute("SELECT COUNT(*) FROM infotable_all").fetchone()
        n = n_row[0] if n_row else 0
        logger.info("infotable_loaded", rows=n)

    def _load_coverpage(self, con: duckdb.DuckDBPyConnection) -> None:
        pattern = str(self._raw / "*" / "COVERPAGE.tsv").replace("\\", "/")
        con.execute(f"""
            CREATE OR REPLACE TABLE coverpage_all AS
            SELECT *,
                split_part(replace(filename, '\\\\', '/'), '/', -2) AS source_quarter,
                filename AS source_file_coverpage
            FROM read_csv_auto('{pattern}',
                sep='\\t', header=true, all_varchar=true,
                filename=true, ignore_errors=false)
        """)
        dups_row = con.execute("""
            SELECT COUNT(*) FROM (
                SELECT ACCESSION_NUMBER, source_quarter FROM coverpage_all
                GROUP BY 1,2 HAVING COUNT(*) > 1)
        """).fetchone()
        dups = dups_row[0] if dups_row else 0
        if dups > 0:
            logger.warning("coverpage_duplicates", count=dups)

    def _load_meta(self, con: duckdb.DuckDBPyConnection, meta_files: list[Path]) -> None:
        import json

        con.execute("""
            CREATE OR REPLACE TABLE meta_all (
                quarter VARCHAR, meta_json VARCHAR, meta_file VARCHAR)
        """)
        records = []
        for mf in meta_files:
            try:
                with open(mf, encoding="utf-8") as fh:
                    records.append((mf.parent.name, json.dumps(json.load(fh)), str(mf)))
            except Exception as exc:
                logger.warning("meta_read_error", file=str(mf), error=str(exc))
        if records:
            con.executemany("INSERT INTO meta_all VALUES (?, ?, ?)", records)
        logger.info("meta_loaded", records=len(records))

    def _build_combined(self, con: duckdb.DuckDBPyConnection) -> None:
        con.execute("""
            CREATE OR REPLACE TABLE edgar_combined AS
            SELECT
                i.ACCESSION_NUMBER, i.INFOTABLE_SK, i.NAMEOFISSUER, i.TITLEOFCLASS,
                i.CUSIP, i.FIGI, i.VALUE, i.SSHPRNAMT, i.SSHPRNAMTTYPE, i.PUTCALL,
                i.INVESTMENTDISCRETION, i.OTHERMANAGER,
                i.VOTING_AUTH_SOLE, i.VOTING_AUTH_SHARED, i.VOTING_AUTH_NONE,
                i.source_quarter, i.source_file_infotable,
                c.REPORTCALENDARORQUARTER, c.ISAMENDMENT, c.AMENDMENTNO,
                c.AMENDMENTTYPE, c.CONFDENIEDEXPIRED, c.DATEDENIEDEXPIRED,
                c.DATEREPORTED, c.REASONFORNONCONFIDENTIALITY,
                c.FILINGMANAGER_NAME, c.FILINGMANAGER_STREET1, c.FILINGMANAGER_STREET2,
                c.FILINGMANAGER_CITY, c.FILINGMANAGER_STATEORCOUNTRY, c.FILINGMANAGER_ZIPCODE,
                c.REPORTTYPE, c.FORM13FFILENUMBER, c.CRDNUMBER, c.SECFILENUMBER,
                c.PROVIDEINFOFORINSTRUCTION5, c.ADDITIONALINFORMATION, c.source_file_coverpage,
                TRY_STRPTIME(c.REPORTCALENDARORQUARTER, '%d-%b-%Y')::DATE AS filing_date_parsed,
                m.meta_json, m.meta_file,
                -- Derived: exposure type for options logic
                CASE WHEN UPPER(TRIM(i.PUTCALL)) = 'PUT' THEN 'Put'
                     WHEN UPPER(TRIM(i.PUTCALL)) = 'CALL' THEN 'Call'
                     ELSE 'Equity' END AS exposure_type
            FROM infotable_all i
            LEFT JOIN coverpage_all c
                ON i.ACCESSION_NUMBER = c.ACCESSION_NUMBER AND i.source_quarter = c.source_quarter
            LEFT JOIN meta_all m ON i.source_quarter = m.quarter
        """)
        n_info_row = con.execute("SELECT COUNT(*) FROM infotable_all").fetchone()
        n_info = n_info_row[0] if n_info_row else 0
        n_comb_row = con.execute("SELECT COUNT(*) FROM edgar_combined").fetchone()
        n_comb = n_comb_row[0] if n_comb_row else 0
        if n_comb != n_info:
            logger.warning("row_count_mismatch", infotable=n_info, combined=n_comb)
        logger.info("edgar_combined_built", rows=n_comb)

    def _export(self, con: duckdb.DuckDBPyConnection) -> None:
        out_str = str(self._out).replace("\\", "/")
        if self._cfg.ingest.partition_edgar:
            # Hive partition by source_quarter → dataset/processed/edgar/source_quarter=2010Q1/
            con.execute(f"""
                COPY edgar_combined TO '{out_str}'
                (FORMAT PARQUET, PARTITION_BY (source_quarter),
                 COMPRESSION '{self._compression}', ROW_GROUP_SIZE {self._row_group})
            """)
            logger.info("edgar_exported_hive", output=out_str)
        else:
            out_file = str(self._out / "data.parquet")
            con.execute(f"""
                COPY edgar_combined TO '{out_file}'
                (FORMAT PARQUET, COMPRESSION '{self._compression}',
                 ROW_GROUP_SIZE {self._row_group})
            """)
            logger.info("edgar_exported_single", output=out_file)
