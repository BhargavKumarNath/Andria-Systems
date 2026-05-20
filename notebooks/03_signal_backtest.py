# %% [markdown]
# # Phase 4: Alpha Factory — Institutional Reality Backtest
#
# **Phase 4 upgrades over Phase 3:**
# - **Real pricing**: Yahoo Finance via `MarketDataLoader` (replaces synthetic GBM)
# - **Calendar-aware execution**: NYSE trading day snapping via `MarketCalendar`
# - **Leakage audit**: Mandatory pre-flight checks for 6 categories of leakage
# - **Execution realism**: T+1 fill delay, slippage model, ADV participation cap
# - **Data provenance**: Every trade tagged with data source and coverage quality
# - **PBO + Deflated Sharpe**: Institutional overfitting detection
# - **Walk-forward validation**: Temporal robustness across expanding windows
# - **Monte Carlo robustness**: Bootstrap + timing + regime permutation tests
# - **Regime transition stress**: Separate performance analysis at regime boundaries
# - **Signal decay analysis**: IC decay curves across 1D/5D/20D/60D horizons
# - **Portfolio construction**: Volatility targeting, sector caps, risk budgeting
# - **MLflow tracking**: Every run logged with parameters, metrics, git hash
#
# ### Critical Rigor
# - Look-ahead bias eliminated: 45-day filing lag + NYSE calendar snapping
# - Survivorship bias: delisted tickers assigned -100% return
# - Transaction costs: 20bps/50bps + slippage + T+1 fill delay
# - Liquidity-bounded: max 5% ADTV constraint
# - Risk Factor Neutralization: FF5 + Momentum → idiosyncratic alpha
# - Results without `PRICING_SOURCE == "real"` are labeled RESEARCH DIAGNOSTICS only

# %%
from pathlib import Path
import re

import polars as pl
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

from andria.backtest.engine import AlphaFactoryEngine
from andria.backtest.factors import RiskFactorModel
from andria.backtest.walk_forward import WalkForwardValidator
from andria.backtest.monte_carlo import MonteCarloTester
from andria.backtest.overfitting import DeflatedSharpeRatio, ProbabilityOfBacktestOverfitting
from andria.backtest.diagnostics import regime_transition_metrics
from andria.backtest.signal_decay import SignalDecayAnalyzer
from andria.backtest.portfolio import PortfolioConstructor
from andria.core.config import get_settings
from andria.core.logging import get_logger
from andria.data.market_loader import MarketDataLoader
from andria.data.provenance import ProvenanceTracker
from andria.research.governance import save_config_snapshot, set_global_seed
from andria.research.experiment_tracker import ExperimentTracker

logger = get_logger(__name__)
sns.set_theme(style="darkgrid", palette="muted")

cfg = get_settings()
set_global_seed(cfg.experiment.seed)
save_config_snapshot(cfg)

try:
    PROJECT_ROOT = Path(__file__).resolve().parents[1]
except NameError:
    cwd = Path.cwd().resolve()
    PROJECT_ROOT = cwd.parent if cwd.name == "notebooks" else cwd

tracker = ExperimentTracker(cfg)


# ── Helpers (unchanged from Phase 3) ─────────────────────────────────────────

def _canonical_quarter(raw_quarter: str | None) -> str | None:
    """Normalize EDGAR/SEC quarter labels to the regime-series key, e.g. 2014_Q2."""
    if raw_quarter is None:
        return None
    text = str(raw_quarter).upper()
    quarter_match = re.search(r"(\d{4})_?Q([1-4])", text)
    if quarter_match:
        return f"{quarter_match.group(1)}_Q{quarter_match.group(2)}"
    year_match = re.search(r"(\d{4})", text)
    if not year_match:
        return None
    month_to_quarter = {
        "JANUARY": 1, "FEBRUARY": 1, "MARCH": 1,
        "APRIL": 2, "MAY": 2, "JUNE": 2,
        "JULY": 3, "AUGUST": 3, "SEPTEMBER": 3,
        "OCTOBER": 4, "NOVEMBER": 4, "DECEMBER": 4,
    }
    for month, quarter in month_to_quarter.items():
        if month in text:
            return f"{year_match.group(1)}_Q{quarter}"
    return None


