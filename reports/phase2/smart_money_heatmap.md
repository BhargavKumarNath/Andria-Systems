# Phase 2: Smart Money Heatmap & Regime Detection

## Overview
Phase 2 bridges the gap between macroeconomic conditions and micro-level manager conviction. We detect the prevailing macro regime using a Hidden Markov Model (HMM) on FRED and OFR data, and then adjust the raw conviction signals to produce the Regime-Adjusted Conviction Score (RACS).

## Macro Regime Labeling
We utilize a Gaussian HMM configured to detect 4 distinct regimes. The model evaluates features like VIX, 10Y-2Y Yield Spreads, High Yield Credit Spreads, Fed Funds deltas, and the OFR Financial Stress Index.

The four regimes identified are:
1. **Goldilocks:** Low stress, normal yield curve, low volatility. Optimal for high conviction plays.
2. **Recovery:** Improving credit conditions, supportive for beaten-down value names.
3. **Rate Shock:** High Fed Funds delta, widening spreads. Penalizes long duration equity.
4. **Recession Fear:** Inverted yield curve, high VIX, peak financial stress. 

![Macro Regime Probabilities](/reports/phase2/regime_probs.png)

## Recent Regime History
| Quarter | Prevailing Regime | Confidence |
| :--- | :--- | :--- |
| 2026 Q2 | Recession Fear | 100% |
| 2026 Q1 | Goldilocks | 100% |
| 2025 Q4 | Goldilocks | 100% |
| 2025 Q3 | Goldilocks | 100% |
| 2025 Q2 | Goldilocks | 100% |
| 2025 Q1 | Goldilocks | 100% |
| 2024 Q4 | Goldilocks | 100% |
| 2024 Q3 | Goldilocks | 100% |

## Regime-Adjusted Conviction Score (RACS)
The raw conviction signal is derived from detecting 3+ Conviction Activists initiating or significantly sizing up a position in a single quarter. 

The raw score is then adjusted:
$$ RACS = Conviction_{raw} \times Regime\_Alignment \times Crowding\_Penalty $$

- **Regime Alignment:** The baseline score is scaled by a dynamic weight according to how conducive the current macro regime is for activist investing.
- **Crowding Penalty:** We penalize trades heavily saturated by non-activist institutional money to avoid "late to the party" slippage.

## Interactive Dashboard
The end deliverable for Phase 2 is a fully reactive Plotly Dash application built on top of DuckDB materializations. It features 5 panels:
- **System Health:** Tracks pipeline data integrity and clean dates.
- **Macro Regime:** Live probability surface of the current macroeconomic environment.
- **Archetypes Map:** UMAP visualization of manager behavioral clusters.
- **Market Intelligence:** Capital allocation by archetype and concentration breakdowns.
- **Alpha Tracker / Signals:** The finalized ledger of RACS scores across all traded CUSIPs.
