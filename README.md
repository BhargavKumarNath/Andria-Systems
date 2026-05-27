# Andria Systems

### Institutional Investor Intelligence Platform

[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/)
[![Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)
[![MyPy](https://img.shields.io/badge/type%20checked-mypy-informational.svg)](https://mypy.readthedocs.io/)
[![Bandit](https://img.shields.io/badge/security-bandit-yellow.svg)](https://bandit.readthedocs.io/)
[![Dashboard](https://img.shields.io/badge/dashboard-live-brightgreen)](https://bhargav12321-andria-backend.hf.space)
[![Frontend](https://img.shields.io/badge/frontend-live-brightgreen)](https://andria-systems.vercel.app)

*Transforms 116M+ SEC 13F institutional holdings records into behavioral archetypes, macro regime labels, and regime-conditioned smart money signals.*

**[Dashboard](https://andria-systems.vercel.app)**

</div>

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [The Problem](#the-problem)
- [Solution Architecture](#solution-architecture)
- [Data Pipeline](#data-pipeline)
- [Feature Engineering: Manager DNA](#feature-engineering-manager-dna)
- [Model Development](#model-development)
- [Backtesting Framework](#backtesting-framework)
- [Evaluation and Statistical Rigor](#evaluation-and-statistical-rigor)
- [Technical Stack](#technical-stack)
- [MLOps and CI/CD](#mlops-and-cicd)
- [Deployment](#deployment)
- [Analytics Dashboard](#analytics-dashboard)
- [CLI Reference](#cli-reference)
- [Project Structure](#project-structure)
- [Setup and Installation](#setup-and-installation)
- [Configuration Reference](#configuration-reference)
- [Security](#security)
- [Testing](#testing)
- [Observability and Logging](#observability-and-logging)
- [Scalability Considerations](#scalability-considerations)
- [Engineering Tradeoffs](#engineering-tradeoffs)
- [Roadmap](#roadmap)
- [Lessons Learned](#lessons-learned)

---

## Executive Summary

Andria Systems is a production-grade quantitative research platform built to extract applicable hedge fund signals from the regulatory disclosure footprint of institutional fund managers. The system ingests raw SEC 13F filings, constructs 14-feature behavioral profiles for thousands of managers, clusters them into semantic archetypes using density-based methods, detects macro regimes from FRED and OFR macro indicators, and generates a novel signal called the Regime-Conditioned Activist Conviction Score (RACS v2).

The fundamental thesis is that not all institutional ownership is equivalent. A position representing high-conviction accumulation by a known activist manager in a low-volatility expansion regime should be scored very differently from the same position held passively by an index tracker during a credit stress event. RACS quantifies this distinction systematically across all quarters dating back to 2004.

The signal feeds a rigorous backtesting framework with mandatory pre-flight look-ahead bias detection, T+1 execution realism, square-root market impact modeling, walk-forward validation, capacity analysis, signal half-life measurement, and Benjamini-Hochberg FDR-corrected statistical significance testing at the regime level. The entire system is deployed end-to-end: a Dash analytics dashboard runs on Hugging Face Spaces, a Next.js data interface runs on Vercel, and a three-stage GitHub Actions pipeline validates and deploys both services on every push to main.

---

## The Problem

SEC Form 13F requires institutional investment managers with assets under management exceeding $100M to disclose their equity holdings within 45 days of each quarter end. This creates a public, structured, machine-readable dataset covering virtually every major fund in the United States, updated quarterly. The data is rich but raw: tens of millions of rows per quarter, inconsistent formatting, duplicate filings, mixed put/call/equity exposures, and no native notion of manager intent or behavioral archetype.

The challenge is not access to the data. It is turning it into something useful.

Three specific problems motivate this project:

1. **Manager heterogeneity.** The same stock appearing in 1,000 13F filings may represent 800 passive index positions, 150 closet-indexers, and 50 high-conviction activists. Treating them uniformly destroys signal. The system must identify which managers generate alpha and characterize their behavioral patterns from first principles.

2. **Macro regime dependence.** Factor performance is not stationary. Momentum strategies decay during reversals. Value investors thrive in recoveries but suffer in rate-shock regimes. Any signal derived from institutional flows must be conditioned on the prevailing macro environment to avoid regime-blind performance attribution.

3. **Look-ahead bias at scale.** Academic backtests routinely overstate performance by using filing data before it would have been available to investors. The 45-day lag is mandatory but easily misapplied when working with large datasets and complex join logic. A production system needs automated, non-bypassable pre-flight checks.

---

## Solution Architecture

The system is organized into four logical layers, executed sequentially through a CLI-driven pipeline.

```
                         ┌─────────────────────────────────────────┐
                         │              DATA SOURCES               │
                         ├─────────────┬────────────┬─────────────┤
                         │  SEC EDGAR  │  FRED API  │  OFR Stress │
                         │  13F (raw   │  Macro     │  Index      │
                         │  TSV/CSV)   │  Indicators│  (CSV/XLSX) │
                         └──────┬──────┴─────┬──────┴──────┬──────┘
                                │            │             │
                                └────────────┴─────────────┘
                                             │
                                      INGESTION LAYER
                                   DuckDB SQL pipelines
                                  Hive-partitioned Parquet
                                   Schema contracts (Phase 0)
                                             │
                          ┌──────────────────┴──────────────────┐
                          │                                     │
                    PHASE 1: DNA                          PHASE 2: REGIME
                 14 Behavioral Features               5 Macro Features
                 per Manager per Quarter              (VIX, Yield Spread,
                 HDBSCAN Clustering                    Credit Spread, Rate
                 UMAP 2D Embedding                     Delta, OFR Stress)
                 4 Semantic Archetypes               Gaussian HMM (4 states)
                          │                          4 Regime Labels
                          └──────────────┬──────────────────────┘
                                         │
                                  RACS ENGINE v2
                           Regime-Conditioned Activist
                               Conviction Score
                          5-stage DuckDB SQL pipeline
                                         │
                              BACKTEST FRAMEWORK
                           45-day filing lag enforced
                          NYSE calendar-aware date snap
                           T+1 execution + slippage
                           Mandatory LeakageAudit (6 checks)
                           Square-root market impact model
                           Walk-forward + Capacity + Decay
                           BH FDR-corrected significance
                                         │
                       ┌─────────────────┴──────────────────┐
                       │                                    │
                 GOVERNANCE &                         DEPLOYMENT
                 EXPERIMENT TRACKING                 Dash (HF Spaces)
                 MLflow + Config Snapshots           Next.js (Vercel)
                 Parameter Lineage (JSONL)           GitHub Actions CI/CD
```

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| DuckDB over Spark | 116M rows fits in 10 GB RAM with columnar vectorized execution, Spark overhead is unjustified at this scale |
| Polars over Pandas | Zero-copy Arrow memory model, lazy evaluation, native parallelism, 3-10x faster on large aggregations |
| HDBSCAN over k-means | No need to pre-specify cluster count; density-based clusters match the irregular manager distribution |
| Gaussian HMM for regimes | Latent-variable model suited to unobserved macro states; interpretable emission parameters |
| DuckDB for RACS | 5-stage SQL pipeline with temp-table staging keeps peak memory under 3 GB for the entire compute |
| Pydantic v2 settings | Type-safe config with env-var overrides, YAML base config, and singleton lazy-loading |

---

## Data Pipeline

### Ingestion

The raw dataset comes from three sources, each with a dedicated ingester class:

**SEC EDGAR 13F** (`andria ingest edgar`): Reads raw `INFOTABLE.tsv` and `COVERPAGE.tsv` files from a Hive directory structure (`quarter=YYYYQN/`). Builds a combined table with standardized exposure types (Equity, Put, Call), enforces a minimum valid date of 2004-01-01, and writes Hive-partitioned Parquet using zstd compression with 100K-row groups. Row-count integrity checks and duplicate detection run after every ingestion batch.

**FRED Macro Data** (`andria ingest fred`): Loads quarterly macro indicator CSV files from `dataset/raw/fred/`. Outputs a single Parquet file with source-file provenance tracking. Memory is bounded to 10 GB via DuckDB's `memory_limit` pragma.

**OFR Financial Stress Index** (`andria ingest ofr`): Handles both CSV and XLSX source formats with fallback to an existing processed Parquet file when raw files are unavailable. Maintains the same memory discipline as the FRED ingester.

### Dataset Registry and Schema Contracts

All artifact paths are resolved through `DatasetRegistry`, a centralized path-resolution class that enforces existence checks and exposes `is_phase1_complete()` / `is_phase2_complete()` guards. Every DataFrame crossing a module boundary is validated against a schema contract (defined in `andria/core/schemas.py`):

- `EDGARRawContract`: ACCESSION_NUMBER, FILINGMANAGER_NAME, CUSIP, VALUE, PUTCALL, exposure_type, source_quarter
- `ManagerDNAContract`: All 14 behavioral features with expected dtypes (Float64 or Int32)
- `RegimeContract`: date (Date), regime_label (Utf8), regime_prob (Float64)
- `RACSContract`: cusip, racs_final, regime_label, crowding_penalty

Schema violations raise `DataContractError` at the boundary, not silently downstream.

---

## Feature Engineering: Manager DNA

The Manager DNA module constructs 14 behavioral features for each institutional manager per quarter, aggregated from their raw EDGAR holdings. These features collectively characterize how a manager allocates capital, hedges risk, trades, and changes their mind.

All computation runs through a 6-stage DuckDB in-memory pipeline using temporary tables to keep peak memory well within the configured limit:

| Feature | Definition | Signal |
|---------|-----------|--------|
| `avg_hhi` | Portfolio concentration (Herfindahl-Hirschman Index) | Conviction level |
| `avg_put_ratio` | Put option value / total portfolio value | Hedging posture |
| `log_avg_aum` | Log-transformed quarterly AUM | Fund scale |
| `avg_turnover` | QoQ weight change (L1 norm of weight delta) | Trading frequency |
| `avg_conviction_delta` | QoQ change in HHI | Conviction trend |
| `new_position_rate` | Fraction of positions newly initiated | Discovery rate |
| `exit_rate` | Fraction of positions fully exited | Decisiveness |
| `avg_holding_duration_qtrs` | Avg quarters a CUSIP is held | Time horizon |
| `top5_concentration` | Combined weight of top 5 holdings | Portfolio construction style |
| `options_notional_ratio` | Options notional / equity notional | Leverage posture |
| `shared_vote_ratio` | Fraction of holdings with shared voting | Governance engagement |
| `amendment_rate` | Frequency of 13F amendments | Filing discipline |
| `quarters_active` | Total filing quarters observed | Manager longevity |
| `aum_volatility` | Std dev of quarterly AUM | Business stability |

A manager must have at least 4 active quarters in the dataset to qualify for feature computation, ensuring behavioral signals are based on observed history rather than single-quarter snapshots.

---

## Model Development

### HDBSCAN Manager Clustering

The clustering pipeline projects 14-dimensional manager DNA vectors into a 2D UMAP embedding, then applies HDBSCAN density-based clustering to identify natural behavioral groups.

**UMAP configuration:**
- `n_components=2`, `n_neighbors=30`, `min_dist=0.1`, `metric=euclidean`, `random_state=42`

**HDBSCAN hyperparameter sweep:**
- `min_cluster_size` swept across [50, 100, 150, 200, 300]
- `min_samples_ratio=0.25` (samples = min_samples_ratio * min_cluster_size)
- Best configuration selected by silhouette score and Davies-Bouldin index

**Archetype labeling via cosine similarity:** After clustering, each cluster centroid is assigned one of four semantic archetype labels by computing cosine similarity against hand-crafted prototype vectors in the 14-dimensional feature space:

| Archetype | Characteristics |
|-----------|----------------|
| **Conviction Activists** | High HHI, low put ratio, low turnover, long holding duration |
| **Index Huggers** | Low HHI, high AUM, low conviction delta, high quarters active |
| **Macro Tourists** | High put ratio, high turnover, high options notional |
| **Nimble Traders** | Low AUM, high turnover, high new position rate, high exit rate |

Only the "Conviction Activists" archetype contributes to RACS signal generation.

### Gaussian HMM Macro Regime Detection

The `MacroRegimeDetector` fits a 4-state Gaussian HMM to five standardized macro features extracted from FRED and OFR:

| Feature | Source | Interpretation |
|---------|--------|---------------|
| `vix_level` | FRED | Market uncertainty / fear gauge |
| `yield_spread_10y2y` | FRED | Recession signal (inversion = warning) |
| `credit_spread_hy` | FRED | Systemic credit stress |
| `fed_funds_delta` | FRED | Rate policy direction |
| `ofr_stress_index` | OFR | Systemic financial stress |

**HMM configuration:**
- `n_components=4`, `covariance_type=full`, `n_iter=1000`, `random_state=42`
- Resampled to quarter-end frequency to align with 13F filing cadence

**State-to-regime mapping** uses cosine similarity against calibrated prototype vectors (z-scored):

| Regime | VIX | Yield Spread | Credit | Rate Delta | OFR |
|--------|-----|--------------|--------|------------|-----|
| Goldilocks | -1.2 | +0.5 | -0.8 | -0.3 | -1.0 |
| Recovery | -0.3 | +0.2 | -0.1 | +0.5 | -0.3 |
| Rate_Shock | +0.5 | -1.5 | +0.3 | +1.8 | +0.5 |
| Recession_Fear | +2.0 | -0.5 | +2.0 | -1.0 | +2.0 |

This mapping keeps regime labels interpretable and stable across retraining runs, avoiding the arbitrary label permutation problem inherent to unsupervised sequence models.

### RACS Signal Engine (v2)

RACS v2 is computed through a 5-stage DuckDB SQL pipeline that runs entirely within a single database connection, staging intermediate results as temporary tables to avoid materializing large intermediate joins:

**Stage 1:** Identify Conviction Activist managers from the clustering artifact.

**Stage 2:** Extract and normalize their EDGAR holdings into quarterly portfolio weights.

**Stage 3:** Compute `racs_raw` per CUSIP per quarter:

```
racs_raw = consensus_weight * ln(activist_buyers_count + 1.1)
```

where `consensus_weight` is the aggregate portfolio-weight allocated to that CUSIP by all identified activist managers, and `activist_buyers_count` is the count of distinct activist managers holding the position. A minimum of 2 activist buyers is required for a signal to qualify.

**Stage 4:** Compute `crowding_penalty` as the ratio of total institutional holders of that CUSIP to total reporting managers in that quarter. Higher crowding means the position is no longer differentiated.

**Stage 5:** Apply regime conditioning:

```
regime_adjusted_racs =
    racs_raw
    * (1 - crowding_penalty)
    * (1 + regime_weight * regime_prob)    [for Goldilocks, Recovery]
    * (1 - regime_weight * regime_prob)    [for Rate_Shock, Recession_Fear]
```

where `regime_weight=0.3` and `regime_prob` is the HMM posterior probability of the assigned regime. The signal is validated against `RACSContract` before being written to disk.

---

## Backtesting Framework

The backtesting framework is designed around three principles: look-ahead bias cannot be bypassed, execution must reflect real-world constraints, and statistical significance must be tested across multiple hypotheses simultaneously.

### AlphaFactoryEngine

The event-study engine (`andria/backtest/engine.py`) orchestrates the full pipeline:

1. **Filing lag enforcement:** Converts quarter strings to calendar-aware entry dates by adding 45 calendar days to quarter-end, then snapping to the nearest NYSE trading day using `MarketCalendar`. This replaces naive timedelta arithmetic that silently lands on weekends and holidays.

2. **Polars asof joins:** Entry price is sourced as the first available adjusted close on or after `exec_date`. Exit price is sourced as the last available adjusted close on or before `exit_date` (90 calendar days later). Both joins are CUSIP-keyed, preventing cross-security contamination.

3. **Survivorship bias handling:** Positions with null exit price (delisted or bankrupt securities) are assigned a return of -100%, not dropped.

4. **Liquidity-bounded position sizing:** Each position is sized at $1M / volatility_30d, capped at 5% of the 30-day average daily traded volume in USD.

5. **Mandatory LeakageAudit:** Runs before any metrics are computed. Any ERROR-level finding raises `BacktestError` and halts execution.

6. **ExecutionEngine V1:** Applies T+1 entry delay with VWAP slippage modeling.

7. **TransactionCostModel:** Applies round-trip fixed and market impact costs.

8. **Regime-conditional diagnostics:** Returns performance metrics stratified by macro regime, with FDR-corrected p-values.

### ExecutionEngine V1

Applies three layers of execution realism:

- **T+1 fill delay:** Entry is executed at the next trading day's open, reflecting the realistic latency between signal observation and order placement.
- **VWAP slippage:** Slippage = 0.5 * (daily_vol / sqrt(participation_ratio)). Applied as a discount to the raw entry price.
- **ADV participation cap:** Positions representing more than 5% of 30-day average daily traded volume are excluded. This prevents the backtest from allocating to positions the strategy could not realistically fill.

### TransactionCostModel

Round-trip transaction costs are modeled as the sum of a fixed cost tier and a square-root market impact term:

```
adtv_usd = volume_30d_avg * close_price

fixed_cost_bps = 20 bps   if adtv_usd > $2B / 252 (large cap daily threshold)
               = 50 bps   otherwise (small cap)

market_impact_bps = gamma * volatility_30d * sqrt(trade_size_usd / adtv_usd)
                  (gamma = 0.1, capped at 500 bps)

total_exec_cost = (fixed_cost_bps + market_impact_bps) * 2  (round trip)
net_fwd_return  = fwd_return_raw - total_exec_cost
```

The square-root impact model follows the Almgren-Chriss family of market impact formulas, appropriate for infrequent, non-HFT institutional trades.

### Leakage Audit

Six pre-flight checks run unconditionally inside `run_backtest()` before any metrics are computed. ERROR-level findings raise `BacktestError`; WARNING-level findings are logged and included in the audit report.

| Check | Severity | Description |
|-------|----------|-------------|
| `check_future_timestamps` | ERROR | Signal exec_date after max available pricing date |
| `check_lookahead_joins` | ERROR | Exit price date precedes exec_date |
| `check_forward_contamination` | WARNING | Null entry prices after asof join (join direction issue) |
| `check_duplicate_signals` | WARNING | Identical (cusip, quarter) signal pairs |
| `check_overlapping_labels` | WARNING | Same CUSIP in overlapping 90-day holding windows |
| `check_regime_leakage` | WARNING | Regime label assigned using post-signal-quarter data |

This audit is non-bypassable by design. There is no flag to skip it.

### Walk-Forward Validation

`WalkForwardValidator` divides the full sample into expanding or rolling train/test windows (default: 5-year train, 1-year test) and re-runs the RACS generation and backtest pipeline on each fold. Output includes per-fold Sharpe, mean return, maximum drawdown, and hit rate. Monotonically declining fold performance is flagged as an in-sample overfitting signal.

### Capacity Analysis

`CapacityAnalyzer` stress-tests the strategy across AUM levels from $10M to $5B. At each AUM level it computes the fraction of positions that would exceed the 5% ADV participation cap, the resulting reduction in portfolio coverage, and the implied Sharpe ratio. The "capacity cliff" is identified as the AUM level where Sharpe falls below 50% of the unconstrained baseline. A liquidity bottleneck report ranks individual tickers by the AUM at which they first breach the cap.

### Signal Decay Analysis

`SignalDecayAnalyzer` measures the Information Coefficient (Spearman rank correlation between RACS and forward returns) at four horizons: 1, 5, 20, and 60 trading days. The signal half-life is estimated as the horizon at which IC falls below a threshold of 0.05. Regime-conditional IC curves reveal whether signal decay accelerates during stress regimes, which would suggest the signal's predictive window is regime-dependent.

---

## Evaluation and Statistical Rigor

### Performance Metrics

The `diagnostics` module computes three primary metrics:

- **Annualized Sharpe Ratio:** `sqrt(4) * mean(excess_return) / std(excess_return)` using quarterly compounding periods.
- **Maximum Drawdown:** Peak-to-trough decline in the cumulative return series.
- **Regime-Conditional Returns:** Mean net return and Sharpe stratified by HMM macro regime.

### Multiple Hypothesis Correction

Performance is evaluated across four macro regimes simultaneously. Without correction, testing four independent hypotheses at alpha=0.05 produces a family-wise error rate of approximately 18%. The `benjamini_hochberg_fdr()` function applies the Benjamini-Hochberg procedure to the four regime-level p-values (from one-sided t-tests of mean return > 0), controlling the False Discovery Rate at 5%. Only FDR-significant regimes are reported as having statistically meaningful positive expected returns.

### Regime Transition Analysis

`regime_transition_metrics()` separates trades initiated within 10 days of a regime change from those initiated in stable-regime periods. Performance during regime transitions is typically worse due to factor rotation, correlation spikes, and liquidity deterioration. Quantifying this effect informs position sizing rules for the live signal.

---

## Technical Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Data processing** | DuckDB | >=1.1.0 | SQL over Parquet, Hive partitioning, temp-table staging |
| **DataFrame operations** | Polars | >=1.0.0 | Vectorized transforms, asof joins, zero-copy Arrow |
| **Serialization** | PyArrow | >=16.0.0 | Parquet I/O, DuckDB bridge |
| **Clustering** | scikit-learn (HDBSCAN), UMAP-learn | >=1.5.0, >=0.5.6 | Manager archetype detection |
| **Regime modeling** | hmmlearn | >=0.3.2 | Gaussian HMM macro regime detection |
| **Statistics** | scipy, statsmodels | >=1.13.0, >=0.14.2 | t-tests, Spearman IC, regression diagnostics |
| **Market data** | yfinance, exchange-calendars | >=0.2.40, >=4.5.0 | Adjusted OHLCV pricing, NYSE calendar |
| **Experiment tracking** | MLflow | >=2.13.0 | Run tracking, metric logging, artifact storage |
| **Configuration** | Pydantic v2, pydantic-settings | >=2.7.0, >=2.3.0 | Type-safe config, env-var overrides, YAML loading |
| **Logging** | structlog | >=24.1.0 | Structured JSON logging with contextvars |
| **CLI** | Typer, Rich | >=0.12.0, >=13.7.0 | Type-annotated commands, colored console output |
| **Dashboard** | Dash, Plotly, dash-bootstrap-components | >=2.17.0 | 5-page analytics dashboard (CYBORG theme) |
| **Frontend** | Next.js 14, Recharts | 14.2.3, >=2.12.7 | Static-exported data interface |
| **API** | FastAPI, Uvicorn | >=0.110.0, >=0.29.0 | Async REST endpoints |
| **Orchestration** | Prefect | >=2.19.0 | Pipeline scheduling and observability |
| **Telemetry** | prometheus-client | >=0.20.0 | Prometheus metrics exposition |
| **Containerization** | Docker (python:3.12-slim) | | Reproducible HF Spaces deployment |
| **CI/CD** | GitHub Actions | | Three-job validate-and-deploy pipeline |
| **Code quality** | Ruff, MyPy, Bandit, pip-audit | >=0.4.0 | Lint, type check, security scan, dependency audit |
| **Testing** | pytest, pytest-cov, pytest-benchmark | >=8.2.0 | Unit and integration test suite |

---

## MLOps and CI/CD

### GitHub Actions Pipeline

Every push and pull request to `main` triggers a three-job pipeline defined in `.github/workflows/ci.yml`:

```
push to main
     │
     ▼
┌─────────────────────────────────────────────────┐
│                    validate                     │
│                                                 │
│  1. Set up Python 3.12                          │
│  2. pip install -e .[dev]                       │
│  3. Bandit security scan (andria/ -ll -s B608)  │
│  4. pip-audit dependency vulnerability check    │
│  5. Ruff lint (andria/ + tests/)                │
│  6. MyPy static type checking (andria/)         │
│  7. pytest with coverage (--cov=andria)         │
└────────────┬────────────────────────┬───────────┘
             │                        │
             ▼                        ▼
    deploy-to-hf-spaces       deploy-frontend
    (orphan branch push)      (Vercel CLI build)
```

The `deploy-to-hf-spaces` job creates a fresh orphan branch, strips `artifacts/`, `reports/`, `data/`, `.env`, and compiled Python bytecode (`__pycache__`, `.pyc`), embeds the source commit SHA in `.git_sha`, and force-pushes to the Hugging Face Space repository. This ensures the space always reflects a clean build without binary history.

The `deploy-frontend` job runs Vercel CLI commands from the repository root (not `frontend/`), relying on the Vercel project's `root=frontend` configuration. The sequence is `vercel pull --yes --environment=production`, then `vercel build --prod`, then `vercel deploy --prebuilt --prod`.

### Experiment Governance

`andria/research/governance.py` provides two reproducibility utilities:

- `save_config_snapshot()`: Serializes the full `Settings` object to a timestamped JSON file under `artifacts/configs/`, including the git commit SHA resolved from `$GIT_SHA` environment variable (set by CI), `.git_sha` file, or the local `.git` directory.
- `ParameterLineage`: An append-only JSONL log (`artifacts/provenance/lineage.jsonl`) that records every config-to-artifact association. Each entry contains the run ID, parameter hash, output artifact paths, and timestamp. This provides a complete audit trail from parameters to results.

MLflow experiment tracking is configured at `artifacts/mlflow/`, with the experiment named `andria_phase4`. Run `mlflow ui --backend-store-uri artifacts/mlflow` to browse runs locally.

---

## Deployment

### Backend: Hugging Face Spaces (Docker)

The analytics dashboard runs as a Docker container on Hugging Face Spaces using CPU Basic hardware. The Dockerfile uses `python:3.12-slim` as its base, installs system build dependencies (`gcc`, `g++`, `libgomp1`) required by scikit-learn's native extensions, and installs the package in production mode via `pip install --no-cache-dir .`:

```dockerfile
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gcc g++ libgomp1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml README.md ./
COPY andria/ ./andria/
RUN pip install --no-cache-dir .
EXPOSE 7860
CMD ["andria", "serve", "--port", "7860", "--host", "0.0.0.0"]
```

The `--host 0.0.0.0` flag is required for the Dash app to accept connections from outside the container. Without it, the Dash server binds only to `127.0.0.1` and the Space reports "App not running".


### Frontend: Vercel (Next.js Static Export)

The Next.js frontend uses `output: 'export'` in `next.config.mjs`, producing a fully static HTML/CSS/JS bundle with no server-side rendering. This allows deployment to Vercel's CDN with zero cold-start latency and no API routes required.

```javascript
// frontend/next.config.mjs
const nextConfig = { output: 'export' };
export default nextConfig;
```

The frontend is deployed via Vercel CLI in the CI pipeline, not through the Vercel Git integration. This gives the pipeline explicit control over when deployments happen and ensures they only occur after all validation checks pass.

**Live URL:** [https://andria-systems.vercel.app](https://andria-systems.vercel.app)

---

## Analytics Dashboard

The Dash dashboard (`andria/dashboard/app.py`) provides five pages of research analytics, served on port 8050 locally and port 7860 in the Docker container:

| Page | Content |
|------|---------|
| **Overview** | Run count, pipeline status badges, phase completion summary |
| **Manager DNA** | Archetype clustering results table with behavioral feature summaries |
| **Regime Detection** | HMM regime probabilities scatter plot by quarter, colored by regime label |
| **RACS Signals** | Top 50 signal leaderboard ranked by `regime_adjusted_racs` |
| **Backtest Results** | MLflow experiment summary and run browser launch link |

All pages load artifact data on-demand from `artifacts/runs/{run_id}/` and display a "no data" card with pipeline instructions if the required artifacts are missing. The dashboard uses the CYBORG Bootstrap theme (`dash-bootstrap-components`) with a 5-minute client-side cache timeout.

---

## CLI Reference

All pipeline operations are exposed through the `andria` CLI, built with Typer and Rich for colored terminal output.

### Data Ingestion

```bash
# Ingest all data sources sequentially
andria ingest all

# Ingest individual sources
andria ingest edgar
andria ingest fred
andria ingest ofr
```

### Pipeline Execution

```bash
# Phase 1: Build Manager DNA + HDBSCAN clustering
andria run phase1

# Phase 2: HMM regime detection + RACS signal generation
andria run phase2
```

### Data Validation

```bash
# Validate all registered datasets against schema contracts
andria validate
```

### Dashboard and Reports

```bash
# Launch Dash dashboard (default port 8050)
andria serve

# Custom port and host
andria serve --port 9090 --host 0.0.0.0

# Debug mode
andria serve --debug

# Generate Markdown research report
andria report

# Report for a specific run ID
andria report --run-id 20250101T120000_abc123
```

### System Information

```bash
# Print configuration, artifact paths, and dataset status
andria info
```

### Global Options

All commands accept `--log-level` (DEBUG, INFO, WARNING, ERROR) and `--json-logs` for structured JSON log output compatible with log aggregation systems.

### Full Workflow Example

```bash
# 1. Create and configure environment
git clone <repo>
cd andria-systems
python -m venv .venv && source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"

# 2. Configure API keys
cp .env.example .env
# Edit .env: add FRED_API_KEY=your_key_here

# 3. Place raw EDGAR TSV files in dataset/raw/edgar/quarter=YYYYQN/
# Place FRED macro CSVs in dataset/raw/fred/
# Place OFR stress index files in dataset/raw/ofr/

# 4. Run full pipeline
andria ingest all
andria run phase1
andria run phase2

# 5. Explore results
andria validate
andria report
andria serve
```

---

## Project Structure

```
andria-systems/
├── andria/                         # Core Python package
│   ├── core/
│   │   ├── config.py               # Pydantic v2 settings (YAML + env-var overrides)
│   │   ├── exceptions.py           # Domain exception hierarchy (9 exception types)
│   │   ├── logging.py              # Structlog configuration (JSON or console)
│   │   ├── schemas.py              # DataFrame schema contracts (4 contracts)
│   │   ├── db.py                   # DuckDB connection factory with context managers
│   │   ├── evaluation_gate.py      # Publication gate with configurable criteria
│   │   ├── artifact_registry.py    # Artifact tracking and deduplication
│   │   └── telemetry.py            # Prometheus metrics
│   ├── cli/
│   │   └── main.py                 # Typer CLI (ingest, run, validate, serve, report, info)
│   ├── ingestion/
│   │   ├── registry.py             # Dataset path resolution + schema validation
│   │   ├── edgar.py                # SEC EDGAR 13F ingestion (Hive Parquet)
│   │   ├── fred.py                 # FRED macro indicator ingestion
│   │   └── ofr.py                  # OFR Financial Stress Index ingestion
│   ├── data/
│   │   ├── market_loader.py        # yfinance OHLCV loader with staleness detection
│   │   ├── cusip_mapper.py         # CUSIP-to-ticker mapping with fallback logic
│   │   └── provenance.py           # Data lineage tracking and SHA-256 hashing
│   ├── features/
│   │   └── manager_dna.py          # 14-feature behavioral profiles (6-stage DuckDB pipeline)
│   ├── models/
│   │   ├── clustering/
│   │   │   ├── engine.py           # HDBSCAN + UMAP + archetype labeling
│   │   │   └── diagnostics.py      # Silhouette score, Davies-Bouldin index
│   │   └── regime/
│   │       └── hmm.py              # Gaussian HMM (4-state macro regime detector)
│   ├── signals/
│   │   └── racs.py                 # RACS v2 (5-stage DuckDB pipeline)
│   ├── backtest/
│   │   ├── engine.py               # AlphaFactoryEngine (event-study backtester)
│   │   ├── execution.py            # ExecutionEngine V1 (T+1, slippage, ADV cap)
│   │   ├── costs.py                # TransactionCostModel (square-root impact)
│   │   ├── diagnostics.py          # Sharpe, max DD, BH FDR, regime metrics
│   │   ├── walk_forward.py         # Walk-forward validation (expanding/rolling)
│   │   ├── capacity.py             # Capacity cliff analysis ($10M to $5B AUM)
│   │   ├── signal_decay.py         # IC decay by horizon (half-life estimation)
│   │   ├── leakage_audit.py        # 6-check pre-flight look-ahead bias audit
│   │   ├── portfolio.py            # Portfolio construction logic
│   │   ├── factors.py              # Factor exposure decomposition
│   │   ├── monte_carlo.py          # Monte Carlo return simulation
│   │   └── overfitting.py          # Overfitting detection utilities
│   ├── research/
│   │   ├── governance.py           # Config snapshots, git SHA, parameter lineage
│   │   ├── experiment_tracker.py   # MLflow integration
│   │   ├── drift_monitor.py        # Signal and factor drift detection
│   │   └── reports.py              # Markdown report generator from artifacts
│   ├── orchestration/
│   │   └── pipeline.py             # PipelineOrchestrator (run manifests, progress)
│   ├── dashboard/
│   │   └── app.py                  # Dash app (5 pages, CYBORG theme)
│   └── utils/
│       └── market_calendar.py      # NYSE trading calendar with date snapping
├── frontend/                       # Next.js 14 static frontend
│   ├── src/                        # Page and component source
│   ├── public/data/                # JSON data files for frontend charts
│   ├── next.config.mjs             # output: 'export' (static build)
│   └── package.json
├── tests/
│   ├── unit/
│   │   ├── test_core.py            # Config, logging, exception tests
│   │   └── test_backtest.py        # Backtest engine, cost model, diagnostics tests
│   ├── integration/                # End-to-end pipeline tests
│   └── validation/
│       └── phase4_validation_suite.py   # Phase 4 validation suite
├── configs/
│   └── base.yaml                   # Default parameter configuration
├── dataset/
│   ├── raw/
│   │   ├── edgar/                  # Raw EDGAR TSV files (Hive-partitioned)
│   │   ├── fred/                   # Raw FRED macro CSVs
│   │   └── ofr/                    # Raw OFR stress index files
│   └── processed/                  # Processed Parquet datasets
├── artifacts/
│   ├── runs/{run_id}/              # Per-run artifacts (features, clusters, signals, regime)
│   ├── configs/                    # Config snapshots (JSON)
│   ├── provenance/                 # Parameter lineage log (JSONL)
│   └── mlflow/                     # MLflow experiment tracking
├── .github/workflows/ci.yml        # GitHub Actions (validate + deploy)
├── Dockerfile                      # Docker image for HF Spaces
├── pyproject.toml                  # Hatchling build config + all dependencies
├── .env.example                    # Environment variable template
└── .gitignore                      # Excludes dataset/, artifacts/, node_modules/, .env
```

---

## Setup and Installation

### Prerequisites

- Python 3.12+
- Node.js 20+ (for frontend development)
- Git

### Python Environment

```bash
# Clone the repository
git clone https://github.com/BhargavKumarNath/Andria-Systems
cd andria-systems

# Create a virtual environment
python -m venv .venv
source .venv/bin/activate    # Linux/macOS
.venv\Scripts\activate       # Windows

# Install with development dependencies
pip install -e ".[dev]"

# Verify the CLI is available
andria --help
```

### Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```ini
# Required: FRED API key for macro data ingestion
FRED_API_KEY=your_fred_api_key_here

# Optional overrides (all have defaults in config.py)
ANDRIA_DASHBOARD__PORT=9000
ANDRIA_INGEST__MEMORY_LIMIT_GB=8
ANDRIA_EXPERIMENT__SEED=123
```

A free FRED API key is available at [fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html).

### Frontend Development

```bash
cd frontend
npm install
npm run dev          # development server at localhost:3000
npm run build        # static export to frontend/out/
```

---

## Configuration Reference

All pipeline parameters are defined in `andria/core/config.py` as nested Pydantic models and can be overridden in two ways:

1. **YAML file:** `configs/base.yaml` (loaded at startup)
2. **Environment variables:** Prefixed with `ANDRIA_`, using `__` as the nested delimiter

```bash
# Examples
ANDRIA_DASHBOARD__PORT=9090
ANDRIA_BACKTEST__FILING_LAG_DAYS=60
ANDRIA_HMM__N_COMPONENTS=5
ANDRIA_EXPERIMENT__SEED=123
```

## Security

### Secrets Management

- The `.env` file (containing `FRED_API_KEY`) is excluded from version control via `.gitignore` and from Docker builds via `.dockerignore`.
- The CI deploy-to-hf-spaces job explicitly runs `git rm --cached .env 2>/dev/null || true` before committing the orphan branch, providing a second layer of protection against accidental secret exposure.
- Environment secrets (`HF_TOKEN`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) are stored in GitHub Secrets and injected at CI runtime.

### Static Analysis

Every CI run executes two security-focused tools:

- **Bandit:** Static security linter targeting the `andria/` package (`-ll` severity threshold, `-s B608` to suppress the SQL parameterization warning on DuckDB temp-table queries that are not injection vectors).
- **pip-audit:** Dependency vulnerability scanner sourcing from the OSV database. Known unfixable vulnerabilities in transitive dependencies are explicitly acknowledged with `--ignore` flags; all others fail the build.

---

## Testing

### Running Tests

```bash
# Full test suite with coverage
pytest tests/ -v --cov=andria --cov-report=html

# Unit tests only
pytest tests/unit/ -v

# Skip slow integration tests
pytest tests/ -v -m "not slow and not integration"

# Run benchmarks
pytest tests/ --benchmark-only
```

### Test Coverage

The test suite covers:

- Configuration loading and env-var overrides (`test_core.py`)
- Backtest engine correctness under controlled synthetic signals and pricing (`test_backtest.py`)
- TransactionCostModel with edge cases (illiquid positions, zero-volume tickers)
- Benjamini-Hochberg FDR correction with known p-value sequences
- Phase 4 validation suite with end-to-end artifact integrity checks

### Test Markers

```ini
# pytest.ini_options markers
slow        # long-running tests (excluded from CI fast mode)
integration # requires real dataset files (excluded by default)
```

---

## Observability and Logging

### Structured Logging

All modules use `get_logger(__name__)` from `andria/core/logging.py`, which returns a bound `structlog` logger. Every log event is a dictionary with named keys, making them trivially parseable by log aggregators (Datadog, Splunk, CloudWatch).

```python
# Example log event
logger.info("racs_signals_computed", rows=4821, stage="5/5")
logger.error("leakage_audit_error", check="check_future_timestamps", affected_rows=3, message="...")
```

In production (CI/Docker), enable JSON output:

```bash
andria serve --json-logs
```

In development, logs render with colors and timestamps to the terminal.

### MLflow Experiment Tracking

Each backtest run logs metrics (Sharpe, max DD, mean return by regime, FDR significance flags) to the local MLflow tracking store at `artifacts/mlflow/`. Browse runs with:

```bash
mlflow ui --backend-store-uri artifacts/mlflow --port 5000
```

### Provenance and Reproducibility

- Every pipeline run produces a `manifest.json` in `artifacts/runs/{run_id}/` containing the git commit SHA, run timestamp, parameters hash, and per-phase completion status.
- Config snapshots are written to `artifacts/configs/{run_id}.json` with a content hash for change detection.
- The parameter lineage log at `artifacts/provenance/lineage.jsonl` provides an append-only audit trail mapping every parameter set to its output artifacts.

The `experiment.seed=42` is propagated to numpy, Python's `random`, and scikit-learn at the start of every run, ensuring deterministic results across reruns on the same machine.

---

## Scalability Considerations

### Current Scale

The system is designed for workstation-scale operation: 116M+ EDGAR holdings rows processed within a 10 GB memory budget, approximately 2-3 GB peak during the backtest engine's pricing join phase.

### DuckDB as the Scale Boundary

DuckDB processes approximately 100M rows per minute on a modern laptop using vectorized columnar execution. The current dataset fits comfortably in this regime. However, if the EDGAR dataset grows to 500M+ rows (covering more quarters or daily rather than quarterly granularity), the memory-staged DuckDB pipeline would need to be replaced with out-of-core streaming or partitioned execution.

### Polars Lazy API

The current implementation uses Polars eager evaluation for simplicity and debuggability. Migrating hot paths (the backtest's asof join sequence, the RACS final output join) to Polars' lazy API with `collect()` at output boundaries would reduce peak memory by approximately 30-40% through predicate pushdown and column pruning.

### Horizontal Scaling Options

| Bottleneck | At Current Scale | At 10x Scale |
|-----------|-----------------|--------------|
| EDGAR ingestion | Single-threaded TSV parsing | Partitioned DuckDB COPY from S3 |
| Manager DNA features | 6-stage DuckDB pipeline, ~5 min | Partition by manager CIK, run in parallel |
| HDBSCAN clustering | 1-5 min on 14D vectors | GPU-accelerated RAPIDS cuML |
| HMM fitting | Seconds (4-state, quarterly) | No change needed |
| RACS SQL pipeline | 5-stage DuckDB, ~2-3 min | Materialize intermediate tables in cloud DW |
| Backtest asof joins | ~1-2 GB peak memory | Polars lazy + streaming mode |

---

## Engineering Tradeoffs

**DuckDB temp tables vs. Polars DataFrames for RACS:** The 5-stage RACS pipeline uses DuckDB SQL temp tables rather than chaining Polars transformations. This trades Polars' type safety and native Python integration for SQL's expressiveness on multi-table joins with window functions. The tradeoff pays off: the SQL is easier to audit for correctness in a domain where subtle aggregation errors (e.g., double-counting activist positions) are critical bugs.

**Eager Polars vs. lazy evaluation:** Eager evaluation is retained in the backtest engine because it makes debugging and auditing intermediate state straightforward. The leakage audit depends on inspecting the partially-constructed `trade_ledger` before costs are applied. Lazy evaluation would require materializing that boundary explicitly, removing the debugging benefit without a meaningful performance gain at current row counts.

**Full HMM covariance vs. diagonal:** The HMM uses `covariance_type=full`, allowing each state's emission distribution to capture correlations between macro features. This increases parameter count (from 5 variances to 5x5 covariance matrices per state) and is more sensitive to initialization. The tradeoff is justified: VIX and credit spreads are strongly correlated during stress regimes, and a diagonal covariance would mischaracterize the Recession_Fear state's joint distribution.

**Orphan branch HF deploy vs. monorepo deploy:** Creating a clean orphan branch for each HF Space push ensures the space's git history is always a single commit, keeping the repository small and preventing binary artifacts from accumulating across deployments. The tradeoff is that the space cannot leverage incremental push optimizations, but for a research dashboard of this size the force-push is fast enough.

**Static Next.js export vs. SSR:** Static export eliminates cold-start latency and removes the need for a Node.js server process on Vercel. The tradeoff is that all data must be embedded in the build or fetched client-side at load time. The frontend reads from `frontend/public/data/*.json` files updated when artifacts are generated, which is appropriate for a research dashboard with daily data freshness expectations.

---

## Roadmap

### Near Term

- **Real-time data bridge:** Replace the static `public/data/*.json` files with a lightweight API endpoint that the frontend queries, enabling the dashboard to display the latest pipeline results without a rebuild.
- **Alternative data integration:** Augment Manager DNA with proxy vote records, earnings call sentiment scores, and 13D/13G activist disclosure events.
- **Factor decomposition:** Expose `andria/backtest/factors.py` through the dashboard to show how much of the RACS portfolio return is explained by standard risk factors (momentum, value, size, quality).

### Medium Term

- **Online HMM updates:** Replace batch HMM fitting with an online EM variant that incorporates new quarterly data without full retraining, reducing the regime detection latency from end-of-quarter to rolling.
- **Multi-horizon RACS:** Generate separate RACS signals for 30-day, 90-day, and 180-day horizons rather than a single 90-day target, allowing portfolio managers to blend signals across time horizons.
- **Prefect orchestration:** Wire the pipeline phases into Prefect flows for scheduled quarterly execution, retry logic, and deployment-aware observability.

### Long Term

- **NLP layer on 13D filings:** 13D and SC 13D/A forms contain activist managers' stated intentions in free text. Extracting this would allow RACS to condition on stated investment thesis quality, not just position size.
- **Graph-based manager similarity:** Construct a co-holding graph where managers are nodes and shared CUSIP holdings are edges, weighted by overlap fraction. This would provide a richer measure of activist consensus than simple count aggregation.

---

## Lessons Learned

**The 45-day filing lag is not a detail, it is the most important line of code.** Early prototyping with naive `timedelta` arithmetic showed artificially strong backtest results that disappeared entirely once proper calendar-aware date snapping was applied. Every asof join, every date filter, every "first available after" logic had to be verified against the NYSE calendar before any metric was trusted.

**HDBSCAN's "noise" cluster is informative.** In early clustering experiments, aggressive hyperparameter settings assigned up to 40% of managers to the HDBSCAN noise cluster (label -1). Rather than treating noise as a failure, analyzing its composition revealed a large population of single-quarter filers and shell entities whose exclusion actually improved the quality of the four core archetypes.

**Regime conditioning is most powerful at the tails.** Testing RACS in isolation against RACS with regime conditioning showed that the regime multiplier has minimal impact in neutral macro environments (Recovery, moderate VIX) and a large impact during the Goldilocks and Recession_Fear extremes. This makes intuitive sense: activist outperformance is highest when macro tailwinds are strongest, and worst when macro headwinds dominate stock selection entirely.

**SQL in Python projects needs the same rigor as application code.** The five DuckDB SQL blocks in `racs.py` were each written, reviewed, and validated against manually-constructed test cases before being integrated. Inline SQL that runs correctly on test data but silently produces wrong results on production data (due to NULL handling differences, implicit type casting, or GROUP BY subtleties) is a class of bug that does not surface in unit tests.

**pip-audit is a moving target.** Three starlette vulnerabilities (PYSEC-2024-271, PYSEC-2024-277) were flagged during development and had no available fix because FastAPI had not yet migrated to starlette >= 1.0. Rather than pinning to an older, vulnerable version, explicit `--ignore` flags were added to CI with documentation that these are known and tracked. This acknowledges the risk without pretending the vulnerabilities do not exist.

---

*Built by Bhargav Kumar Nath. All backtest results are research outputs subject to look-ahead audit gates and publication criteria enforced by the EvaluationGate module. Past performance of simulated strategies does not guarantee future results.*
