# Andria Systems: suitability for an OHLCV development bottleneck

Assessment date: 2026-10-23. Scope: the local checkout, selected existing tests, primary DuckDB documentation, and synthetic local measurements. No production SEC dataset or the user's OHLCV project was available.

## Decision

Reuse the data-processing design if profiling shows that loading, filtering, joining, resampling, or reusable feature calculations dominate runtime. There is direct code evidence and a local OHLCV benchmark supporting that design. There is no evidence yet that adopting Andria will eliminate the user's hour-long development phases.

The user clarified that each development phase completes in roughly an hour and that the project uses OHLCV data. That elapsed time has not been separated into agent work, package installation, downloads, tests, processing, backtests, or training. It is therefore not currently a measured 1–3 hour data-processing bottleneck.

Andria itself is a quarterly institutional-holdings research application. Its manager profiling, clustering, macro-regime estimation, and RACS strategy are specialized to SEC 13F holdings. Its reusable contribution for an OHLCV system is the storage/query pattern, rather than the complete application.

## What the implementation actually does

| Layer | Implementation and useful property | Limits relevant to scaling |
|---|---|---|
| Ingestion | [EDGARIngester](../andria/ingestion/edgar.py) reads TSV files with DuckDB, joins cover pages, derives report quarters, and writes Zstandard Parquet partitioned by `source_quarter`. | Raw input, cover pages, and the combined result are materialized as DuckDB tables before export. It is not a single streaming raw-to-Parquet pass. Most raw columns are retained as strings. |
| Query access | [Connection factory](../andria/core/db.py) registers `read_parquet` as a view, with Hive partition awareness. No Python DataFrame is needed just to register the dataset. | A lazy view avoids immediate loading; an executed query still reads, decompresses, and processes the required data. |
| Feature reduction | [ManagerDNABuilder](../andria/features/manager_dna.py) selects eligible managers, aggregates manager/quarter/security holdings, computes windows and position dynamics, then emits one 14-feature row per manager. | Several historical scans and blocking sorts/aggregations remain. Temporary tables bound intermediate lifetimes, but are not automatically cheaper than every alternative plan. |
| Models | [Clustering](../andria/models/clustering/engine.py) works on the reduced NumPy feature matrix; [HMM](../andria/models/regime/hmm.py) works on quarterly macro data. | Five HDBSCAN candidates, validation and UMAP run outside DuckDB. Diagnostics already limit silhouette sampling to 5,000 points. These costs cannot be inferred from Parquet scan performance. |
| Signal calculation | [RACSEngine](../andria/signals/racs.py) identifies activists, calculates weights, aggregates scores, calculates crowding, joins regimes, and materializes the smaller result into Polars. | It scans holdings for activist positions, crowding, and manager counts. No date-range interface or reusable persisted intermediate cache bounds a run to newly arrived history. |
| Pricing and backtesting | [MarketDataLoader](../andria/data/market_loader.py) uses per-ticker Parquet caches. [Backtest engine](../andria/backtest/engine.py) performs symbol-keyed Polars ASOF joins. | Pricing frames and the backtest operate eagerly in memory. The market-data path is not an out-of-core OHLCV engine. |

The key speed advantage is reducing large data inside a compiled columnar engine before handing it to Python. It is not simply replacing a filename extension. This also avoids repeated Python row callbacks for work expressible as SQL operations.

## Checking the remembered claims

**“120+ million SEC filings.”** The [README](../README.md) says 116M+ rows. Holdings line items and individual filings are different units: many holdings rows can belong to one filing. The dataset is absent from this checkout, `.benchmarks` is empty, and the tests contain no performance benchmark fixtures substantiating the quoted throughput. Neither 116M nor 120M was independently verified here.

**“Queries compressed files instantly without loading everything into RAM.”** DuckDB really can query Parquet directly, read selected columns, push eligible filters into the scan, and skip files using partition predicates. It still performs I/O and computation. Full-history rolling windows, joins, and distinct aggregations can consume substantial memory and time. See the cited [technical evidence](duckdb-performance-references.md).

