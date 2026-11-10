# Phase 4 protocol: signal quality on all 144 signals, ablations, simpler regime covariance

Written 2026-11-10 before any price was downloaded or any model fitted. Deviations are appended at the bottom, never edited above.

## What is and is not possible
The raw 13F holdings (120.2M rows) are not on this machine, so the pipeline cannot be re-run. The published artifact `frontend/public/data/signals.json` holds all 144 signals with the score components (`conviction_raw`, `crowding_penalty`, `regime_label`, `regime_adjusted_racs`) and is the input. The score identity `regime_adjusted_racs = conviction_raw * (1 - crowding_penalty) * regime_factor` is checked on the 144 rows first; the regime factor is derived as the ratio. Prices come from yfinance (adjusted), macro series from FRED's public CSV endpoints.

## 1. Signal quality (IC) on every priceable signal
- Timing as in `docs/event_timing.md`: quarter end + 45 calendar days, snapped to the next NYSE trading day (taken from SPY's trading dates), entry at the next trading day's open (1-day fill delay).
- Forward return from the entry open to the close h trading days later, h in {5, 20, 60}, and to the close 90 calendar days later (the backtest's holding period). Excess return = stock return minus SPY return over the same dates.
- Signals whose CUSIP has no ticker, or whose price history is unavailable, are counted and excluded; the number priced out of 144 is reported next to every result.
- IC = Spearman correlation between score and excess return, pooled over all priced signals (cross-sections are too small for per-quarter IC: about three names per quarter). 95% interval from a bootstrap that resamples whole quarters (2,000 resamples, seed 42). Permutation p-value from 10,000 shuffles of the scores (seed 42). Also reported: mean excess return of the top half minus the bottom half of scores.
- Overlapping holding windows on the same CUSIP are not independent; the quarter-cluster bootstrap is the only adjustment.

## 2. Ablations of the score terms
Four scores per signal: full (`regime_adjusted_racs`); no crowding (`conviction_raw * regime_factor`); no regime (`conviction_raw * (1 - crowding_penalty)`); neither (`conviction_raw`). IC for each at each horizon, and paired differences full minus variant from the same bootstrap resamples. A term "helps" only if the paired interval excludes zero.

## 3. Regime model with simpler covariance
Features exactly as `MacroRegimeDetector._extract_macro_features`: VIXCLS, T10Y2Y, BAMLH0A0HYM2, 60-day change in DFF, NFCIRISK as the stress proxy; last observation of each quarter, 2004Q1 to 2026Q1; standardised; 4 states. Covariance types full, tied, diag, spherical. For each: 30 random restarts (seeds 0 to 29, 1,000 EM iterations); best log-likelihood; number of free parameters; BIC; smallest state occupancy; share of restarts that converged; mean adjusted Rand index between each restart's labels and the best fit's labels (stability); expanding-window out-of-sample log-likelihood per quarter (train through quarter t-1, score quarter t, for the last 40 quarters, best of 5 restarts per fit, seed fixed). Finally, the regime label of each of the 144 signals under each covariance type (after the repo's prototype-cosine labelling) and its agreement with the full-covariance label.

## 4. Ticker coverage
Re-query OpenFIGI for the 28 distinct CUSIPs without the exchange preference, by ISIN and by CUSIP with security-type filters. Report coverage by CUSIP and by signal. No identifier is guessed.

## Rules
- One run per script; no change of horizons, restart counts or windows after results are seen. Everything written by script to `results/phase4/`.
- If the data show no signal, that is the result.

## Deviations
2026-11-10, after the first run of section 3 (before any section 3 result was read for quality): the replica of the repo's SQL gave 79 of 90 quarters with the high-yield spread defaulted to 4.0 and 77 with the stress index defaulted to 0, because the public FRED high-yield series only starts 2023-11 and the quarter's last calendar day is often a weekend where weekly/daily series are blank. That run (kept as `regime_covariance_repo_logic.json`) has 32 of 40 out-of-sample fits crash on constant columns, so it cannot answer the question. Second run, `MODE=clean`: forward-fill every series, use Baa-10Y in place of the high-yield spread, add 1e-9 to window std. The `clean` run is the one reported; the repo-logic run is reported alongside as a finding about the original inputs. The change is justified by data availability, not by which covariance won.
