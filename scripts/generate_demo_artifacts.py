"""Generate realistic placeholder JSON artifacts for the Next.js frontend demo.

Run this when no pipeline artifacts exist locally. The data is schema-compliant
with all backend contracts and uses realistic quantitative values.

Usage:
    python scripts/generate_demo_artifacts.py
"""
from __future__ import annotations

import hashlib
import json
import math
import random
from pathlib import Path

import numpy as np

RUN_ID = "20260525T183200_a4f8e1"
GENERATED_AT = "2026-05-25T18:32:00Z"
GIT_COMMIT = "6508457"

OUT = Path(__file__).parents[1] / "frontend" / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)

rng = random.Random(42)
np.random.seed(42)


def sha16(obj: dict) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, default=str).encode()).hexdigest()[:16]


def file_sha16(name: str) -> str:
    p = OUT / name
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16] if p.exists() else "pending"


def write(name: str, data: dict) -> None:
    (OUT / name).write_text(json.dumps(data, indent=2), encoding="utf-8")
    size_kb = (OUT / name).stat().st_size / 1024
    print(f"  OK  {name:<20} {size_kb:6.1f} KB")


# ── 1. SIGNALS ────────────────────────────────────────────────────────────────
STOCKS = [
    ("037833100", "AAPL",  "Goldilocks"),
    ("594918104", "MSFT",  "Goldilocks"),
    ("67066G104", "NVDA",  "Goldilocks"),
    ("023135106", "AMZN",  "Goldilocks"),
    ("30303M102", "META",  "Goldilocks"),
    ("02079K305", "GOOGL", "Goldilocks"),
    ("88160R101", "TSLA",  "Rate_Shock"),
    ("46625H100", "JPM",   "Goldilocks"),
    ("92826C839", "V",     "Goldilocks"),
    ("11135F101", "AVGO",  "Goldilocks"),
    ("532457108", "LLY",   "Recovery"),
    ("478160104", "JNJ",   "Goldilocks"),
    ("30231G102", "XOM",   "Rate_Shock"),
    ("91324P102", "UNH",   "Goldilocks"),
    ("084670702", "BRK.B", "Goldilocks"),
    ("17275R102", "CSCO",  "Goldilocks"),
    ("69343P105", "PFE",   "Recession_Fear"),
    ("718172109", "HD",    "Goldilocks"),
    ("22160K105", "CRM",   "Goldilocks"),
    ("742718109", "PG",    "Recovery"),
    ("191216100", "KO",    "Recovery"),
    ("78468R103", "SPGI",  "Goldilocks"),
    ("038222100", "ABBV",  "Recovery"),
    ("808513105", "SCHW",  "Rate_Shock"),
    ("500754106", "LRCX",  "Goldilocks"),
    ("29670E107", "ETN",   "Goldilocks"),
    ("003260106", "ACN",   "Goldilocks"),
    ("256135203", "BAC",   "Recovery"),
    ("747525103", "QCOM",  "Goldilocks"),
    ("741503207", "PM",    "Recovery"),
    ("172967424", "CI",    "Goldilocks"),
    ("023608102", "AXP",   "Goldilocks"),
    ("464287655", "ITW",   "Goldilocks"),
    ("693718108", "PNC",   "Rate_Shock"),
    ("110122108", "BMY",   "Recession_Fear"),
    ("68389X105", "ORCL",  "Goldilocks"),
    ("595112103", "MSCI",  "Goldilocks"),
    ("92343V104", "VZ",    "Recovery"),
    ("406216101", "HAL",   "Rate_Shock"),
    ("166764100", "CI",    "Goldilocks"),
]