def _repair_unknown_regime_labels(signals: pl.DataFrame) -> pl.DataFrame:
    """Repair stale RACS artifacts whose regime join saved every row as Unknown."""
    if "regime_label" not in signals.columns:
        return signals
    known_regimes = signals.filter(pl.col("regime_label") != "Unknown").height
    if known_regimes > 0:
        return signals
    regime_path = PROJECT_ROOT / "artifacts" / "regime" / "regime_timeseries.parquet"
    if not regime_path.exists():
        print(f"WARNING: All signal regimes are Unknown and regime file is missing at {regime_path}.")
        return signals
    regime_map = (
        pl.read_parquet(regime_path)
        .with_columns(
            (pl.col("date").dt.year().cast(pl.Utf8) + "_Q" + pl.col("date").dt.quarter().cast(pl.Utf8))
            .alias("quarter_key")
        )
        .select("quarter_key", "regime_label", "regime_prob")
    )
    repaired = (
        signals.drop("regime_label")
        .with_columns(pl.col("quarter").map_elements(_canonical_quarter, return_dtype=pl.Utf8).alias("quarter_key"))
        .join(regime_map, on="quarter_key", how="left")
        .with_columns(pl.col("regime_label").fill_null("Unknown"))
    )
    regime_weight = cfg.signals.racs.regime_weight
    repaired = repaired.with_columns(
        (
            pl.col("conviction_raw") * (1.0 - pl.col("crowding_penalty"))
            * (
                1.0
                + pl.when(pl.col("regime_label").is_in(["Goldilocks", "Recovery"]))
                .then(regime_weight * pl.col("regime_prob").fill_null(0.0))
                .when(pl.col("regime_label") != "Unknown")
                .then(-regime_weight * pl.col("regime_prob").fill_null(0.0))
                .otherwise(0.0)
            )
        ).alias("regime_adjusted_racs")
    ).drop("quarter_key")
    repaired_count = repaired.filter(pl.col("regime_label") != "Unknown").height
    print(f"Repaired regime labels for {repaired_count}/{len(repaired)} signals.")
    return repaired


# %% [markdown]
# ## 1. Load Signals

# %%
SIGNALS_PATH = PROJECT_ROOT / "artifacts" / "signals" / "racs_signals.parquet"
if SIGNALS_PATH.exists():
    signals_df = pl.read_parquet(SIGNALS_PATH)
    signals_df = _repair_unknown_regime_labels(signals_df)
    print(f"Loaded {len(signals_df)} real signals from Phase 2.")
else:
    print(f"WARNING: Real signals not found at {SIGNALS_PATH}. Using mock set.")
    signals_df = pl.DataFrame({
        "quarter": ["2015Q1", "2018Q2", "2020Q1", "2022Q3", "2024Q1"],
        "cusip": ["037833100"] * 5,
        "regime_adjusted_racs": [0.95, 0.88, 0.99, 0.85, 0.92],
        "regime_label": ["Goldilocks", "Recovery", "Recession_Fear", "Rate_Shock", "Goldilocks"],
        "conviction_raw": [1.0] * 5,
        "crowding_penalty": [0.0] * 5,
    })

# %% [markdown]
# ## 2. Load Real Pricing Data (Phase 4.1)
#
# Replaces synthetic GBM pricing with real Yahoo Finance data.
# Unmapped CUSIPs are excluded (never silently replaced with synthetic).

# %%
unique_cusips = signals_df["cusip"].unique().to_list()
provenance = ProvenanceTracker(run_id=cfg.run_id)

loader = MarketDataLoader()
pricing_df = loader.load_pricing(
    cusips=unique_cusips,
    start=cfg.market_data.start_date,
)
provenance.ingest_coverage_report(loader.last_coverage_report)

coverage_report = provenance.build_report()
print("\n=== Data Coverage Report ===")
for line in coverage_report.summary_lines():
    print(f"  {line}")

PRICING_SOURCE = "synthetic_gbm"  # default
if pricing_df.height > 0:
    PRICING_SOURCE = pricing_df["pricing_source"][0]
    print(f"\nPricing source: {PRICING_SOURCE}")
    print(f"Pricing rows: {len(pricing_df):,}")
