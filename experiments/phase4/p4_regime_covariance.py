"""Phase 4.3: the 4-state macro HMM with full vs simpler covariance (protocol: docs/phase4_protocol.md).

Rebuilds the five features as MacroRegimeDetector._extract_macro_features does, from FRED's public CSVs.
Shapes: X (n_quarters, 5) standardised. Writes results/phase4/regime_covariance.json.
"""
from __future__ import annotations

import io
import json
import logging
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import yaml
from hmmlearn import hmm
from sklearn.metrics import adjusted_rand_score
from sklearn.metrics.pairwise import cosine_similarity

warnings.filterwarnings("ignore")
logging.getLogger("hmmlearn").setLevel(logging.CRITICAL)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("p4r")
OUT = Path("results/phase4")
CACHE = Path("experiments/phase4/cache")
import os
MODE = os.environ.get("MODE", "clean")  # "repo_logic" replicates the SQL defaults; "clean" ffills and uses BAA10Y
SERIES = ["VIXCLS", "T10Y2Y", "BAMLH0A0HYM2", "DFF", "NFCIRISK", "BAA10Y"]
K, N_RESTARTS, N_OOS, OOS_RESTARTS = 4, 30, 40, 5
COV_TYPES = ["full", "tied", "diag", "spherical"]


def fred(sid: str) -> pd.DataFrame:
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"fred_{sid}.csv.txt"
    if not f.exists():
        r = requests.get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd=2003-01-01&coed=2026-06-30", timeout=60)
        r.raise_for_status()
        f.write_text(r.text)
    d = pd.read_csv(io.StringIO(f.read_text()), na_values=["."])
    d.columns = ["date", sid]
    d["date"] = pd.to_datetime(d["date"])
    return d.set_index("date")


def build_features() -> tuple[pd.DataFrame, dict]:
    """Replicates the repo's SQL: union of dates, defaults for missing values, last date of each quarter."""
    daily = pd.concat([fred(s) for s in SERIES], axis=1).sort_index()
    if MODE == "clean":
        # carry each series forward to the quarter's last calendar day; HY spread has only 3 years of public history,
        # so the Baa-10Y spread stands in for it over the full 2004-2026 range
        daily = daily.ffill()
        daily["BAMLH0A0HYM2"] = daily["BAA10Y"]
    daily = daily[daily.index >= "2004-01-01"]
    m = pd.DataFrame(index=daily.index)
    m["vix_level"] = daily["VIXCLS"].fillna(15.0)
    m["yield_spread_10y2y"] = daily["T10Y2Y"].fillna(0.0)
    m["credit_spread_hy"] = daily["BAMLH0A0HYM2"].fillna(4.0)
    dff = daily["DFF"].fillna(0.0)
    m["fed_funds_delta"] = (dff - dff.shift(60)).fillna(0.0)
    m["ofr_stress_index"] = daily["NFCIRISK"].fillna(0.0)
    last = m.groupby(m.index.to_period("Q")).tail(1)
    raw_last = daily.groupby(daily.index.to_period("Q")).tail(1)
    defaulted = {
        "quarters": int(len(last)),
        "last_date_is_weekend": int((last.index.dayofweek >= 5).sum()),
        "vix_defaulted_to_15": int(raw_last["VIXCLS"].isna().sum()),
        "t10y2y_defaulted_to_0": int(raw_last["T10Y2Y"].isna().sum()),
        "hy_defaulted_to_4": int(raw_last["BAMLH0A0HYM2"].isna().sum()),
        "nfci_defaulted_to_0": int(raw_last["NFCIRISK"].isna().sum()),
    }
    last.index = last.index.to_period("Q").to_timestamp()
    return last, defaulted