def make_signal(i: int, cusip: str, ticker: str, regime: str) -> dict:
    r = random.Random(i * 7 + 13)
    activist_buyers = r.randint(3, 28)
    strong_buys = r.randint(2, activist_buyers)
    total_funds = r.randint(300, 1800)
    consensus_weight = r.uniform(0.008, 0.072)
    racs_raw = consensus_weight * math.log(activist_buyers + 1.1)
    crowding = min(total_funds / 9400.0 * r.uniform(0.8, 1.2), 0.92)
    regime_prob = r.uniform(0.62, 0.94)
    favorable = regime in ("Goldilocks", "Recovery")
    rw = 0.3
    multiplier = 1 + (rw if favorable else -rw) * regime_prob
    regime_adj = racs_raw * (1 - crowding) * multiplier
    return {
        "quarter": "2024_Q4",
        "cusip": cusip,
        "ticker": ticker,
        "activist_buyers": activist_buyers,
        "strong_buys": strong_buys,
        "total_activist_value": round(consensus_weight, 6),
        "total_funds": total_funds,
        "conviction_raw": round(racs_raw, 6),
        "crowding_penalty": round(crowding, 4),
        "racs_score": round(consensus_weight, 6),
        "regime_label": regime,
        "regime_adjusted_racs": round(max(regime_adj, 0.0001), 6),
    }


signals = [make_signal(i, *stock) for i, stock in enumerate(STOCKS)]
signals.sort(key=lambda x: -x["regime_adjusted_racs"])
for rank, s in enumerate(signals, 1):
    s["rank"] = rank

write("signals.json", {
    "generated_at": GENERATED_AT,
    "run_id": RUN_ID,
    "provenance_quality": 0.985,
    "validation_passed": True,
    "total_signals": 2847,
    "data_quarters": [
        "2022_Q1", "2022_Q2", "2022_Q3", "2022_Q4",
        "2023_Q1", "2023_Q2", "2023_Q3", "2023_Q4",
        "2024_Q1", "2024_Q2", "2024_Q3", "2024_Q4",
    ],
    "signals": signals,
})

# ── 2. REGIMES ────────────────────────────────────────────────────────────────
LABELS = ["Goldilocks", "Recovery", "Rate_Shock", "Recession_Fear"]

# Realistic 24-quarter macro narrative 2019-Q1 → 2024-Q4
label_seq = [
    "Goldilocks", "Goldilocks", "Goldilocks", "Goldilocks",     # 2019
    "Goldilocks", "Recession_Fear", "Recession_Fear", "Recovery", # 2020 (COVID)
    "Recovery", "Recovery", "Recovery", "Goldilocks",            # 2021
    "Rate_Shock", "Rate_Shock", "Rate_Shock", "Rate_Shock",      # 2022 (Fed hike cycle)
    "Recession_Fear", "Recovery", "Recovery", "Goldilocks",      # 2023 (SVB → rally)
    "Goldilocks", "Goldilocks", "Goldilocks", "Goldilocks",      # 2024 (soft landing)
]
probs = [
    0.87, 0.91, 0.84, 0.88,
    0.82, 0.93, 0.89, 0.78,
    0.71, 0.83, 0.90, 0.86,
    0.92, 0.88, 0.94, 0.91,
    0.79, 0.82, 0.87, 0.90,
    0.85, 0.88, 0.91, 0.87,
]
quarter_ends = [
    (2019, "03-31"), (2019, "06-30"), (2019, "09-30"), (2019, "12-31"),
    (2020, "03-31"), (2020, "06-30"), (2020, "09-30"), (2020, "12-31"),
    (2021, "03-31"), (2021, "06-30"), (2021, "09-30"), (2021, "12-31"),
    (2022, "03-31"), (2022, "06-30"), (2022, "09-30"), (2022, "12-31"),
    (2023, "03-31"), (2023, "06-30"), (2023, "09-30"), (2023, "12-31"),
    (2024, "03-31"), (2024, "06-30"), (2024, "09-30"), (2024, "12-31"),
]

history = [
    {
        "date": f"{yr}-{mo}",
        "regime_id": LABELS.index(lbl),
        "regime_label": lbl,
        "regime_prob": prob,
    }
    for (yr, mo), lbl, prob in zip(quarter_ends, label_seq, probs)
]

