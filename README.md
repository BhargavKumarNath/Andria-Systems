# Andria Systems

### Institutional Investor Intelligence Platform

[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/)
[![Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)
[![MyPy](https://img.shields.io/badge/type%20checked-mypy-informational.svg)](https://mypy.readthedocs.io/)
[![Bandit](https://img.shields.io/badge/security-bandit-yellow.svg)](https://bandit.readthedocs.io/)
[![Dashboard](https://img.shields.io/badge/dashboard-live-brightgreen)](https://bhargav12321-andria-backend.hf.space)
[![Frontend](https://img.shields.io/badge/frontend-live-brightgreen)](https://andria-systems.vercel.app)

*Turns 116M+ SEC 13F institutional holdings filings into behavioral archetypes, macro regime labels, and a regime-conditioned "smart money" signal.*

**[Live dashboard →](https://andria-systems.vercel.app)**

---

## Table of Contents

- [Why this exists](#why-this-exists)
- [The problem it's solving](#the-problem-its-solving)
- [How it fits together](#how-it-fits-together)
- [Getting the data in](#getting-the-data-in)
- [Manager DNA: profiling behavior, not just holdings](#manager-dna-profiling-behavior-not-just-holdings)
- [Finding the archetypes and the regimes](#finding-the-archetypes-and-the-regimes)
- [RACS: turning conviction into a score](#racs-turning-conviction-into-a-score)
- [Backtesting without lying to yourself](#backtesting-without-lying-to-yourself)
- [How much of this do I trust, statistically](#how-much-of-this-do-i-trust-statistically)
- [What it's built with](#what-its-built-with)
- [CI/CD and keeping myself honest](#cicd-and-keeping-myself-honest)
- [Where it lives](#where-it-lives)
- [The dashboards](#the-dashboards)
- [Using the CLI](#using-the-cli)
- [Repo layout](#repo-layout)
- [Getting it running locally](#getting-it-running-locally)
- [Configuration](#configuration)
- [Security notes](#security-notes)
- [Tests](#tests)
- [Logging and knowing what happened](#logging-and-knowing-what-happened)
- [Where this breaks down at scale](#where-this-breaks-down-at-scale)
- [Trade-offs I made on purpose](#trade-offs-i-made-on-purpose)
- [What's next](#whats-next)
- [What I learned building this](#what-i-learned-building-this)

---

## Why this exists

Andria Systems takes the quarterly holdings disclosures that institutional fund managers are legally required to file with the SEC, and turns them into something a portfolio manager could actually act on. It ingests raw 13F filings, builds a 14-feature behavioral profile for every manager in the dataset, clusters those managers into archetypes with HDBSCAN, fits a Gaussian HMM to detect which macro regime the market is currently in, and combines the two into a single signal I call RACS: the Regime-Conditioned Activist Conviction Score.

The idea behind RACS is simple to state and annoying to build correctly: not all institutional ownership means the same thing. A stock being quietly accumulated by a known activist manager during a calm, low-volatility expansion should be scored very differently from the same stock sitting passively in an index fund's portfolio during a credit crunch. RACS tries to capture that distinction systematically, across every quarter of 13F data going back to 2004.

That signal then runs through a backtesting framework I built to be paranoid about the things that quietly ruin quant backtests: a look-ahead bias audit that can't be skipped, realistic T+1 execution with slippage, square-root market impact costs, walk-forward validation, capacity analysis, and Benjamini-Hochberg corrected significance testing across regimes. The whole thing is deployed end to end: a Dash analytics app on Hugging Face Spaces, a Next.js frontend on Vercel, and a GitHub Actions pipeline that lints, type-checks, tests, and deploys both on every push to `main`.

---

## The problem it's solving

Any institutional manager sitting on more than $100M in US equities has to disclose their long positions within 45 days of quarter-end, via SEC Form 13F. That's a huge, public, machine-readable window into what "smart money" is doing, updated every quarter, for basically every fund that matters. Getting the data isn't the hard part. Doing something useful with it is.

Three problems kept getting in the way:

**Not every institutional investor is the same kind of investor.** If a stock shows up in 1,000 different 13F filings, that could be 800 passive index trackers, 150 closet indexers who barely deviate from the benchmark, and 50 managers who are genuinely making a high-conviction bet. Lump them together and you've destroyed the signal before you've even started. The alpha, if there is any, is concentrated in that last group, and you have to be able to tell them apart.

**Markets aren't stationary, and neither is what predicts them.** A momentum strategy that works in a trending market can fall apart the moment the trend reverses. Value tends to do well coming out of a downturn and poorly heading into a rate shock. Any signal built on institutional flows that doesn't account for the macro backdrop is going to look regime-blind, and regime-blind signals are the ones that blow up when the regime changes.

**The 45-day lag is easy to violate without realizing it.** This is the one that actually keeps me up at night. It's trivially easy, when you're doing a big join across a large dataset, to accidentally let a filing's information leak into a date before it was legally public. A single `timedelta` that lands on a weekend, a join that goes the wrong direction, and suddenly your backtest is quietly cheating. I ended up treating this as a first-class engineering risk rather than a detail to handle later, and it shows up throughout the codebase.

---

## How it fits together

The system runs as four stages, driven by a CLI:

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
                     PHASE 3: BACKTEST + VALIDATION
      45-day filing lag → NYSE-calendar-aware date snap
      Polars asof joins (forward for entry, backward for exit)
      survivorship: null exit price → −100% return (not dropped)
                            │
              ── LEAKAGE AUDIT (6 checks, non-bypassable) ──
                            │
        ExecutionEngine V1: T+1 fill, VWAP slippage, ADV cap
        TransactionCostModel: fixed tier + sqrt market impact
                            │
     Diagnostics: Sharpe, max DD, regime-conditional, BH-FDR
     + PBO (CSCV) + Deflated Sharpe Ratio + 3× Monte Carlo
     + Walk-forward + Capacity cliff + Signal decay (IC half-life)
                            │
           ┌────────────────┴────────────────┐
     GOVERNANCE                         DEPLOYMENT
  MLflow + config snapshots        Dash → HF Spaces (Docker)
  parameter lineage (JSONL)        Next.js static export → Vercel
                                   3-job GitHub Actions CI/CD
```

A few of the bigger technology calls, and why I made them:

I picked **DuckDB over Spark** because 116 million rows fits comfortably in 10GB of RAM with columnar vectorized execution, and Spark's cluster overhead just isn't worth paying for at this scale. **Polars over Pandas** for basically the same reason: zero-copy Arrow under the hood, lazy evaluation when I want it, and it's genuinely 3-10x faster on the aggregations this pipeline does constantly. **HDBSCAN over k-means** for the manager clustering, because I have no idea in advance how many natural behavioral groups exist in the data, and density-based clustering doesn't force me to guess. It matches however lumpy the real manager population turns out to be. A **Gaussian HMM** for the regime detection because macro regimes are exactly the kind of thing a latent-variable model is built for: you can't observe "the regime" directly, only its effects on VIX, credit spreads, and rates. And **DuckDB again for the RACS signal itself**, a 5-stage SQL pipeline that stages everything in temp tables and keeps peak memory under 3GB for the whole computation.

---

## Getting the data in

There are three data sources, each with its own ingester:

**SEC EDGAR 13F** is the big one: raw `INFOTABLE.tsv` and `COVERPAGE.tsv` files sitting in a Hive-style directory structure (`quarter=YYYYQN/`). The ingester normalizes exposure types into Equity/Put/Call, filters out anything before 2004, and writes the result out as zstd-compressed, Hive-partitioned Parquet. Every batch gets a row-count sanity check and a duplicate-filing check before it's trusted.

**FRED's macro series** (VIX, the 10-year/2-year yield spread, high-yield credit spreads, Fed funds) come in as quarterly CSVs and get collapsed into a single Parquet file with source-file provenance attached, so I can always trace a number back to the file it came from.

**The OFR Financial Stress Index** is the flakiest of the three: it comes as CSV or XLSX, and when the raw source isn't available, the ingester falls back to whatever's already been processed rather than failing outright.

Every DataFrame that crosses a module boundary gets checked against a schema contract before anything downstream is allowed to touch it: column names, dtypes, the works. If a contract fails, it raises immediately instead of letting a malformed frame quietly propagate three stages deep and show up as a confusing bug later. I've been burned by that exact failure mode enough times on other projects that it felt worth the upfront cost here.

---

## Manager DNA: profiling behavior, not just holdings

Before you can tell a passive index fund apart from an activist, you need to describe *how a manager behaves* in a way a computer can compare across thousands of them. That's what the Manager DNA module does: it turns each manager's quarterly holdings history into 14 numeric features:

| Feature | What it captures | Why it matters |
|---------|-----------|--------|
| `avg_hhi` | Portfolio concentration (Herfindahl-Hirschman Index) | How much conviction is in each position |
| `avg_put_ratio` | Put option value relative to the rest of the portfolio | Hedging posture |
| `log_avg_aum` | Log of average quarterly AUM | Fund size |
| `avg_turnover` | Quarter-over-quarter weight change | How often the manager trades |
| `avg_conviction_delta` | Quarter-over-quarter change in HHI | Whether conviction is building or fading |
| `new_position_rate` | Share of positions that are newly opened | How much new-idea discovery is happening |
| `exit_rate` | Share of positions fully closed out | Decisiveness |
| `avg_holding_duration_qtrs` | Average quarters a position is held | Time horizon |
| `top5_concentration` | Combined weight of the top 5 holdings | Portfolio construction style |
| `options_notional_ratio` | Options notional relative to equity notional | Leverage posture |
| `shared_vote_ratio` | Share of holdings with shared voting authority | Governance engagement |
| `amendment_rate` | How often 13F amendments are filed | Filing discipline |
| `quarters_active` | Total quarters observed filing | Longevity |
| `aum_volatility` | Std. dev. of quarterly AUM | Business stability |

All of this runs as a 6-stage DuckDB pipeline that computes everything in memory, but drops each intermediate temp table the moment nothing downstream needs it anymore, which keeps peak memory manageable on a normal workstation rather than a cluster. A manager needs at least four quarters of filing history before they qualify. That's not an arbitrary cutoff: it's there so the behavioral features describe an actual observed pattern instead of a lucky (or unlucky) single quarter.

---

## Finding the archetypes and the regimes

### Clustering managers into archetypes

The clustering pipeline scales the 14 DNA features with a `RobustScaler` (median and IQR, since AUM and turnover both have fat tails), then sweeps HDBSCAN across `min_cluster_size ∈ {50, 100, 150, 200, 300}` and keeps whichever configuration wins on silhouette score. That's a deliberate choice: I didn't want to hand-pick a cluster count and hope it matched reality. Letting the sweep pick means the granularity actually reflects the density structure of the real manager population, whatever that turns out to be.

Once HDBSCAN has found clusters, they're anonymous numbers with no meaning yet. To turn them into something interpretable, each cluster centroid gets compared, via cosine similarity, against four hand-authored prototype vectors describing archetypal behavior:

| Archetype | What defines it |
|-----------|----------------|
| **Conviction Activists** | High concentration, low hedging, low turnover, long holding periods |
| **Index Huggers** | Low concentration, large AUM, low conviction swings, long filing history |
| **Macro Tourists** | Heavy hedging, high turnover, lots of options exposure |
| **Nimble Traders** | Smaller AUM, high turnover, opens and closes positions quickly |

Only **Conviction Activists** feed into the RACS signal. The other three archetypes are computed and shown on the dashboard for context, but they're deliberately excluded from the alpha calculation.

### Detecting the macro regime

A 4-state Gaussian HMM with full covariance is fit on five standardized macro features (VIX, the 10Y-2Y yield spread, high-yield credit spreads, the change in Fed funds, and the OFR/NFCI stress index), resampled to quarter-end so it lines up with the 13F filing cadence. I went with full covariance rather than the cheaper diagonal version on purpose: VIX and credit spreads move together strongly during stress periods, and a diagonal covariance structurally can't represent that correlation. It costs more parameters and makes the fit more sensitive to initialization, but mischaracterizing the joint distribution during a recession-fear regime felt like the worse trade.

The same cosine-similarity trick used for archetype labeling shows up again here: each HMM state gets matched against four calibrated prototype vectors (`Goldilocks`, `Recovery`, `Rate_Shock`, `Recession_Fear`) instead of being left as an arbitrary state index. Unsupervised models don't guarantee that "state 2" means the same thing on every retrain; anchoring the labels to fixed prototypes is what keeps them stable and interpretable across runs.

---

## RACS: turning conviction into a score

This is where the two halves of the system come together. Given the clustered managers and the regime time series, the RACS engine runs as five DuckDB stages:

1. Pull out the managers labeled Conviction Activists (a small group).
2. Turn their EDGAR holdings into quarterly portfolio weights.
3. For each CUSIP and quarter, compute a raw score:

   ```
   racs_raw = consensus_weight * ln(activist_buyers_count + 1.1)
   ```

   where `consensus_weight` is how much of the identified activists' combined portfolio weight sits in that position, and `activist_buyers_count` is how many distinct activists hold it. A position needs at least two independent activist buyers to qualify; one manager acting alone doesn't count as a consensus.

4. Compute a `crowding_penalty`: the ratio of total institutional holders to total reporting managers that quarter. If "everyone" already owns the stock, it's no longer a differentiated position, and the score gets discounted accordingly.

5. Apply the regime conditioning:

   ```
   regime_adjusted_racs =
       racs_raw
       * (1 - crowding_penalty)
       * (1 + regime_weight * regime_prob)    [Goldilocks, Recovery]
       * (1 - regime_weight * regime_prob)    [Rate_Shock, Recession_Fear]
   ```

   with `regime_weight = 0.3`, and `regime_prob` being the HMM's own posterior confidence in whichever regime is currently active, so the adjustment scales with how sure the model is, rather than applying a flat boost or penalty regardless of confidence.

The whole thing runs inside one DuckDB connection, staging everything in temp tables so the big intermediate activist-holdings join never has to be fully materialized. I could have written this as a chained Polars pipeline instead, and for most of the rest of the codebase that's exactly what I do. But for RACS specifically, I wanted the SQL to be readable enough that a subtle bug like double-counting an activist's position across quarters would actually be visible on inspection of a `GROUP BY`, rather than buried in a chain of Polars transforms.

---

## Backtesting without lying to yourself

The backtesting side of the system is built around one non-negotiable rule: look-ahead bias has to be structurally impossible to sneak in, not just something I check for occasionally.

**The event-study engine** (`AlphaFactoryEngine`) does the following, in order: it converts each signal quarter into a real entry date by adding the 45-day filing lag and snapping to the nearest NYSE trading day, with no raw `timedelta` arithmetic that can silently land on a Saturday. Entry and exit prices come from Polars `asof` joins keyed on CUSIP, so there's no chance of one security's price contaminating another's join. Positions that never get an exit price (delisted or bankrupt names) are marked as a -100% return instead of being quietly dropped, which is the honest way to handle survivorship. Each position is sized at $1M divided by 30-day volatility, capped at 5% of average daily traded volume, and before any performance metric gets computed, a mandatory leakage audit runs and will halt the whole backtest on an error-level finding. There's no flag to skip it.

**Execution realism** comes from a T+1 fill delay (you can't act on a signal the same instant you see it), VWAP-style slippage, and exclusion of any position that would need more than 5% of the stock's 30-day ADV to fill; the strategy shouldn't get credit for a fill it couldn't realistically have gotten.

**Transaction costs** are modeled as a fixed cost tier (20bps for large caps, 50bps for small caps) plus a square-root market impact term (the Almgren-Chriss family of impact models), which fits infrequent, institutional-sized trades much better than a flat basis-point assumption would.

**The leakage audit itself** runs six checks every single time, no exceptions: future timestamps on a signal, exit prices that precede entry, forward contamination from a mis-joined asof, duplicate signals, overlapping holding windows on the same CUSIP, and regime labels that were assigned using information from after the signal date. The first three are hard errors that stop the backtest; the rest get logged as warnings and included in the report.

Beyond the core backtest, there's a **walk-forward validator** that re-runs the whole RACS-and-backtest pipeline on rolling or expanding train/test windows and flags it if performance monotonically declines fold over fold, a classic sign of in-sample overfitting. A **capacity analyzer** stress-tests the strategy from $10M to $5B in AUM and finds the point where Sharpe drops below half its unconstrained value (the "capacity cliff"). And a **signal decay analyzer** tracks how the information coefficient between RACS and forward returns degrades across 1, 5, 20, and 60-day horizons, estimating a half-life for the signal.

---

## How much of this do I trust, statistically

Sharpe ratio and max drawdown are easy to compute and easy to fool yourself with, so I layered in a few more demanding checks on top.

Since performance gets evaluated across four macro regimes at once, testing each independently at α=0.05 would give roughly an 18% chance of a false positive somewhere just by luck. A Benjamini-Hochberg FDR correction controls that at 5% instead, so a regime only gets reported as significant if it survives the correction, not just a single uncorrected t-test.

Two heavier-duty checks come from the overfitting-detection literature: the **Probability of Backtest Overfitting**, implemented as a full 16-partition combinatorial cross-validation (12,870 combinations, not a shortcut approximation), which estimates the odds that whatever looked best in-sample would actually lose out-of-sample. And the **Deflated Sharpe Ratio**, which discounts the observed Sharpe for the number of configurations tried, the skew and excess kurtosis of the return distribution, and serial correlation. A Sharpe that looks great before those corrections can easily fall below the bar for statistical significance after them.

There's also a three-way Monte Carlo layer: bootstrap resampling of the trade returns, randomized entry timing, and regime-label permutation, each one testing a different version of "could this have happened by chance." And a Fama-French 5-factor plus momentum regression that checks whether RACS returns survive after removing exposure to market, size, value, profitability, investment, and momentum factors. If the alpha disappears once you control for those, it wasn't really alpha.

Every one of these (the leakage audit, the provenance quality of the CUSIP-to-ticker mapping, reproducibility across reruns, and the PBO score) feeds into a formal **evaluation gate**. A run only gets marked "published" if all four pass; if any one fails, the run is rejected with the specific reasons attached, rather than being allowed to quietly ship a result that hasn't earned it.

---

## What it's built with

| Layer | Technology | Why |
|-------|-----------|---------|
| Data processing | DuckDB | SQL over Parquet with Hive partitioning and temp-table staging |
| DataFrames | Polars | Zero-copy Arrow, `asof` joins, fast on large aggregations |
| Serialization | PyArrow | Parquet I/O, bridges to DuckDB |
| Clustering | scikit-learn (HDBSCAN), UMAP-learn | Manager archetype discovery and 2D visualization |
| Regime modeling | hmmlearn | Gaussian HMM for macro regime detection |
| Statistics | scipy, statsmodels | t-tests, Spearman IC, regression diagnostics |
| Market data | yfinance, exchange-calendars | Adjusted OHLCV pricing and the NYSE trading calendar |
| Experiment tracking | MLflow | Run tracking and metric logging |
| Configuration | Pydantic v2, pydantic-settings | Typed config with env-var overrides |
| Logging | structlog | Structured, JSON-capable logging |
| CLI | Typer, Rich | The `andria` command-line tool |
| Dashboard | Dash, Plotly, dash-bootstrap-components | The research analytics backend |
| Frontend | Next.js 14, Recharts | The public-facing static dashboard |
| API | FastAPI, Uvicorn | Async endpoints |
| Orchestration | Prefect | Available for scheduled/production runs |
| Telemetry | prometheus-client | Metrics exposition |
| Containerization | Docker (`python:3.12-slim`) | Reproducible builds for HF Spaces |
| CI/CD | GitHub Actions | Lint, type-check, test, deploy on every push |
| Code quality | Ruff, MyPy, Bandit, pip-audit | Lint, types, security, dependency audit |
| Testing | pytest, pytest-cov, pytest-benchmark | Unit, integration, and validation suites |

---

## CI/CD and keeping myself honest

Every push and PR to `main` runs through a validate-then-deploy pipeline defined in `.github/workflows/ci.yml`. Validation runs Bandit against the `andria/` package, a pip-audit dependency check, Ruff, MyPy, and the pytest suite with coverage, and both deploy jobs only fire if all of that passes.

The Hugging Face deploy is the more interesting of the two: it builds a fresh orphan git branch every time, strips out `artifacts/`, `dataset/`, `.env`, and any compiled bytecode, stamps the source commit SHA into the branch, and force-pushes it to the Space. That keeps the Space's repository small and free of accumulated binary history. The trade-off is you lose incremental-push optimization, but for a project this size the force-push is fast enough that it doesn't matter. The frontend deploy runs the Vercel CLI from the repo root rather than from `frontend/`, relying on the Vercel project's own `root=frontend` setting, and goes through `vercel pull` → `vercel build` → `vercel deploy` explicitly rather than letting Vercel's Git integration trigger builds on its own, so a deploy only ever happens after CI has actually passed.

On the governance side, every run writes a config snapshot with a content hash, so I can always tell exactly which parameters produced a given set of results, and an append-only lineage log ties every run back to the artifacts it produced. Each phase-3 run also tries to log its Sharpe, drawdown, regime metrics, and factor diagnostics to a local MLflow store, so I can browse past runs with `mlflow ui` without standing up a tracking server. In practice, MLflow's newer filesystem backend has been finicky in some environments; when it fails, the run logs a warning and carries on rather than letting an observability hiccup take down a real backtest.

---

## Where it lives

**The Dash backend runs on Hugging Face Spaces**, in a Docker container on their free CPU tier. The image is `python:3.12-slim` with `gcc`, `g++`, and `libgomp1` added for scikit-learn's native extensions, and it starts the Dash server bound to `0.0.0.0`. Miss that and the Space will report "app not running," because Dash defaults to binding only to localhost.

**The Next.js frontend is a static export on Vercel**: `output: 'export'` in `next.config.mjs`, no server-side rendering, no API routes, so there's zero cold-start latency and nothing running server-side to keep warm. The trade-off is that all the dashboard's data has to be pre-baked: everything the frontend shows comes from `frontend/public/data/*.json`, which gets regenerated from the latest pipeline output by running `export_static_artifacts.py` after each real pipeline run.

**Live URL:** [andria-systems.vercel.app](https://andria-systems.vercel.app)

---

## The dashboards

There are two separate dashboards, and they're not redundant: they serve different audiences.

The **Dash app** (`andria/dashboard/app.py`) is the research-facing view: an overview page showing recent run history and phase-completion status, a Manager DNA page with the archetype breakdown, a regime-detection scatter plot, a RACS leaderboard sorted by `regime_adjusted_racs`, and a backtest page with Sharpe/trades/turnover and the evaluation-gate outcome. Each page reads whatever the latest run actually produced, and if that artifact doesn't exist yet, it shows exactly which `andria run` command would create it, rather than an empty page or a stack trace.

The **Next.js frontend** is the public-facing one, and it goes further: it's got the full walk-forward heatmap, PBO/DSR/Monte Carlo detail, and capacity and signal-decay views that haven't made it onto the Dash side yet. It reads the same underlying data, just rendered with a lot more visual polish.

---

## Using the CLI

Everything runs through the `andria` command, built with Typer and Rich.

**Ingesting data:**

```bash
andria ingest all      # all three sources
andria ingest edgar
andria ingest fred
andria ingest ofr
```

**Running the pipeline:**

```bash
andria run phase1      # Manager DNA + HDBSCAN clustering
andria run phase2      # HMM regime detection + RACS signal generation
andria run phase3      # backtest + full statistical validation stack,
                        # against real market pricing for the phase-2 signals
```

**Validating and serving results:**

```bash
andria validate                              # check every dataset against its schema contract
andria serve                                 # launch the Dash dashboard on :8050
andria serve --port 9090 --host 0.0.0.0      # or wherever/whatever you need
andria report                                # generate a Markdown research report
andria info                                  # print config, artifact paths, dataset status
```

Every command takes `--log-level` and `--json-logs` if you want structured output for a log aggregator.

**Putting it all together, from a clean checkout:**

```bash
git clone <repo> && cd andria-systems
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

cp .env.example .env
# add FRED_API_KEY to .env

# drop raw EDGAR TSVs in dataset/raw/edgar/quarter=YYYYQN/,
# FRED CSVs in dataset/raw/fred/, OFR files in dataset/raw/ofr/

andria ingest all
andria run phase1
andria run phase2
andria run phase3

andria validate
andria serve

# push the results to the Next.js frontend's static data files
python export_static_artifacts.py
```

---

## Repo layout

```
andria-systems/
├── andria/                         # the core Python package
│   ├── core/                       # config, exceptions, logging, schema contracts, the eval gate
│   ├── cli/                        # the andria command
│   ├── ingestion/                  # EDGAR / FRED / OFR ingesters + the dataset registry
│   ├── data/                       # market data loading, CUSIP↔ticker mapping, provenance tracking
│   ├── features/                   # Manager DNA feature engineering
│   ├── models/
│   │   ├── clustering/             # HDBSCAN + UMAP + archetype labeling
│   │   └── regime/                 # the Gaussian HMM regime detector
│   ├── signals/                    # the RACS engine
│   ├── backtest/                   # AlphaFactoryEngine, execution, costs, leakage audit,
│   │                                # walk-forward, capacity, signal decay, overfitting checks
│   ├── research/                   # governance, MLflow tracking, drift monitoring, reports
│   ├── orchestration/               # PipelineOrchestrator, ties phase 1/2/3 together
│   ├── dashboard/                  # the Dash app
│   └── utils/                      # NYSE trading calendar
├── frontend/                       # the Next.js static frontend
├── tests/                          # unit, integration, and the phase-4 validation suite
├── configs/base.yaml               # default parameters
├── dataset/                        # raw and processed data (gitignored)
├── artifacts/                      # pipeline output: runs, configs, provenance, mlflow (gitignored)
├── .github/workflows/ci.yml
├── Dockerfile
├── pyproject.toml
└── .env.example
```

---

## Getting it running locally

You'll need Python 3.12+, Node 20+ if you want to touch the frontend, and Git.

```bash
git clone https://github.com/BhargavKumarNath/Andria-Systems
cd andria-systems

python -m venv .venv
source .venv/bin/activate        # .venv\Scripts\activate on Windows

pip install -e ".[dev]"
andria --help
```

Then copy `.env.example` to `.env` and fill in a FRED API key (free, from [fred.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html)). Everything else in `.env` has a sane default already baked into `config.py`, so you only need to touch it if you're changing ports or memory limits.

For the frontend:

```bash
cd frontend
npm install
npm run dev      # localhost:3000
npm run build    # static export to frontend/out/
```

---

## Configuration

All the pipeline's parameters live in `andria/core/config.py` as nested Pydantic models. You can override them two ways: edit `configs/base.yaml` directly, or set an environment variable prefixed with `ANDRIA_`, using a double underscore for nesting, so `ANDRIA_BACKTEST__FILING_LAG_DAYS=60` overrides `backtest.filing_lag_days`, and `ANDRIA_HMM__N_COMPONENTS=5` changes how many states the HMM fits. Env vars win over the YAML file.

---

## Security notes

`.env` never gets committed. It's excluded from both `.gitignore` and Docker builds, and the CI job that pushes to Hugging Face runs an explicit `git rm --cached .env` before committing the orphan branch, as a second layer of protection in case it ever ended up staged by accident. Anything sensitive that CI needs (the HF token, Vercel credentials) lives in GitHub Secrets, not in the repo.

Every CI run also gets a Bandit security scan against the `andria/` package and a pip-audit dependency check against the OSV database. Where a known vulnerability has no available fix yet (a transitive dependency pinning an old, vulnerable version, say), it gets an explicit `--ignore` flag with a comment explaining why, rather than being silently suppressed or left to fail the build forever.

---

## Tests

```bash
pytest tests/ -v --cov=andria --cov-report=html      # everything, with coverage
pytest tests/unit/ -v                                 # just the unit tests
pytest tests/ -v -m "not slow and not integration"    # what CI actually runs
pytest tests/ --benchmark-only                         # benchmarks
```

The suite covers config loading, the backtest engine under controlled synthetic signals, the transaction cost model's edge cases, the Benjamini-Hochberg correction against a hand-computed p-value sequence, and a large validation suite that checks artifact integrity end to end. `slow` and `integration` tests are marked separately and excluded from the fast CI run since they need real network access or real data files.

---

## Logging and knowing what happened

Every module logs through a shared `structlog`-based logger, so log events come out as structured key-value pairs rather than free-text strings, which is trivial to parse if you're feeding logs into Datadog, Splunk, or CloudWatch. In development they render with color and timestamps in the terminal; pass `--json-logs` and they come out as JSON instead, which is what the Docker deployment does.

Reproducibility isn't just claimed, it's enforced: every run writes a manifest with its git commit, timestamp, and parameter hash, so if a number looks surprising six months from now, I can trace it back to exactly what produced it. The experiment seed (42, propagated to numpy, Python's `random`, and scikit-learn at the start of every run) is the same reason two runs on the same machine should give you the same answer.

---

## Where this breaks down at scale

The system is built for workstation-scale operation right now: 116M+ EDGAR rows inside a 10GB memory budget, with peak usage around 2-3GB during the backtest's pricing joins. DuckDB handles roughly 100M rows a minute on a modern laptop with vectorized execution, so the current dataset sits comfortably inside that. If the EDGAR data grew to 500M+ rows (more quarters, or a jump to daily rather than quarterly granularity), the memory-staged DuckDB approach would need to become out-of-core or partitioned instead.

The backtest engine currently uses Polars in eager mode rather than its lazy API, on purpose (more on that below), which leaves some memory savings on the table: my rough estimate is 30-40% at the hot paths if I ever needed to switch. If I had to scale this up 10x, the obvious moves are: partitioned ingestion straight from S3 instead of single-threaded TSV parsing, parallelizing the Manager DNA computation by CIK, GPU-accelerated clustering via RAPIDS cuML, and pushing the RACS SQL pipeline's intermediate tables into a cloud warehouse instead of local temp tables.

---

## Trade-offs I made on purpose

**SQL over Polars, specifically for RACS.** Everywhere else in this codebase I lean on Polars, but the RACS pipeline is DuckDB SQL with temp-table staging. I gave up some of Polars' type safety for SQL's readability on multi-table joins with window functions, because a subtle bug like double-counting an activist's position across quarters is exactly the kind of thing that's easy to introduce and easy to miss in a chained functional pipeline, and much easier to catch by actually reading a `GROUP BY`.

**Eager evaluation over lazy, in the backtest engine.** Polars' lazy API would save memory, but the leakage audit needs to inspect the trade ledger mid-construction, before costs get applied. Lazy evaluation would force an explicit materialization point right there anyway, so I didn't lose much performance by just staying eager, and I kept the ability to actually debug intermediate state.

**Full HMM covariance instead of diagonal.** More parameters, more sensitive to initialization, but VIX and credit spreads move together hard during stress, and a diagonal covariance can't represent that. Getting the Recession_Fear regime's joint distribution wrong felt like the worse trade.

**No multi-day partial fills in the execution model.** If a position would need more than 5% of ADV to fill, it's excluded rather than spread across several days. That's intentionally conservative: it penalizes illiquid names honestly rather than assuming a multi-day fill that adds complexity without meaningfully improving realism for a quarterly, event-study strategy.

**An orphan branch for every HF Spaces deploy**, instead of a normal incremental push. It keeps the Space's git history to a single commit and its repo small, at the cost of not being able to use incremental push optimizations, a trade I'm happy to make for a research dashboard this size.

**A static export for the frontend instead of server-side rendering.** No cold starts, no Node server to keep running, but it does mean every number on the dashboard has to be pre-baked into a JSON file rather than fetched live, which is the direct reason `export_static_artifacts.py` exists as a separate step you have to remember to run.

---

## What's next

**Soon:**
- Replace the static `public/data/*.json` files with a real API the frontend can query, so the dashboard reflects new pipeline runs without needing a rebuild.
- Bring in alternative data (proxy vote records, earnings call sentiment, 13D/13G activist disclosure events) to enrich Manager DNA beyond what 13F alone can tell you.
- Bring the Dash dashboard's Backtest page up to parity with the frontend: the walk-forward heatmap and the PBO/DSR/Monte Carlo detail currently only live on the Next.js side.

**Eventually:**
- Move the HMM from batch fitting to an online EM variant, so regime detection updates continuously instead of waiting for end-of-quarter retraining.
- Generate RACS at multiple horizons (30/90/180-day) instead of a single fixed one, so it's possible to blend signals across time horizons.
- Wire the pipeline phases into Prefect flows for scheduled runs, retries, and better observability in production.

**Further out:**
- An NLP layer over 13D and SC 13D/A filings, which contain activist managers' actual stated intentions in free text, could let RACS condition on thesis quality, not just position size.
- A co-holding graph of managers, where edges are weighted by shared CUSIP overlap: a richer measure of activist consensus than just counting distinct buyers.

---

## What I learned building this

**The 45-day filing lag is the single highest-leverage line of code in the whole system, not a detail.** Early on, naive `timedelta` arithmetic produced backtest results that looked great and were completely fake. They evaporated the moment I replaced raw date offsets with proper NYSE-calendar-aware snapping. Every join, every date filter, everything that touches "the first price available after X" had to be re-verified against the actual trading calendar before I trusted a single number that came out of it.

**HDBSCAN's noise cluster turned out to be informative, not a failure to fix.** Early on, aggressive settings were dumping up to 40% of managers into the unlabeled noise bucket, and my first instinct was to tune that away. Looking closer, most of that noise was single-quarter filers and shell entities that genuinely didn't belong in any behavioral archetype. Excluding them, rather than forcing them into a cluster, made the remaining four archetypes noticeably cleaner.

**Regime conditioning matters most at the extremes.** Comparing RACS with and without the regime multiplier, the difference is almost nothing in a neutral environment like Recovery, and largest at the Goldilocks and Recession_Fear ends of the spectrum. That tracks with intuition: activist outperformance should be most differentiated exactly when the macro backdrop is most extreme in either direction.

**Inline SQL deserves the same scrutiny as application code, maybe more.** Each of the five DuckDB blocks in the RACS engine got written, reviewed, and checked against hand-built test cases before it went in, because a SQL aggregation bug (a NULL-handling difference, an implicit cast, a subtle `GROUP BY` mistake) is exactly the kind of thing that passes on clean test data and silently produces the wrong answer on real data, without ever throwing an error you'd notice.

**Dependency scanning isn't a one-time gate, it's ongoing maintenance.** `pip-audit` kept surfacing new transitive CVEs over the life of this project, and each one needed an actual decision: ignore with a documented reason, or upgrade, rather than a single pass/fail check I could set and forget.

---

*Built by Bhargav Kumar Nath. Every backtest result here is a research output, gated by the same leakage audit and evaluation criteria described above. None of it is a claim about future performance.*
