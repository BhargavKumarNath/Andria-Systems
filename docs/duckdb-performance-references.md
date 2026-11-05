# DuckDB performance evidence for an OHLCV research pipeline

Research date: 2026-10-23. Sources are DuckDB's own documentation. These establish capabilities and constraints, not a measured speedup for the user's dataset. Current/stable documentation redirects to 2.0 LTS; the memory, spill, and profiling claims below also have explicit 1.4 LTS references. Match the installed version before using newer configuration options.

## What direct Parquet querying actually saves

DuckDB reads only selected columns from Parquet and pushes eligible filters into the scan. Row-group skipping uses Parquet statistics/zonemaps when available. This avoids reading irrelevant data, but a full-history query can still read most of a dataset. Compression does not make arbitrary queries instantaneous. [Parquet overview](https://www.duckdb.org/docs/current/data/parquet/overview)

Filters on Hive partition keys can skip entire files. For OHLCV, explicit year/month partition predicates alongside timestamp predicates make this mechanism available. A timestamp predicate should not simply be assumed to imply a predicate on separately stored year/month keys; inspect the plan. [Hive partitioning](https://duckdb.org/docs/current/data/partitioning/hive_partitioning)

DuckDB's file-format guidance says projection/filter/aggregation workloads are good direct-Parquet candidates. Row groups and file sizes affect performance and parallelism; it suggests roughly 100,000–1,000,000 rows per group and 100 MB–10 GB per file. These are starting points, not fixed targets for all datasets. Avoid creating tiny per-symbol/day files blindly. [File formats](https://duckdb.org/docs/lts/guides/performance/file_formats)

The same guide recommends considering native DuckDB tables for join-heavy workloads or many repeated queries, if duplicate storage is affordable. Direct Parquet scanning is therefore an option to benchmark, not automatically the fastest layout. [File formats](https://duckdb.org/docs/2.0/guides/performance/file_formats)

## Memory and spill caveats

`memory_limit` controls the buffer manager, not total process RSS. Vectors, query results, and complex aggregate state can allocate outside it. Fetching a large result into Python must therefore be measured separately. [1.4 memory-limit documentation](https://duckdb.org/docs/1.4/configuration/pragmas#memory-limit)

DuckDB supports spilling grouping, joining, sorting, and windowing to a temporary directory. Multiple blocking operators in one query can still exhaust memory; 1.4 documents non-spillable `list`/`string_agg` aggregate states and related `PIVOT` limitations. Spilling also requires disk space and performs disk I/O. [1.4 workload tuning](https://duckdb.org/docs/1.4/guides/performance/how_to_tune_workloads#larger-than-memory-workloads-out-of-core-processing)

The official OOM guide recommends reducing threads, breaking a query into stages, or lowering the memory limit when operations outside the buffer manager cause process termination. Its 50–60% suggestion is an OOM mitigation, not a universal optimal setting. [1.4 OOM guide](https://duckdb.org/docs/1.4/guides/troubleshooting/oom_errors)

## OHLCV workloads and correctness implications

Ordered window functions and ASOF joins express useful market-data operations. ASOF matches each left row to at most one right row, using symbol equality and a time inequality such as `bar_time >= event_time`. This can express latest-known-event alignment. [ASOF semantics](https://duckdb.org/docs/2.0/sql/query_syntax/from#as-of-joins)

Inference for this project: filtering, cleaning, resampling, rolling averages, lagged returns, and event alignment are plausible DuckDB workloads. A sort/window-heavy pipeline can still dominate memory and runtime. Python strategy callbacks, sequential portfolio state, execution simulation, model training, and downloading data are separate workloads; replacing storage alone does not establish an acceleration for those stages.

Inference for OHLCV correctness: compute trailing indicators with sufficient earlier bars before clipping to the requested output range. An ASOF match must use information availability time, not merely a reporting period. Explicitly decide whether a signal at a bar close can trade at that close or only a later bar. These choices affect correctness independently of speed.

## How to verify an improvement

`EXPLAIN` shows a plan and estimated cardinalities without execution. `EXPLAIN ANALYZE` executes the query and reports actual cardinalities and per-operator timings. Inspect scan filters/projections and join expansion, then measure complete wall time including conversion/export. [1.4 profiling](https://duckdb.org/docs/1.4/sql/statements/profiling)

Inference: compare the same symbols, date range, adjustment policy, and outputs; distinguish cold and repeated runs and record peak process RSS plus temporary disk usage. Include one-time CSV-to-Parquet conversion separately. A synthetic benchmark can demonstrate the mechanism but cannot predict a 1–3 hour production run without its stage timings and representative data.
