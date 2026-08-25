"""EDGAR ingestion — raw TSV → Hive-partitioned Parquet.

Improvements over previous processing/preprocess_edgar.py:
- Proper class with injected Settings (testable, no globals)
- Hive partition output: dataset/processed/edgar/quarter=YYYYQN/
- Structured logging via structlog
- Row-count integrity assertion
- Raises IngestionError on failure (no sys.exit)
"""

from __future__ import annotations

from pathlib import Path

import duckdb

from andria.core.config import Settings
from andria.core.db import db_factory
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

    def run(self, batch_dirs: list[str] | None = None) -> Path:
        """Execute ingestion. Returns output directory path.

        Args:
            batch_dirs: If given, restrict ingestion to these raw subdirectory
                names only (e.g. a single quarter's extracted zip) and APPEND
                the result to the output dataset instead of replacing it. This
                bounds peak memory to roughly one batch's worth of rows —
                intended for incremental, memory-constrained ingestion of a
                large multi-decade raw dataset one (or a few) batch(es) at a
                time, rather than a single glob over everything at once. If
                omitted, all batches under ``raw_edgar`` are ingested in one
                pass (fine for a small raw dataset; not recommended for the
                full multi-decade SEC bulk archive on a memory-constrained host).
        """

        if not self._raw.exists():
            raise IngestionError(f"Raw EDGAR path not found: {self._raw}")
        self._out.mkdir(parents=True, exist_ok=True)

        if batch_dirs is not None:
            search_dirs = [self._raw / b for b in batch_dirs]
            infotable_files = [d / "INFOTABLE.tsv" for d in search_dirs if (d / "INFOTABLE.tsv").exists()]
            coverpage_files = [d / "COVERPAGE.tsv" for d in search_dirs if (d / "COVERPAGE.tsv").exists()]
            missing = [d for d in search_dirs if not (d / "INFOTABLE.tsv").exists()]
            if missing:
                raise IngestionError(f"Missing INFOTABLE.tsv under: {missing}")
        else:
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
            incremental=batch_dirs is not None,
        )

        with db_factory.connect() as con:
            self._load_infotable(con, infotable_files)
            self._load_coverpage(con, coverpage_files)
            self._load_meta(con, meta_files)
            self._build_combined(con)
            self._export(con, append=batch_dirs is not None)

        logger.info("edgar_ingestion_complete", output_dir=str(self._out))
        return self._out

    @staticmethod
    def _file_list_sql(files: list[Path]) -> str:
        quoted = ", ".join(f"'{str(f).replace(chr(92), '/')}'" for f in files)
        return f"[{quoted}]"

    def _load_infotable(self, con: duckdb.DuckDBPyConnection, files: list[Path]) -> None:
        file_list = self._file_list_sql(files)
        con.execute(f"""
            CREATE OR REPLACE TABLE infotable_all AS
            SELECT *,
                split_part(replace(filename, '\\\\', '/'), '/', -2) AS source_batch,
                filename AS source_file_infotable
            FROM read_csv_auto({file_list},
                sep='\\t', header=true, all_varchar=true,
                filename=true, ignore_errors=false)
        """)
        n_row = con.execute("SELECT COUNT(*) FROM infotable_all").fetchone()
        n = n_row[0] if n_row else 0
        logger.info("infotable_loaded", rows=n)

    def _load_coverpage(self, con: duckdb.DuckDBPyConnection, files: list[Path]) -> None:
        file_list = self._file_list_sql(files)
        con.execute(f"""
            CREATE OR REPLACE TABLE coverpage_all AS
            SELECT *,
                split_part(replace(filename, '\\\\', '/'), '/', -2) AS source_batch,
                filename AS source_file_coverpage
            FROM read_csv_auto({file_list},
                sep='\\t', header=true, all_varchar=true,
                filename=true, ignore_errors=false)
        """)
        dups_row = con.execute("""
            SELECT COUNT(*) FROM (
                SELECT ACCESSION_NUMBER, source_batch FROM coverpage_all
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
        # `source_batch` is the raw filing-received directory label (e.g. a zip named
        # "01sep2024-30nov2024" for SEC's current rolling-window bulk packaging). It is
        # NOT a valid report-quarter label on its own: a single recent batch routinely
        # contains late amendments spanning a decade of distinct report periods. The
        # canonical `source_quarter` used by every downstream module (Manager DNA, RACS,
        # the backtest filing-lag engine) must instead be derived from COVERPAGE's own
        # `REPORTCALENDARORQUARTER` field — the actual quarter each filing reports on.
        con.execute(f"""
            CREATE OR REPLACE TABLE edgar_combined AS
            WITH base AS (
                SELECT
                    i.ACCESSION_NUMBER, i.INFOTABLE_SK, i.NAMEOFISSUER, i.TITLEOFCLASS,
                    i.CUSIP, i.FIGI, i.VALUE, i.SSHPRNAMT, i.SSHPRNAMTTYPE, i.PUTCALL,
                    i.INVESTMENTDISCRETION, i.OTHERMANAGER,
                    i.VOTING_AUTH_SOLE, i.VOTING_AUTH_SHARED, i.VOTING_AUTH_NONE,
                    i.source_batch, i.source_file_infotable,
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
                    ON i.ACCESSION_NUMBER = c.ACCESSION_NUMBER AND i.source_batch = c.source_batch
                LEFT JOIN meta_all m ON i.source_batch = m.quarter
            )
            SELECT
                *,
                EXTRACT(YEAR FROM filing_date_parsed)::VARCHAR || 'Q' ||
                    CAST(CEIL(EXTRACT(MONTH FROM filing_date_parsed) / 3.0) AS INTEGER)::VARCHAR
                    AS source_quarter
            FROM base
            -- Enforce ingest.min_valid_date: drops filings with an unparseable or
            -- out-of-range REPORTCALENDARORQUARTER (e.g. real-world typos in raw SEC
            -- data such as "1900" or "1987") rather than silently mislabeling them.
            WHERE filing_date_parsed >= DATE '{self._cfg.ingest.min_valid_date}'
        """)
        n_info_row = con.execute("SELECT COUNT(*) FROM infotable_all").fetchone()
        n_info = n_info_row[0] if n_info_row else 0
        n_comb_row = con.execute("SELECT COUNT(*) FROM edgar_combined").fetchone()
        n_comb = n_comb_row[0] if n_comb_row else 0
        dropped = n_info - n_comb
        if dropped > 0:
            logger.warning(
                "rows_dropped_invalid_date",
                dropped=dropped,
                min_valid_date=self._cfg.ingest.min_valid_date,
                note="Unparseable or pre-min_valid_date REPORTCALENDARORQUARTER values",
            )
        logger.info("edgar_combined_built", rows=n_comb)

    def _export(self, con: duckdb.DuckDBPyConnection, append: bool = False) -> None:
        out_str = str(self._out).replace("\\", "/")
        append_opt = ", APPEND true" if append else ""
        if self._cfg.ingest.partition_edgar:
            # Hive partition by source_quarter → dataset/processed/edgar/source_quarter=2010Q1/
            # APPEND lets repeated calls (one per raw batch, in incremental mode) accumulate
            # into the same partitioned dataset instead of erroring on a non-empty directory.
            con.execute(f"""
                COPY edgar_combined TO '{out_str}'
                (FORMAT PARQUET, PARTITION_BY (source_quarter),
                 COMPRESSION '{self._compression}', ROW_GROUP_SIZE {self._row_group}{append_opt})
            """)
            logger.info("edgar_exported_hive", output=out_str, append=append)
        else:
            out_file = str(self._out / "data.parquet")
            con.execute(f"""
                COPY edgar_combined TO '{out_file}'
                (FORMAT PARQUET, COMPRESSION '{self._compression}',
                 ROW_GROUP_SIZE {self._row_group})
            """)
            logger.info("edgar_exported_single", output=out_file)