**“The entire pipeline stays below 3 GB / 100M rows per minute.”** These are README assertions, not reproducible workload-specific guarantees in this checkout. Row count alone does not determine runtime: row width, distinct group count, join expansion, ordering, selectivity, hardware, and output size matter. For example, 120M rows containing seven 8-byte values already represent 6.72 GB of raw values before extra structures; compressed disk size is a different quantity.

**“A 10 GB memory budget.”** The checked-in [YAML](../configs/base.yaml) sets 6 GB. The Pydantic model default is 10 GB when used without that override. The factory defaults to four threads and limits its temporary spill directory to 20 GiB. DuckDB's memory limit is not a cap on total Python process RSS, including Polars and NumPy. The README's 500M-row discussion is not an intrinsic DuckDB capacity threshold.

## Measured evidence

The companion [benchmark script](../scripts/benchmark_ohlcv_analysis.py) creates five million continuous synthetic minute bars across 100 symbols and 35 date partitions. It compares loading, ordering, a trailing 20-bar simple moving average, a lagged absolute return, and per-symbol summaries. Pandas uses vectorized group operations, rather than deliberately slow Python row loops. Both paths request only the three columns required by the feature query.

Each trial runs in a fresh child process. There are three trials per mode with rotated ordering. DuckDB uses four threads and a 2 GB buffer-manager limit; PyArrow CPU and I/O pools are set to four threads. Imports and interpreter startup are outside measured processing time. Peak RSS is sampled every 5 ms and includes the interpreter and imported libraries. OS caches are not cleared, so these are repeated local, cache-warm measurements. Data is on the workspace filesystem, not `/tmp`'s RAM-backed filesystem.

**The final numeric results are recorded below and in [raw results](ohlcv-benchmark-results.txt).**

| Implementation | Median processing time | Maximum sampled process RSS across trials |
|---|---:|---:|
| Pandas + CSV | 3.135 s | 628 MiB |
| Pandas + Parquet | 0.770 s | 874 MiB |
| DuckDB + CSV | 0.554 s | 532 MiB |
| DuckDB + Parquet | 0.294 s | 345 MiB |
| DuckDB + Parquet, separate date/symbol aggregation | 0.013 s | 143 MiB |

The full DuckDB/Parquet feature query was **10.65× faster** than Pandas/CSV and **2.62× faster** than Pandas/Parquet in this experiment. Switching Pandas from CSV to Parquet alone was **4.07× faster**. RSS did not improve for every storage/engine combination: Pandas/Parquet used more sampled peak memory than Pandas/CSV here. These are measured outcomes of these particular implementations, not universal rankings.

The generated CSV was 573,448,225 bytes; the 35 Parquet files totaled 37,559,209 bytes. This unusually compressible synthetic series is not a storage estimate for real OHLCV. Writing Parquet from the already generated DuckDB table took 0.452 s; that does **not** measure CSV-to-Parquet conversion. Versions: DuckDB 1.5.5, Pandas 3.0.5, Polars 1.44.2; machine: 16 logical CPUs and approximately 14 GiB reported RAM. The [saved plan](ohlcv-subset-plan.txt) records partition pruning.

Full-query outputs are 100 summary rows. The script compares those summaries with numerical tolerances, not every intermediate per-bar feature. A separate subset query aggregates five symbols for one date; its plan confirms scanning 1 of 35 files and emitting 7,200 selected bars. Its CSV reference produces matching output. That query does less work than the full feature benchmark and must not be used as a comparable speedup ratio.

The synthetic data is smooth, repetitive, clean, and much smaller than a 120M-row archive. Its compression ratio and speed will not transfer directly to real market data. No Python strategy loop, parameter search, recursive indicator, training, network call, full feature export, or portfolio simulation is included. There was no deliberately forced out-of-memory/spill experiment. These results demonstrate the mechanism, not production capacity or strategy validity.

