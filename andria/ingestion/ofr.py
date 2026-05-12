"""OFR financial stress data ingestion — raw files → single Parquet."""

from __future__ import annotations

from pathlib import Path

from andria.core.config import Settings
from andria.core.exceptions import IngestionError
from andria.core.logging import get_logger

logger = get_logger(__name__)


class OFRIngester:
    """Ingests OFR Financial Stress Index files into a single Parquet."""

    def __init__(self, cfg: Settings) -> None:
        self._raw = cfg.paths.raw_ofr
        self._out = cfg.paths.processed / "OFR_preprocess.parquet"
        self._mem = cfg.ingest.memory_limit_gb

    def run(self) -> Path:
        import duckdb

        if not self._raw.exists():
            raise IngestionError(f"Raw OFR path not found: {self._raw}")
        self._out.parent.mkdir(parents=True, exist_ok=True)

        csv_files = sorted(self._raw.rglob("*.csv"))
        xlsx_files = sorted(self._raw.rglob("*.xlsx"))

        if not csv_files and not xlsx_files:
            raise IngestionError(f"No data files found under {self._raw}")

        logger.info("ofr_ingestion_start", csv_count=len(csv_files), xlsx_count=len(xlsx_files))
        con = duckdb.connect()
        try:
            con.execute(f"SET memory_limit = '{self._mem}GB'")
            if csv_files:
                pattern = str(self._raw / "*.csv").replace("\\", "/")
                con.execute(f"""
                    CREATE OR REPLACE TABLE ofr_combined AS
                    SELECT *, filename AS source_file
                    FROM read_csv_auto('{pattern}',
                        header=true, all_varchar=false,
                        filename=true, ignore_errors=true)
                """)
            else:
                # Fallback: load existing processed parquet if no raw CSVs
                existing = self._raw.parent.parent / "processed" / "OFR_preprocess.parquet"
                if existing.exists():
                    logger.warning("ofr_using_existing_processed", path=str(existing))
                    import shutil

                    shutil.copy(existing, self._out)
                    return self._out
                raise IngestionError("No CSV files found and no existing processed OFR parquet")

            n = con.execute("SELECT COUNT(*) FROM ofr_combined").fetchone()[0]
            out_str = str(self._out).replace("\\", "/")
            con.execute(f"""
                COPY ofr_combined TO '{out_str}'
                (FORMAT PARQUET, COMPRESSION 'ZSTD')
            """)
            logger.info("ofr_ingestion_complete", rows=n, output=str(self._out))
        finally:
            con.close()
        return self._out