def n_params(cov: str, k: int, d: int) -> int:
    base = (k - 1) + k * (k - 1) + k * d
    return base + {"full": k * d * (d + 1) // 2, "tied": d * (d + 1) // 2, "diag": k * d, "spherical": k}[cov]


def fit(X: np.ndarray, cov: str, seed: int) -> tuple[hmm.GaussianHMM, float, bool]:
    m = hmm.GaussianHMM(n_components=K, covariance_type=cov, n_iter=1000, random_state=seed)
    try:
        m.fit(X)
        ll = float(m.score(X))
        return m, ll, bool(m.monitor_.converged)
    except Exception:  # noqa: BLE001 - degenerate covariance etc.
        return m, float("-inf"), False


def label_states(model: hmm.GaussianHMM, protos: dict[str, list[float]]) -> dict[int, str]:
    names = list(protos)
    P = np.array([protos[n] for n in names])
    means = model.means_
    avail, out = set(names), {}
    for s in range(K):
        sims = cosine_similarity(means[s].reshape(1, -1), P)[0]
        for idx in np.argsort(sims)[::-1]:
            if names[idx] in avail:
                out[s] = names[idx]
                avail.remove(names[idx])
                break
        else:
            out[s] = names[int(np.argmax(sims))] + " (Variant)"
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cfg = yaml.safe_load(Path("configs/base.yaml").read_text())
    protos = cfg["hmm"]["regime_prototypes"]
    feats = cfg["hmm"]["features"]
    df, defaulted = build_features()
    df = df[df.index <= "2026-01-01"]  # 2004Q1..2026Q1
    log.info("quarters %d, defaults %s", len(df), defaulted)
    X_raw = df[feats].to_numpy()
    mu, sd = X_raw.mean(0), X_raw.std(0)
    X = (X_raw - mu) / sd
    n, d = X.shape
    res: dict = {"n_quarters": n, "features": feats, "feature_defaults_used_by_repo_logic": defaulted, "covariance": {}}

    signals = pd.DataFrame(json.loads(Path("frontend/public/data/signals.json").read_text())["signals"])
    sig_q = pd.PeriodIndex(signals["quarter"].str.replace("Q", "Q"), freq="Q").to_timestamp()
    labels_by_cov: dict[str, np.ndarray] = {}
    for cov in COV_TYPES:
        fits = [fit(X, cov, s) for s in range(N_RESTARTS)]
        ok = [(m, ll, c) for m, ll, c in fits if np.isfinite(ll)]
        best_m, best_ll, _ = max(ok, key=lambda t: t[1])
        best_lab = best_m.predict(X)
        aris = [adjusted_rand_score(best_lab, m.predict(X)) for m, ll, c in ok]
        counts = np.bincount(best_lab, minlength=K)
        p = n_params(cov, K, d)
        # expanding-window one-step-ahead log-likelihood over the last N_OOS quarters
        oos = []
        for t in range(n - N_OOS, n):
            mu_t, sd_t = X_raw[:t].mean(0), X_raw[:t].std(0) + 1e-9
            Z = (X_raw - mu_t) / sd_t
            cand = [fit(Z[:t], cov, s) for s in range(OOS_RESTARTS)]
            cand = [c for c in cand if np.isfinite(c[1])]
            if not cand:
                oos.append(np.nan)
                continue
            m = max(cand, key=lambda c: c[1])[0]
            oos.append(float(m.score(Z[: t + 1]) - m.score(Z[:t])))
        oos = np.array(oos)
        labmap = label_states(best_m, protos)
        named = np.array([labmap[s] for s in best_lab])
        labels_by_cov[cov] = named
        res["covariance"][cov] = {
            "n_params": p, "loglik": best_ll, "bic": float(-2 * best_ll + p * np.log(n)),
            "obs_per_param": float(n * d / p), "min_state_occupancy": int(counts.min()), "state_counts": counts.tolist(),
            "restarts_finite": len(ok), "restarts_converged": int(sum(c for _, ll, c in fits if np.isfinite(ll))),
            "stability_mean_ari_vs_best": float(np.mean(aris)), "stability_min_ari": float(np.min(aris)),
            "oos_loglik_per_quarter_mean": float(np.nanmean(oos)), "oos_loglik_per_quarter_median": float(np.nanmedian(oos)),
            "oos_loglik_failed_fits": int(np.isnan(oos).sum()),
            "oos_loglik_series": [None if np.isnan(v) else round(float(v), 3) for v in oos],
            "labels_distinct": sorted(set(named.tolist())),
        }
        log.info("%s ll=%.1f bic=%.1f minocc=%d ari=%.2f oos=%.2f", cov, best_ll, res["covariance"][cov]["bic"], counts.min(),
                 np.mean(aris), np.nanmean(oos))
    # label agreement across covariance types on the quarters that carry signals
    qidx = {q: i for i, q in enumerate(df.index)}
    pos = [qidx.get(q) for q in sig_q]
    ok_pos = np.array([p is not None for p in pos])
    agree = {}
    for cov in COV_TYPES:
        agree[cov] = {
            "agreement_with_full_on_signal_quarters": float(np.mean([labels_by_cov[cov][p] == labels_by_cov["full"][p] for p in np.array(pos)[ok_pos]])),
            "agreement_with_published_label": float(np.mean([labels_by_cov[cov][p] == lab for p, lab in zip(np.array(pos)[ok_pos], signals["regime_label"][ok_pos])])),
            "label_counts_over_all_quarters": pd.Series(labels_by_cov[cov]).value_counts().to_dict(),
        }
    res["label_agreement"] = agree
    res["signals_in_covered_quarters"] = int(ok_pos.sum())
    (OUT / ("regime_covariance.json" if MODE == "clean" else "regime_covariance_repo_logic.json")).write_text(json.dumps(res, indent=2, default=float))


if __name__ == "__main__":
    main()