I also invoked the actual ManagerDNABuilder and RACSEngine on one million synthetic holdings rows: 1,000 managers, 20 quarters, 50 positions per manager/quarter. With four DuckDB threads and a 2 GB limit, DNA took **0.590 s** and RACS took **0.271 s**, producing 1,000 manager rows and 1,380 signal rows respectively. Activist labels were hand-assigned, so this excludes clustering. This single easy synthetic run establishes that the code paths execute; it does not validate the README's full-scale performance claims. The local run details are saved in `.tmp/holdings-analysis/results.json`.

Existing core, EDGAR ingestion, manager DNA, and RACS tests: **14 passed**. They provide small-fixture functional evidence, not a large-scale or full trading-system validation.

## Bottlenecks still present in Andria

1. **Serial market downloads.** `MarketDataLoader.load_pricing` loops over ticker batches and then downloads each ticker individually. A batch size of 100 is not 100 concurrent requests. Cached data is considered stale using file modification age; a stale ticker triggers another download over the requested range rather than an explicitly incremental append. Download time needs its own measurement.
2. **Identifier resolution can take hours.** [CUSIP mapping](../andria/data/cusip_mapper.py) uses batches of 10 with a 2.5-second sleep between batches. At 30,000 uncached identifiers, sleep alone is 7,497.5 seconds, approximately 125 minutes, before request time. This follows this checkout's constants, not a claim about current provider limits. OHLCV data already keyed by usable symbols does not require this stage.
3. **Historical features are recomputed.** Phase 1 builds DNA and refits clustering every time it is invoked. The builder and RACS have no incremental historical feature update interface. Partitioned ingestion exists, but `Pipeline.run_ingestion` invokes `.run()` without batch restriction. Neither expensive upstream recomputation nor a full-history scan disappears just because storage is partitioned.
4. **Ingestion retries need discipline.** Batch ingestion appends files; there is no batch-completion registry or skip-on-retry mechanism in the ingester. Reprocessing the same batch can duplicate data. Cover-page duplicates are logged rather than resolved before joining. Correctness and join cardinality should be checked before optimizing throughput.
5. **Repeated Python calendar work.** Filing dates and execution delays are calculated row by row in [engine.py](../andria/backtest/engine.py) and [execution.py](../andria/backtest/execution.py). For repeated quarterly dates, a small unique-date mapping could avoid redundant calendar calls. This is a code-derived opportunity, not a measured dominant cost.
6. **Validation can be expensive.** Phase 3 requests 16-partition PBO and 1,000 Monte Carlo trials. PBO traverses 12,870 half-partition combinations and repeatedly constructs arrays. These costs live outside DuckDB. Measure them before deciding whether query optimization addresses a slow phase.

## Suitability for OHLCV

| Work consuming time | Expected relevance of this design |
|---|---|
| Re-reading large CSV histories | Strong candidate: one-time conversion to typed Parquet plus selective loading. |
| Filtering symbols/date ranges or selecting columns | Strong candidate when predicates can prune storage. |
| Joins, resampling, trailing SMA, lags, rolling sums | Good candidates; benchmark realistic windows, ordering and cardinality. |
| Repeated development runs recalculating identical features | Persist and reuse versioned features; the current Andria pipeline does not solve this automatically. |
| EMA/Wilder-style recursive indicators | Assess specialized compiled/vectorized implementations; a SQL window is not automatically an equivalent recurrence. |
| Sequential order/position simulation | Storage can reduce preparation overhead; the stateful simulation needs its own optimization. |
| Thousands of strategy configurations or model fits | Reuse inputs/features and profile the search/training loop; DuckDB does not remove that work. |
| Downloads, installations, coding, debugging, agent reasoning | DuckDB does not directly accelerate these. |

For an OHLCV system, adapt the pattern to typed symbol identifiers, explicit timestamps, OHLCV fields and an adjustment policy. Choose date partitions to match common ranges and data volume; cluster/sort within files by symbol and time. Avoid indiscriminately creating tiny per-symbol/day files. For join-heavy repeated queries, compare persisted DuckDB tables with direct Parquet rather than assuming Parquet wins every benchmark.

