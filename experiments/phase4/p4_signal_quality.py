"""Phase 4.1/4.2/4.4: IC of the 144 published signals at several horizons, score ablations, ticker coverage.

Protocol: docs/phase4_protocol.md. Input: frontend/public/data/signals.json (the published artifact).
Writes results/phase4/signal_quality.json. Shapes: n priced signals; scores and returns are (n,) float.
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import yfinance as yf
from scipy.stats import rankdata

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("p4q")
OUT = Path("results/phase4")
CACHE = Path("experiments/phase4/cache")
HORIZONS_TD = [5, 20, 60]
HOLD_CAL = 90
FIGI_HEADERS = {"Content-Type": "application/json", "User-Agent": "research-client"}
US_EXCH = ("US", "UA", "UN", "UW", "UQ", "UC", "UR", "UP", "UB", "UF")


def figi_map(cusips: list[str]) -> dict[str, dict]:
    path = CACHE / "figi.json"
    if path.exists():
        return json.loads(path.read_text())
    out: dict[str, dict] = {}
    for i in range(0, len(cusips), 10):
        batch = cusips[i : i + 10]
        r = requests.post("https://api.openfigi.com/v3/mapping", headers=FIGI_HEADERS,
                          json=[{"idType": "ID_CUSIP", "idValue": c} for c in batch], timeout=30)
        for c, res in zip(batch, r.json()):
            out[c] = {"data": [{k: d.get(k) for k in ("ticker", "exchCode", "name", "securityType")} for d in res["data"]]} \
                if "data" in res else res
        time.sleep(2.6)
    path.write_text(json.dumps(out, indent=1))
    return out


def pick_ticker(entry: dict) -> str | None:
    data = entry.get("data") or []
    for d in data:
        if d["exchCode"] in US_EXCH and d["ticker"]:
            return d["ticker"]
    for d in data:  # delisted names appear only on foreign cross-listings; take a plain ticker
        t = d["ticker"] or ""
        if t.isalpha() and len(t) <= 5:
            return t
    return None


def prices(ticker: str, start="2012-01-01", end="2026-06-30") -> pd.DataFrame | None:
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{ticker}.pkl"
    if f.exists():
        d = pd.read_pickle(f)
        return d if len(d) else None
    try:
        d = yf.download(ticker, start=start, end=end, progress=False, auto_adjust=True, threads=False)
    except Exception as e:  # noqa: BLE001
        log.warning("download failed %s: %s", ticker, e)
        d = pd.DataFrame()
    if isinstance(d.columns, pd.MultiIndex):
        d.columns = d.columns.get_level_values(0)
    d = d[["Open", "Close"]].dropna() if len(d) else pd.DataFrame()
    d.to_pickle(f)
    return d if len(d) else None


def quarter_end(q: str) -> pd.Timestamp:
    y, qq = int(q[:4]), int(q[-1])
    return (pd.Timestamp(year=y, month=3 * qq, day=1) + pd.offsets.MonthEnd(0)).normalize()


def forward(stock: pd.DataFrame, spy: pd.DataFrame, entry_idx_spy: int) -> dict[str, float] | None:
    """Excess return from the entry open for each horizon. entry_idx_spy indexes SPY's calendar."""
    cal = spy.index
    d0 = cal[entry_idx_spy]
    if d0 not in stock.index:
        pos = stock.index.searchsorted(d0)
        if pos >= len(stock) or (stock.index[pos] - d0).days > 5:
            return None
        s_open = stock["Open"].iloc[pos]
    else:
        s_open = stock.loc[d0, "Open"]
    m_open = spy.loc[d0, "Open"]
    res: dict[str, float] = {}
    targets = {f"{h}d": cal[min(entry_idx_spy + h, len(cal) - 1)] if entry_idx_spy + h < len(cal) else None for h in HORIZONS_TD}
    cal_end = d0 + pd.Timedelta(days=HOLD_CAL)
    k = cal.searchsorted(cal_end, side="right") - 1
    targets[f"{HOLD_CAL}cal"] = cal[k] if cal_end <= cal[-1] else None
    for name, dt in targets.items():
        if dt is None:
            res[name] = np.nan
            continue
        j = stock.index.searchsorted(dt, side="right") - 1
        if j < 0 or (dt - stock.index[j]).days > 5:
            res[name] = np.nan
            continue
        res[name] = (stock["Close"].iloc[j] / s_open - 1) - (spy.loc[dt, "Close"] / m_open - 1)
    return res