else:
    # Fallback: synthetic GBM (clearly labelled, not used for alpha claims)
    print("\nWARNING: Real pricing unavailable. Falling back to synthetic GBM for pipeline diagnostics ONLY.")
    dates = pd.date_range(cfg.market_data.start_date, "2027-01-01", freq="B")
    n_days = len(dates)
    rng = np.random.default_rng(cfg.experiment.seed)
    pricing_chunks = []
    for ticker in unique_cusips:
        mu = rng.uniform(0.08, 0.12) / 252
        sigma = rng.uniform(0.20, 0.40) / np.sqrt(252)
        daily_returns = rng.normal(mu, sigma, n_days)
        price_path = 100 * np.exp(np.cumsum(daily_returns))
        pricing_chunks.append(pl.DataFrame({
            "date": dates, "cusip": [ticker] * n_days,
            "ticker": [ticker] * n_days,
            "open": price_path * 0.999, "high": price_path * 1.005,
            "low": price_path * 0.995, "close_adj": price_path,
            "volume": [50_000_000.0] * n_days,
            "volume_30d_avg": [50_000_000.0] * n_days,
            "volatility_30d": [sigma] * n_days,
            "pricing_source": ["synthetic_gbm"] * n_days,
        }))
    pricing_df = pl.concat(pricing_chunks)
    print(f"Synthetic pricing rows: {len(pricing_df):,}")

# %% [markdown]
# ## 3. Run Backtest Engine (Phase 4 — calendar-aware, leakage-audited)

# %%
engine = AlphaFactoryEngine()

with tracker.run(run_name=f"phase4_backtest_{cfg.run_id}"):
    tracker.log_params(cfg)

    # Load regime timeseries for leakage check
    regime_ts_path = PROJECT_ROOT / "artifacts" / "regime" / "regime_timeseries.parquet"
    regime_ts = pl.read_parquet(regime_ts_path) if regime_ts_path.exists() else None

    results = engine.run_backtest(
        signals_df,
        pricing_df,
        top_n_decile=None,
        regime_ts=regime_ts,
    )

    ledger = results["ledger"]
    metrics = results["metrics_by_regime"]
    audit_report = results["leakage_audit"]

    print(f"\nFinal Trade Ledger: {len(ledger)} trades generated.")
    print(f"Overall Sharpe: {results['overall_sharpe']:.2f}")
    print(f"Survivorship Flags: {results['survivorship_flags']}")
    print(f"\nLeakage Audit: {audit_report.to_dict()['status']} "
          f"({audit_report.error_count} errors, {audit_report.warning_count} warnings)")

    # Attach provenance to ledger
    ledger = provenance.attach(ledger, pricing_df)
    provenance.save(cfg.paths.artifacts)

    tracker.log_backtest_results(results, ledger)
    tracker.log_coverage_report(coverage_report)

# %% [markdown]
# ## 4. Risk Factor Neutralization (Fama-French 5 + Momentum)

# %%
ff_model = RiskFactorModel(start_date=cfg.market_data.start_date)
rfn_status: dict = {}

try:
    ledger = ff_model.orthogonalize(ledger)
    rfn_status = ff_model.last_diagnostics
    print(f"RFN: {rfn_status}")
    with tracker.run(run_name=f"rfn_{cfg.run_id}"):
        tracker.log_rfn_diagnostics(rfn_status)
except Exception as e:
    rfn_status = {"status": "skipped", "reason": str(e)}
    print(f"Skipping RFN: {e}")

# %% [markdown]
# ## 5. Regime-Conditional Performance

# %%
regime_df = pd.DataFrame(metrics).T.rename_axis("regime_label").reset_index()
regime_df = regime_df[["regime_label", "n_obs", "mean_return", "sharpe", "max_dd", "raw_p_value", "fdr_significant"]]
print(regime_df.to_string(index=False))

plot_df = regime_df.copy()
plot_df["mean_return_pct"] = plot_df["mean_return"].astype(float) * 100.0
regime_order = [r for r in ["Recovery", "Goldilocks", "Rate_Shock", "Recession_Fear", "Unknown"] if r in set(plot_df["regime_label"])]
plot_df = plot_df.set_index("regime_label").loc[regime_order].reset_index()

