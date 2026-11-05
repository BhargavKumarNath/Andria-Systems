"""Reproducible synthetic OHLCV benchmark; no network or production data.

Run: UV_CACHE_DIR=/tmp/andria-analysis-uv uv run --no-sync python
     scripts/benchmark_ohlcv_analysis.py --directory .tmp/ohlcv-analysis

Uses fresh child processes, reports processing wall time and process peak RSS.
Repeated runs are cache-warm: this script does not evict the OS page cache.
Synthetic bars are continuous minute timestamps, not exchange sessions.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import subprocess
import sys
import threading
import time
from pathlib import Path


def worker(directory: Path, mode: str) -> dict:
    import duckdb
    import numpy as np
    import pandas as pd
    import psutil
    import pyarrow as pa

    pa.set_cpu_count(4)
    pa.set_io_thread_count(4)

    parquet = str(directory / "bars" / "**" / "*.parquet")
    process = psutil.Process()
    peak_rss = [process.memory_info().rss]
    stop = threading.Event()

    def sample_memory() -> None:
        while not stop.wait(0.005):
            peak_rss[0] = max(peak_rss[0], process.memory_info().rss)

    monitor = threading.Thread(target=sample_memory, daemon=True)
    monitor.start()
    started = time.perf_counter()
    if mode.startswith("pandas"):
        cols = ["symbol", "timestamp", "close"]
        if mode == "pandas_csv":
            frame = pd.read_csv(directory / "bars.csv", usecols=cols, parse_dates=["timestamp"])
        else:
            frame = pd.read_parquet(directory / "bars", columns=cols)
        frame = frame.sort_values(["symbol", "timestamp"]).reset_index(drop=True)
        groups = frame.groupby("symbol", sort=False)
        frame["ret"] = groups["close"].pct_change(fill_method=None).abs()
        frame["ma"] = (
            groups["close"].rolling(20, min_periods=20).mean().reset_index(level=0, drop=True)
        )
        result = (
            frame.groupby("symbol")
            .agg(n=("close", "size"), mean_ma=("ma", "mean"), mean_abs_return=("ret", "mean"))
            .sort_index()
            .reset_index()
        )
        values = result[["symbol", "n", "mean_ma", "mean_abs_return"]].to_numpy(dtype=float)
    else:
        conn = duckdb.connect()
        conn.execute("SET threads=4")
        conn.execute("SET memory_limit='2GB'")
        conn.execute(f"SET temp_directory='{directory / 'spill'}'")
        conn.execute("SET preserve_insertion_order=false")
        if mode == "duckdb_subset":
            # Explicit date predicate demonstrates Hive pruning; not a rolling-feature query.
            query = f"""SELECT symbol, COUNT(*) n, AVG(close), SUM(volume)
                FROM read_parquet('{parquet}', hive_partitioning=true)
                WHERE trade_date=DATE '2020-01-15' AND symbol < 5
                GROUP BY symbol ORDER BY symbol"""
        else:
            source = (
                f"read_csv_auto('{directory / 'bars.csv'}')"
                if mode == "duckdb_csv"
                else f"read_parquet('{parquet}', hive_partitioning=true)"
            )
            query = f"""WITH features AS (
                SELECT symbol, close,
                    AVG(close) OVER w AS ma,
                    COUNT(*) OVER w AS window_count,
                    ABS(close / LAG(close) OVER (
                        PARTITION BY symbol ORDER BY timestamp) - 1) AS ret
                FROM {source}
                WINDOW w AS (PARTITION BY symbol ORDER BY timestamp
                    ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)
            ) SELECT symbol, COUNT(*) n,
                AVG(CASE WHEN window_count=20 THEN ma END) mean_ma,
                AVG(ret) mean_abs_return
                FROM features GROUP BY symbol ORDER BY symbol"""
        values = np.asarray(conn.execute(query).fetchall(), dtype=float)
    elapsed = time.perf_counter() - started
    peak_rss[0] = max(peak_rss[0], process.memory_info().rss)
    stop.set()
    monitor.join()
    if mode == "duckdb_subset":
        plan = conn.execute("EXPLAIN ANALYZE " + query).fetchall()
        (directory / "subset-plan.txt").write_text("\n".join(str(row[1]) for row in plan))
    if mode.startswith("duckdb"):
        conn.close()
    np.save(directory / f"{mode}.npy", values)
    return {
        "mode": mode,
        "seconds": elapsed,
        "peak_rss_mib": peak_rss[0] / (1024 * 1024),
        "result_rows": len(values),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--rows", type=int, default=5_000_000)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--worker")
    args = parser.parse_args()
    directory = args.directory.resolve()
    directory.mkdir(parents=True, exist_ok=True)
    if args.worker:
        print(json.dumps(worker(directory, args.worker)))
        return
    import duckdb
    import numpy as np
    import pandas as pd
    import polars as pl

    if args.rows % 100:
        raise ValueError("Rows must be divisible by 100 symbols")
    per_symbol = args.rows // 100
    conn = duckdb.connect()
    conn.execute("SET threads=4")
    conn.execute("SET memory_limit='2GB'")
    conn.execute(f"SET temp_directory='{directory / 'spill'}'")
    started = time.perf_counter()
    conn.execute(f"""CREATE TABLE bars AS WITH base AS (
        SELECT (i // {per_symbol})::INTEGER AS symbol,
            TIMESTAMP '2020-01-01' + (i % {per_symbol}) * INTERVAL 1 MINUTE AS timestamp,
            100.0 + (i // {per_symbol}) + SIN((i % {per_symbol}) * 0.01) * 3
                + ((i * 7919) % 1000) / 10000.0 AS close,
            (1000 + (i * 7919) % 100000)::BIGINT AS volume
        FROM range({args.rows}) t(i)
    ) SELECT symbol, timestamp, close-0.1 AS open, close+0.2 AS high,
        close-0.2 AS low, close, volume, timestamp::DATE AS trade_date
        FROM base ORDER BY symbol,timestamp""")
    conn.execute(f"COPY bars TO '{directory / 'bars.csv'}' (HEADER true)")
    before_parquet = time.perf_counter()
    conn.execute(f"""COPY bars TO '{directory / "bars"}' (FORMAT PARQUET,
        PARTITION_BY(trade_date), COMPRESSION zstd, ROW_GROUP_SIZE 100000)""")
    parquet_write_s = time.perf_counter() - before_parquet
    setup_seconds = time.perf_counter() - started
    conn.close()
    results = []
    modes = ["pandas_csv", "pandas_parquet", "duckdb_csv", "duckdb_parquet", "duckdb_subset"]
    # Rotate order to reduce consistent first/last run effects.
    for repeat in range(args.repeats):
        order = modes[repeat:] + modes[:repeat]
        for mode in order:
            completed = subprocess.run(
                [sys.executable, __file__, "--directory", str(directory), "--worker", mode],
                check=True,
                capture_output=True,
                text=True,
                env={
                    **os.environ,
                    "OMP_NUM_THREADS": "4",
                    "OPENBLAS_NUM_THREADS": "4",
                    "POLARS_MAX_THREADS": "4",
                    "ARROW_NUM_THREADS": "4",
                },
            )
            row = json.loads(completed.stdout)
            row["repeat"] = repeat + 1
            results.append(row)
            print(json.dumps(row), flush=True)
    baseline = np.load(directory / "pandas_csv.npy")
    for mode in ["pandas_parquet", "duckdb_csv", "duckdb_parquet"]:
        np.testing.assert_allclose(
            baseline, np.load(directory / f"{mode}.npy"), rtol=1e-9, atol=1e-10
        )
    check = duckdb.connect()
    expected = check.execute(f"""SELECT symbol, COUNT(*), AVG(close), SUM(volume)
        FROM read_csv_auto('{directory / "bars.csv"}')
        WHERE trade_date=DATE '2020-01-15' AND symbol<5 GROUP BY symbol ORDER BY symbol""").fetchall()
    np.testing.assert_allclose(
        np.asarray(expected), np.load(directory / "duckdb_subset.npy"), rtol=1e-9
    )
    check.close()
    summary = {
        mode: {
            "median_seconds": statistics.median(r["seconds"] for r in results if r["mode"] == mode),
            "max_peak_rss_mib": max(r["peak_rss_mib"] for r in results if r["mode"] == mode),
        }
        for mode in modes
    }
    output = {
        "rows": args.rows,
        "symbols": 100,
        "bars_per_symbol": per_symbol,
        "repeats": args.repeats,
        "versions": {
            "duckdb": duckdb.__version__,
            "pandas": pd.__version__,
            "polars": pl.__version__,
        },
        "cpu_logical": os.cpu_count(),
        "setup_seconds": setup_seconds,
        "parquet_write_seconds": parquet_write_s,
        "csv_bytes": (directory / "bars.csv").stat().st_size,
        "parquet_bytes": sum(p.stat().st_size for p in (directory / "bars").rglob("*.parquet")),
        "parquet_files": len(list((directory / "bars").rglob("*.parquet"))),
        "cache": "OS cache not cleared; local disk, repeated runs",
        "equivalence": "Full feature summaries match within rtol=1e-9, atol=1e-10; subset matches CSV scan",
        "summary": summary,
        "runs": results,
    }
    (directory / "results.json").write_text(json.dumps(output, indent=2))
    print(json.dumps(output, indent=2), flush=True)


if __name__ == "__main__":
    main()