from collections import Counter
dist_raw = Counter(label_seq)
distribution = [
    {"regime_label": lbl, "count": dist_raw[lbl], "pct": round(dist_raw[lbl] / 24, 3)}
    for lbl in LABELS
]

transition_matrix = {
    "labels": LABELS,
    "matrix": [
        [0.78, 0.14, 0.06, 0.02],
        [0.22, 0.62, 0.09, 0.07],
        [0.05, 0.18, 0.71, 0.06],
        [0.08, 0.31, 0.10, 0.51],
    ],
}

write("regimes.json", {
    "generated_at": GENERATED_AT,
    "run_id": RUN_ID,
    "total_observations": 24,
    "current": history[-1],
    "history": history,
    "distribution": distribution,
    "transition_matrix": transition_matrix,
})

# ── 3. CLUSTERS ───────────────────────────────────────────────────────────────
ARCHETYPES = [
    ("Conviction Activists", 847,  0.095, (3.2,  1.8),  0.8,
     "High conviction, concentrated positions. Low diversification (high HHI), "
     "strong conviction delta. Exploits 13F filing momentum."),
    ("Index Huggers",        3241, 0.363, (-2.1, -1.4), 1.4,
     "Low turnover, diversified holdings tracking benchmark indices. "
     "Dominant by count. Large AUM, passive-adjacent behaviour."),
    ("Macro Tourists",       2156, 0.241, (0.5,  3.5),  1.1,
     "High options exposure (put ratio), elevated turnover. "
     "Tactical allocation around macro inflection events."),
    ("Nimble Traders",       1892, 0.212, (-1.8, 2.1),  1.0,
     "Small AUM, high turnover, agile position sizing. "
     "Exploits short liquidity windows between filing periods."),
]
TOTAL_MANAGERS = 8934
NOISE_COUNT = TOTAL_MANAGERS - sum(a[1] for a in ARCHETYPES)

umap_pts: list[dict] = []
total_sample = 2000
for cid, (label, count, pct, center, spread, _) in enumerate(ARCHETYPES):
    n = int(round(pct * total_sample))
    xs = np.random.normal(center[0], spread, n)
    ys = np.random.normal(center[1], spread * 0.7, n)
    for x, y in zip(xs, ys):
        umap_pts.append({
            "umap_x": round(float(x), 4),
            "umap_y": round(float(y), 4),
            "archetype_label": label,
            "cluster_id": cid,
        })

noise_n = total_sample - len(umap_pts)
for _ in range(max(0, noise_n)):
    umap_pts.append({
        "umap_x": round(float(np.random.uniform(-5.5, 5.5)), 4),
        "umap_y": round(float(np.random.uniform(-4.0, 5.5)), 4),
        "archetype_label": "Noise",
        "cluster_id": -1,
    })

rng.shuffle(umap_pts)

archetype_meta = [
    {
        "archetype_label": label,
        "cluster_id": cid,
        "count": count,
        "pct": pct,
        "description": desc,
    }
    for cid, (label, count, pct, _, __, desc) in enumerate(ARCHETYPES)
]
archetype_meta.append({
    "archetype_label": "Noise",
    "cluster_id": -1,
    "count": NOISE_COUNT,
    "pct": round(NOISE_COUNT / TOTAL_MANAGERS, 3),
    "description": "Outlier managers not assignable to a stable archetype (HDBSCAN noise points).",
})

write("clusters.json", {
    "generated_at": GENERATED_AT,
    "run_id": RUN_ID,
    "total_managers": TOTAL_MANAGERS,
    "n_archetypes": 4,
    "algorithm": "HDBSCAN",
    "embedding": "UMAP(n_components=2, n_neighbors=15, min_dist=0.1)",
    "min_cluster_size_sweep": [50, 100, 150, 200, 300],
    "best_min_cluster_size": 100,
    "silhouette_score": 0.412,
    "archetypes": archetype_meta,
    "umap_sample": umap_pts,
})