plt.figure(figsize=(10, 5))
ax = sns.barplot(data=plot_df, x="regime_label", y="mean_return_pct", order=regime_order)
ax.axhline(0, color="black", linewidth=1)
max_abs = max(plot_df["mean_return_pct"].abs().max(), 0.25)
padding = max_abs * 0.2
ax.set_ylim(min(0.0, plot_df["mean_return_pct"].min() - padding), max(0.0, plot_df["mean_return_pct"].max() + padding))
for patch, (_, row) in zip(ax.patches, plot_df.iterrows()):
    height = patch.get_height()
    ax.annotate(f"{height:.2f}%\nn={int(row['n_obs'])}", (patch.get_x() + patch.get_width() / 2, height),
                ha="center", va="bottom" if height >= 0 else "top", xytext=(0, 4 if height >= 0 else -4),
                textcoords="offset points", fontsize=9)
src_label = "Mock Pricing" if PRICING_SOURCE == "synthetic_gbm" else "Real Pricing"
plt.title(f"Net Forward Return by Macro Regime ({src_label})")
plt.xlabel("Macro Regime"); plt.ylabel("Return (%)"); plt.xticks(rotation=20, ha="right"); plt.tight_layout(); plt.show()

# %% [markdown]
# ## 6. Regime Transition Stress Test (Phase 4.10)

# %%
transition_report = regime_transition_metrics(ledger)
print("\n=== Regime Transition Stress Analysis ===")
print(f"Detected transitions: {transition_report.get('n_detected_transitions', 0)}")
print(f"In-regime performance:    {transition_report.get('in_regime')}")
print(f"At-transition performance: {transition_report.get('at_transition')}")

# %% [markdown]
# ## 7. Walk-Forward Validation (Phase 4.7)

# %%
wfv = WalkForwardValidator(window_type="expanding", train_years=5, test_years=1)
fold_results = wfv.run(ledger)
wfv.print_summary(fold_results)

# %% [markdown]
# ## 8. Monte Carlo Robustness Tests (Phase 4.8)

# %%
mc_tester = MonteCarloTester(n_simulations=500, seed=cfg.experiment.seed)
mc_results = mc_tester.run_all(ledger)
mc_tester.print_summary(mc_results)

# %% [markdown]
# ## 9. Deflated Sharpe + PBO (Phase 4.9)

# %%
pbo = ProbabilityOfBacktestOverfitting(n_partitions=8)
pbo_score = pbo.compute(ledger)

dsr_calc = DeflatedSharpeRatio(n_trials=21)
dsr_result = dsr_calc.compute(ledger)

print(f"\nPBO Score: {pbo_score:.4f} ({'OVERFIT' if pbo_score > 0.5 else 'OK'})")
print(f"Deflated Sharpe Ratio: {dsr_result.get('dsr', 'n/a')}")
print(f"  Raw Sharpe: {dsr_result.get('sharpe_observed')}")
print(f"  Benchmark Sharpe (adjusted for {dsr_result.get('n_trials_adjusted_for')} trials): "
      f"{dsr_result.get('sharpe_benchmark')}")
print(f"  Statistically significant: {dsr_result.get('is_significant')}")

# %% [markdown]
# ## 10. Signal Decay Analysis (Phase 4.18)

# %%
if "regime_adjusted_racs" in signals_df.columns and "net_fwd_return" in ledger.columns:
    # Merge scores onto ledger for decay analysis
    decay_input = ledger.join(
        signals_df.select(["cusip", "quarter", "regime_adjusted_racs"]),
        on=["cusip", "quarter"] if "quarter" in ledger.columns else ["cusip"],
        how="left",
    ) if "quarter" in ledger.columns else ledger
    
    if "regime_adjusted_racs" in decay_input.columns and "exec_date" in decay_input.columns:
        decay_analyzer = SignalDecayAnalyzer(horizons=[5, 20, 60])
        decay_df = decay_analyzer.compute(decay_input, pricing_df, regime_conditioned=False)
        decay_analyzer.print_summary(decay_df)
        half_life = decay_analyzer.estimate_halflife(decay_df)
        print(f"\nEstimated signal half-life: {half_life}d" if half_life else "\nSignal IC > threshold at all tested horizons")

# %% [markdown]
# ## 11. Portfolio Construction (Phase 4.17)