A useful flow is raw market data → validated typed columnar storage → bounded query/feature calculation → reusable feature artifacts → strategy/model run. Only change stages that measurements identify as expensive.

Correctness needs attention when narrowing a dataset: load enough earlier bars for rolling-window warm-up, retain indicator state for incremental calculations, preserve symbol boundaries, define session/timezone rules for resampling, and decide when a completed bar becomes tradable. Include these in output equivalence checks.

## Cautions about adopting the complete research system

These findings do not prevent reuse of the data layer, but they matter if adopting Andria's research framework as well:

- The HMM scaler and model fit the whole available macro series; predictions are then made for that same history. Manager DNA/clustering similarly use the available holdings history. Historical strategy use needs explicit time-bounded training and inference.
- [WalkForwardValidator](../andria/backtest/walk_forward.py) splits an already computed ledger and reports metrics. It does not retrain the scaler, clustering or HMM per fold, despite the README's stronger wording.
- The backtest's default selection threshold is a quantile across the supplied signal history, rather than independently per historical decision time. Historical decisions can therefore depend on future score distributions.
- A fixed report-quarter-end plus 45 days does not establish actual availability for late filings or amendments. The current ingestion schema should not be mistaken for a complete filing-publication-time model.
- The PBO implementation constructs alternative configurations by permuting one return vector; it does not evaluate actual strategy-configuration return histories. Treat that diagnostic accordingly.

A leakage audit and passing fixture tests do not by themselves resolve these issues. Performance success is separate from trading-research validity.

## What would establish whether the user's hour is recoverable

Record one ordinary slow phase before changing architecture. Distinguish total elapsed time per phase from the wall time of the commands it executes. Within those commands, separate download, file loading, cleaning/sorting, feature generation, simulation, model fitting, validation and export. Record input rows/bytes, selected symbols/dates, peak RSS and whether the OS swaps or DuckDB spills.

Use a representative frozen dataset and compare identical outputs under the existing implementation, Pandas with Parquet, and DuckDB or Polars. Keep first-run conversion separate from later development runs. Time materialization and export if the real caller needs all per-bar features. Inspect `EXPLAIN ANALYZE` for scans, filters, sorts and join expansion. See [primary references](duckdb-performance-references.md).

For a phase lasting 180 minutes, assuming a 10× improvement only in the identified data stage:

| Portion of original phase spent in that stage | New total time | Overall speedup |
|---|---:|---:|
| 90% | 34.2 minutes | 5.26× |
| 50% | 99 minutes | 1.82× |
| 10% | 163.8 minutes | 1.10× |

Calculation: `new_time = old_time * ((1 - accelerated_fraction) + accelerated_fraction / stage_speedup)`. These are scenarios, not predictions from the synthetic benchmark. An hour can become a few minutes only if almost all of it is spent in work that can actually be accelerated by that much.

Suggested instruction to the coding agent working on the OHLCV project:

> Profile one representative slow phase before changing libraries. Separate your coding/setup time from command execution time. Measure wall time for downloads, reads, cleaning/sorting, indicators, backtests, training, validation and writes, with input sizes and peak process memory. Report the five most expensive functions and any repeated work. On a fixed representative slice, compare the existing approach, typed Parquet with the existing engine, and DuckDB or Polars for the measured data bottleneck. Verify symbol/time alignment, indicator warm-up and equivalent outputs. Report one-time conversion separately and do not claim an end-to-end speedup from a scan-only benchmark.

## Reproducing the OHLCV measurement

From the repository root, use an output directory that does not already contain a generated dataset:

```sh
UV_CACHE_DIR=/tmp/andria-analysis-uv uv run --no-sync python scripts/benchmark_ohlcv_analysis.py --directory .tmp/ohlcv-analysis-new
```

This writes approximately 574 MB of CSV plus compressed Parquet and small result files. It runs locally, uses synthetic data and makes no data-provider requests. `.tmp` is ignored by Git. The measurement script and report are the only additions to application source/documentation; production pipeline behavior was not changed.