# ── 4. PORTFOLIO ──────────────────────────────────────────────────────────────
top_holdings = [
    {
        "rank": s["rank"],
        "ticker": s["ticker"],
        "cusip": s["cusip"],
        "weight": round(s["total_activist_value"] * 0.9, 4),
        "racs_score": s["regime_adjusted_racs"],
        "regime_label": s["regime_label"],
    }
    for s in signals[:10]
]

write("portfolio.json", {
    "generated_at": GENERATED_AT,
    "run_id": RUN_ID,
    "summary": {
        "gross_exposure": 1.94,
        "net_exposure": 0.06,
        "estimated_turnover": 0.83,
        "cash_drag": 0.017,
        "n_positions": 50,
        "n_long": 34,
        "n_short": 16,
        "top_n_decile": 0.10,
    },
    "top_holdings": top_holdings,
    "costs": {
        "large_cap_bps": 20,
        "small_cap_bps": 50,
        "filing_lag_days": 45,
        "holding_period_days": 90,
        "fill_delay_days": 1,
    },
    "factor_risk": {
        "market_var": 0.0341,
        "factor_var": 0.0218,
        "idiosyncratic_var": 0.0123,
        "factor_pct": 0.639,
    },
})

# ── 5. VALIDATION ─────────────────────────────────────────────────────────────
write("validation.json", {
    "generated_at": GENERATED_AT,
    "run_id": RUN_ID,
    "gate_passed": True,
    "checks": {
        "leakage_audit": {
            "passed": True,
            "detail": (
                "No lookahead bias detected across 2,847 signals. "
                "T+1 fill delay enforced. 45-day 13F filing lag applied."
            ),
        },
        "provenance_threshold": {
            "passed": True,
            "value": 0.985,
            "threshold": 0.90,
            "detail": (
                "98.5% CUSIP resolution rate via SEC exchange tickers "
                "+ EDGAR company_tickers_exchange.json fallback."
            ),
        },
        "reproducibility": {
            "passed": True,
            "detail": (
                "SHA-256 checksums match across 3 independent seed=42 runs. "
                "Deterministic HDBSCAN + Gaussian HMM confirmed."
            ),
        },
        "pbo_validation": {
            "passed": True,
            "value": 0.234,
            "threshold": 0.40,
            "detail": (
                "PBO 23.4% across C(16,8)=12,870 CSCV combinations. "
                "Well below 40% overfitting threshold. Bailey et al. (2016)."
            ),
        },
    },
    "dsr": {
        "observed_sharpe": 1.847,
        "deflated_sharpe": 1.312,
        "is_significant": True,
        "n_trials": 21,
        "skewness": -0.23,
        "excess_kurtosis": 0.81,
        "serial_correlation": 0.042,
        "benchmark_sharpe": 0.50,
        "detail": (
            "DSR 1.312 > 1.0 threshold. Statistically significant after "
            "adjusting for 21 configurations, non-normality, and serial "
            "correlation. Bailey & Lopez de Prado (2014)."
        ),
    },
    "pbo": {
        "score": 0.234,
        "n_partitions": 16,
        "n_combinations": 12870,
        "passed": True,
        "detail": "Bailey et al. (2016) CSCV. 23.4% of IS-best strategies underperform OOS.",
    },
    "monte_carlo": {
        "n_simulations": 1000,
        "bootstrap": {
            "test": "Bootstrap resampling (N=1,000)",
            "observed_sharpe": 1.847,
            "p_value": 0.031,
            "sharpe_5pct": 0.821,
            "sharpe_50pct": 1.643,
            "sharpe_95pct": 2.104,
            "significant": True,
        },
        "randomized_entry": {
            "test": "Randomized entry timing (N=1,000)",
            "observed_sharpe": 1.847,
            "p_value": 0.018,
            "sharpe_5pct": -0.312,
            "sharpe_50pct": 0.089,
            "sharpe_95pct": 0.641,
            "significant": True,
        },
        "regime_permutation": {
            "test": "Regime label permutation (N=1,000)",
            "observed_sharpe": 1.847,
            "p_value": 0.044,
            "sharpe_5pct": 0.241,
            "sharpe_50pct": 0.887,
            "sharpe_95pct": 1.512,
            "significant": True,
        },
    },
})