# %%
constructor = PortfolioConstructor(target_vol=0.10, max_position_pct=0.05)
ledger_with_weights = constructor.apply(ledger)
turnover = constructor.compute_turnover(ledger_with_weights)
print(f"\nPortfolio construction complete.")
print(f"Avg weight: {ledger_with_weights['portfolio_weight'].mean():.4f}")
print(f"Max weight: {ledger_with_weights['portfolio_weight'].max():.4f}")
print(f"Estimated annualized turnover: {turnover:.1%}")

# %% [markdown]
# ## 12. Train / Validate / Test Splits

# %%
ledger_with_weights = ledger_with_weights.with_columns(
    pl.when(pl.col("exec_date").dt.year() <= 2018).then(pl.lit("Train"))
    .when(pl.col("exec_date").dt.year() <= 2023).then(pl.lit("Validate"))
    .otherwise(pl.lit("Test"))
    .alias("split")
)
split_metrics = ledger_with_weights.group_by("split").agg(
    pl.col("net_fwd_return").mean().alias("mean_return"),
    pl.col("net_fwd_return").std().alias("std_return"),
    pl.len().alias("n_trades"),
).to_pandas()
print(split_metrics)

# %% [markdown]
# ## 13. Evaluation Gate

# %%
diagnostic_flags: list[str] = []

# Hard blockers
if PRICING_SOURCE == "synthetic_gbm":
    diagnostic_flags.append("BLOCKER: pricing is synthetic_gbm — results are pipeline diagnostics, not alpha evidence.")
if audit_report.has_errors:
    diagnostic_flags.append(f"BLOCKER: leakage audit found {audit_report.error_count} ERROR(s) — results are invalid.")
if len(ledger) < 250:
    diagnostic_flags.append(f"BLOCKER: only {len(ledger)} trade observations — statistical power insufficient.")
if not coverage_report.is_credible:
    diagnostic_flags.append(f"BLOCKER: data coverage {coverage_report.coverage_pct:.1f}% < 70% threshold.")

# Warnings
small_regimes = regime_df.loc[regime_df["n_obs"].astype(int) < 30, ["regime_label", "n_obs"]]
if not small_regimes.empty:
    regime_counts = ", ".join(f"{row.regime_label}=n{int(row.n_obs)}" for row in small_regimes.itertuples(index=False))
    diagnostic_flags.append(f"WARNING: small regime buckets: {regime_counts}.")
if rfn_status.get("status") != "complete":
    diagnostic_flags.append(f"WARNING: RFN did not complete: {rfn_status}.")
elif rfn_status.get("r_squared") is not None and float(rfn_status["r_squared"]) < 0.10:
    diagnostic_flags.append(f"WARNING: RFN R² is low ({rfn_status['r_squared']}) — factor attribution is weak.")
if pbo_score > 0.5:
    diagnostic_flags.append(f"WARNING: PBO = {pbo_score:.3f} > 0.5 — high probability of backtest overfitting.")
if isinstance(dsr_result, dict) and not dsr_result.get("is_significant", False):
    diagnostic_flags.append(f"WARNING: Deflated Sharpe ({dsr_result.get('dsr', 'n/a')}) not statistically significant.")

non_full_trades = ledger_with_weights.filter(pl.col("coverage_quality") != "full").height
if non_full_trades > 0:
    diagnostic_flags.append(f"WARNING: {non_full_trades} trades have non-full data coverage — excluded from Sharpe.")

split_return_range = split_metrics["mean_return"].max() - split_metrics["mean_return"].min()
if split_return_range > 0.05:
    diagnostic_flags.append(f"WARNING: split instability — mean return range {split_return_range:.2%}.")

if audit_report.has_warnings:
    diagnostic_flags.append(f"INFO: leakage audit flagged {audit_report.warning_count} warning(s) — see log.")

print("\n" + "=" * 60)
print("EVALUATION GATE")
print("=" * 60)
blockers = [f for f in diagnostic_flags if f.startswith("BLOCKER")]
warnings_ = [f for f in diagnostic_flags if not f.startswith("BLOCKER")]

if blockers:
    print("Status: NOT INVESTABLE / RESEARCH DIAGNOSTICS ONLY")
    for flag in blockers:
        print(f"  ✗ {flag}")
    for flag in warnings_:
        print(f"  ⚠ {flag}")
else:
    print("Status: Passed basic gates — proceed to deeper validation")
    for flag in warnings_:
        print(f"  ⚠ {flag}")

print("=" * 60)

# %%
