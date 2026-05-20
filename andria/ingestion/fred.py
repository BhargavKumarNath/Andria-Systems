"""FRED macro data ingestion — raw CSV → single Parquet."""

from __future__ import annotations
from pathlib import Path
from andria.core.config import Settings
from andria.core.exceptions import IngestionError
from andria.core.logging import get_logger
logger = get_logger(__name__)


class FREDIngester:
    """Ingests FRED macro time series files into a single Parquet."""

    def __init__(self, cfg: Settings) -> None:
        self._raw = cfg.paths.raw_fred
        self._out = cfg.paths.processed / "FRED_preprocess.parquet"
        self._mem = cfg.ingest.memory_limit_gb

    def run(self) -> Path:
        import duckdb

        if not self._raw.exists():
            raise IngestionError(f"Raw FRED path not found: {self._raw}")
        self._out.parent.mkdir(parents=True, exist_ok=True)

        csv_files = sorted(self._raw.rglob("*.csv"))
        if not csv_files:
            raise IngestionError(f"No CSV files found under {self._raw}")

        logger.info("fred_ingestion_start", file_count=len(csv_files))
        con = duckdb.connect()
        try:
            con.execute(f"SET memory_limit = '{self._mem}GB'")
            pattern = str(self._raw / "*.csv").replace("\\", "/")
            con.execute(f"""
                CREATE OR REPLACE TABLE fred_combined AS
                SELECT *, filename AS source_file
                FROM read_csv_auto('{pattern}',
                    header=true, all_varchar=false,
                    filename=true, ignore_errors=true)
            """)
            n_row = con.execute("SELECT COUNT(*) FROM fred_combined").fetchone()
            n = n_row[0] if n_row else 0
            out_str = str(self._out).replace("\\", "/")
            con.execute(f"""
                COPY fred_combined TO '{out_str}'
                (FORMAT PARQUET, COMPRESSION 'ZSTD')
            """)
            logger.info("fred_ingestion_complete", rows=n, output=str(self._out))
        finally:
            con.close()
        return self._out
