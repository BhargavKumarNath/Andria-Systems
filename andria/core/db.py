"""DuckDB connection factory with proper resource lifecycle management.

Design principles:
- Connections are NEVER global — always created via context manager
- Memory limits and thread counts configured from Settings
- Parquet views registered lazily with Hive partition awareness
- All connections log open/close events for observability

Usage:
    from andria.core.db import db_factory

    with db_factory.connect() as conn:
        df = conn.execute("SELECT 1").pl()

    with db_factory.connect_parquet(cfg.paths.processed / "edgar") as conn:
        df = conn.execute("SELECT * FROM edgar LIMIT 10").pl()
"""
from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Generator

import duckdb

from andria.core.config import get_settings
from andria.core.logging import get_logger

logger = get_logger(__name__)


class DuckDBConnectionFactory:
    """Creates configured DuckDB connections on demand."""

    def __init__(
        self,
        memory_limit_gb: int | None = None,
        threads: int = 8,
        read_only: bool = False,
    ) -> None:
        cfg = get_settings()
        self._memory_gb = memory_limit_gb or cfg.ingest.memory_limit_gb
        self._threads = threads
        self._read_only = read_only

    def _configure(self, conn: duckdb.DuckDBPyConnection) -> None:
        conn.execute(f"SET memory_limit = '{self._memory_gb}GB'")
        conn.execute(f"SET threads = {self._threads}")
        conn.execute("SET enable_progress_bar = true")
        conn.execute("SET enable_progress_bar_print = true")

    @contextmanager
    def connect(
        self,
        db_path: str = ":memory:",
    ) -> Generator[duckdb.DuckDBPyConnection, None, None]:
        """Yield a configured DuckDB connection, closing it on exit."""
        conn = duckdb.connect(db_path, read_only=self._read_only)
        try:
            self._configure(conn)
            logger.debug("duckdb_opened", db=db_path, memory_gb=self._memory_gb)
            yield conn
        finally:
            conn.close()
            logger.debug("duckdb_closed", db=db_path)

    @contextmanager
    def connect_parquet(
        self,
        dataset_path: Path,
        view_name: str = "source",
        hive_partitioning: bool = True,
    ) -> Generator[duckdb.DuckDBPyConnection, None, None]:
        """Yield a connection with a parquet dataset registered as a view.

        Supports Hive-partitioned directories (quarter=YYYYQN/) transparently.
        """
        glob = str(dataset_path / "**/*.parquet") if dataset_path.is_dir() else str(dataset_path)
        with self.connect() as conn:
            hive = str(hive_partitioning).lower()
            conn.execute(
                f"CREATE OR REPLACE VIEW {view_name} AS "
                f"SELECT * FROM read_parquet('{glob}', hive_partitioning={hive})"
            )
            logger.debug("parquet_view_registered", view=view_name, path=str(dataset_path))
            yield conn


# Module-level singleton factory — inject this into functions, never call duckdb directly
db_factory = DuckDBConnectionFactory()