def spearman(a: np.ndarray, b: np.ndarray) -> float:
    ra, rb = rankdata(a), rankdata(b)
    if ra.std() == 0 or rb.std() == 0:
        return float("nan")
    return float(np.corrcoef(ra, rb)[0, 1])


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    sig = pd.DataFrame(json.loads(Path("frontend/public/data/signals.json").read_text())["signals"])
    assert len(sig) == 144
    # score identity and derived terms
    base = sig["conviction_raw"] * (1 - sig["crowding_penalty"])
    sig["regime_factor"] = sig["regime_adjusted_racs"] / base
    sig["score_full"] = sig["regime_adjusted_racs"]
    sig["score_no_crowding"] = sig["conviction_raw"] * sig["regime_factor"]
    sig["score_no_regime"] = base
    sig["score_neither"] = sig["conviction_raw"]
    factor_range = [float(sig["regime_factor"].min()), float(sig["regime_factor"].max())]
    log.info("regime_factor range %s", factor_range)

    cusips = sorted(sig["cusip"].unique())
    figi = figi_map(cusips)
    tick = {c: pick_ticker(figi[c]) for c in cusips}
    sig["ticker"] = sig["cusip"].map(tick)
    coverage = {"cusips_total": len(cusips), "cusips_with_ticker": sum(t is not None for t in tick.values()),
                "signals_total": len(sig), "signals_with_ticker": int(sig["ticker"].notna().sum()),
                "unresolved_cusips": [c for c, t in tick.items() if t is None], "tickers": tick}
    spy = prices("SPY")
    assert spy is not None
    px = {t: prices(t) for t in sorted({t for t in tick.values() if t})}
    coverage["tickers_with_prices"] = sorted(t for t, d in px.items() if d is not None)
    coverage["tickers_without_prices"] = sorted(t for t, d in px.items() if d is None)

    rows = []
    for _, r in sig.iterrows():
        t = r["ticker"]
        if not t or px.get(t) is None:
            continue
        pub = quarter_end(r["quarter"]) + pd.Timedelta(days=45)
        i = spy.index.searchsorted(pub)          # first trading day on/after public date
        if i + 1 >= len(spy):
            continue
        f = forward(px[t], spy, i + 1)           # entry = next trading day open
        if f is None:
            continue
        rows.append({"rank": r["rank"], "quarter": r["quarter"], "cusip": r["cusip"], "ticker": t, "entry": str(spy.index[i + 1].date()),
                     **{k: r[k] for k in ("score_full", "score_no_crowding", "score_no_regime", "score_neither", "regime_label")}, **f})
    df = pd.DataFrame(rows)
    coverage["signals_priced_any_horizon"] = int(len(df))
    log.info("priced signals: %d of 144", len(df))

    horizons = [f"{h}d" for h in HORIZONS_TD] + [f"{HOLD_CAL}cal"]
    variants = ["score_full", "score_no_crowding", "score_no_regime", "score_neither"]
    rng = np.random.default_rng(42)
    quarters = df["quarter"].unique()
    q_idx = {q: np.where(df["quarter"].values == q)[0] for q in quarters}
    boots = [np.concatenate([q_idx[q] for q in rng.choice(quarters, len(quarters))]) for _ in range(2000)]
    res: dict = {"coverage": coverage, "regime_factor_range": factor_range, "n_signals_priced": int(len(df)), "ic": {}}
    for h in horizons:
        ok = df[h].notna().values
        n = int(ok.sum())
        ret = df[h].values
        out_h: dict = {"n": n}
        bs = {v: [] for v in variants}
        for b in boots:
            bb = b[ok[b]]
            if len(bb) < 10:
                continue
            for v in variants:
                bs[v].append(spearman(df[v].values[bb], ret[bb]))
        for v in variants:
            x = df[v].values[ok]
            ic = spearman(x, ret[ok])
            perm = np.array([spearman(rng.permutation(x), ret[ok]) for _ in range(10000)])
            arr = np.array(bs[v])
            half = x >= np.median(x)
            out_h[v] = {"ic": ic, "ci": [float(np.nanpercentile(arr, 2.5)), float(np.nanpercentile(arr, 97.5))],
                        "perm_p_two_sided": float((np.abs(perm) >= abs(ic)).mean()),
                        "top_minus_bottom_half_excess": float(ret[ok][half].mean() - ret[ok][~half].mean()),
                        "mean_excess_all": float(ret[ok].mean())}
        out_h["paired_full_minus"] = {}
        for v in variants[1:]:
            d = np.array(bs["score_full"]) - np.array(bs[v])
            out_h["paired_full_minus"][v] = {"mean": float(np.nanmean(d)), "ci": [float(np.nanpercentile(d, 2.5)), float(np.nanpercentile(d, 97.5))]}
        res["ic"][h] = out_h
        log.info("%s n=%d full IC=%.3f", h, n, out_h["score_full"]["ic"])
    res["by_regime_mean_excess_90cal"] = df.groupby("regime_label")["90cal"].agg(["count", "mean"]).reset_index().to_dict(orient="records")
    (OUT / "signal_quality.json").write_text(json.dumps(res, indent=2, default=float))
    df.to_csv(OUT / "signal_returns.csv", index=False)


if __name__ == "__main__":
    main()