# ── 6. BACKTEST ───────────────────────────────────────────────────────────────
sharpes = [1.92, 1.78, 2.11, 1.65, 1.89, 1.74, 1.83, 1.69, 1.71, 1.84]
mrets   = [0.038, 0.031, 0.044, 0.027, 0.036, 0.029, 0.033, 0.028, 0.030, 0.032]
mdd     = [-0.061, -0.074, -0.048, -0.092, -0.057, -0.081, -0.063, -0.088, -0.071, -0.059]
hrate   = [0.591, 0.563, 0.608, 0.544, 0.579, 0.557, 0.572, 0.549, 0.562, 0.567]
trades  = [187, 214, 241, 268, 295, 322, 349, 376, 403, 192]

wf_folds = [
    {
        "fold": i + 1,
        "train_start": 2010,
        "train_end": 2014 + i,
        "test_start": 2015 + i,
        "test_end": 2015 + i,
        "n_trades": trades[i],
        "sharpe": sharpes[i],
        "mean_return": mrets[i],
        "max_drawdown": mdd[i],
        "hit_rate": hrate[i],
    }
    for i in range(10)
]

write("backtest.json", {
    "generated_at": GENERATED_AT,
    "run_id": RUN_ID,
    "summary": {
        "annualized_sharpe": 1.847,
        "annualized_return": 0.142,
        "max_drawdown": -0.087,
        "hit_rate": 0.567,
        "total_trades": 2847,
        "holding_period_days": 90,
        "filing_lag_days": 45,
        "fill_delay_days": 1,
        "test_period": "2010-2024",
    },
    "walk_forward_folds": wf_folds,
    "factor_attribution": {
        "alpha_annualized": 0.089,
        "alpha_t_stat": 3.12,
        "market_beta": 0.231,
        "smb": -0.041,
        "hml": 0.113,
        "rmw": 0.078,
        "cma": 0.031,
        "mom": 0.142,
        "r_squared": 0.187,
        "detail": (
            "Fama-French 5-Factor + Momentum. Alpha 8.9% p.a., t-stat 3.12. "
            "Low market beta (0.23) confirms factor orthogonality."
        ),
    },
    "capacity": {
        "estimated_capacity_usd": 847_000_000,
        "adv_participation_limit_pct": 5.0,
        "adv_cliff_at_aum_usd": 500_000_000,
        "detail": (
            "Capacity cliff at ~$500M AUM based on 5% ADV participation limit. "
            "Full capacity ~$847M."
        ),
    },
    "signal_decay": {
        "half_life_days": 47,
        "peak_ic": 0.081,
        "detail": (
            "IC half-life 47 days, consistent with 90-day holding period. "
            "Signal well within effective IC window."
        ),
    },
})

# ── 7. METADATA ───────────────────────────────────────────────────────────────
artifact_names = [
    "signals.json", "regimes.json", "clusters.json",
    "portfolio.json", "validation.json", "backtest.json",
]
write("metadata.json", {
    "generated_at": GENERATED_AT,
    "run_id": RUN_ID,
    "git_commit": GIT_COMMIT,
    "pipeline_version": "4.16",
    "data_vintage": {
        "edgar_through": "2024_Q4",
        "fred_through": "2024-12-31",
        "total_filings_processed": 116_000_000,
        "total_managers": 8934,
        "total_cusips": 42817,
        "source": "SEC EDGAR 13F (2000-2024)",
    },
    "pipeline_config": {
        "hmm_states": 4,
        "hdbscan_min_cluster_size": 100,
        "racs_min_activist_buyers": 2,
        "racs_regime_weight": 0.3,
        "backtest_holding_days": 90,
        "backtest_filing_lag": 45,
        "cscv_partitions": 16,
        "monte_carlo_n": 1000,
        "global_seed": 42,
    },
    "artifact_hashes": {n: file_sha16(n) for n in artifact_names},
})

print()
print("Done. All 7 artifacts written to", OUT)
