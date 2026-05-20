# Where the Strategy Breaks — Failure Mode Documentation
**Phase 4.15 | Andria Systems | Living Document**

This document honestly catalogues all known failure modes, data limitations,
and conditions under which the RACS signal and Alpha Factory backtest
results should not be trusted. It is updated as new failure modes are
identified.

> This is not a disclaimer. It is institutional research discipline.
> A strategy team that cannot articulate where their model fails is not
> doing credible research.

---

## 1. Data Quality Failures

### 1.1 Synthetic Pricing (Phase 3 baseline)
- **Description**: All Phase 3 results used GBM-simulated pricing.
- **Impact**: Sharpe ratios, p-values, and alpha estimates from Phase 3 are
  pipeline diagnostics — not alpha evidence.
- **Status**: ✗ Active in Phase 3 → ✓ Replaced in Phase 4 by yfinance real pricing.
- **Residual risk**: yfinance free tier has rate limits (~2,000 tickers/day).
  Coverage gaps are tracked by `ProvenanceTracker`. Results below 70% coverage
  are blocked by the evaluation gate.

### 1.2 CUSIP → Ticker Mapping Gaps
- **Description**: SEC EDGAR does not publish a direct CUSIP→ticker crosswalk.
  The static override table covers ~85% of large-cap 13F filings by value,
  but the long tail of small-cap and foreign filers is unmapped.
- **Impact**: Unmapped CUSIPs are excluded from real-data backtests. If the
  unmapped tickers have systematically different return characteristics
  (e.g., small-cap activism targets), backtest results are biased toward
  larger, more liquid names.
- **Mitigation**: The provenance tracker quantifies unmapped % per run.
  Future improvement: integrate OpenFIGI API for fuller coverage.

### 1.3 Corporate Action Adjustment
- **Description**: yfinance `Adj Close` is split and dividend adjusted, but
  historical adjustments for mergers, spin-offs, and ticker changes may be
  incomplete.
- **Detection**: `MarketDataLoader` flags 2×+ single-day price moves.
- **Residual risk**: Missed adjustments create spurious large returns that
  inflate Sharpe and mean return metrics.

---

## 2. Signal Construction Failures

### 2.1 Look-Ahead Bias (pre-Phase 4)
- **Description**: Prior to Phase 4.2, exec dates were computed using raw
  `timedelta(days=45)` which could land on weekends or holidays, potentially
  causing backward asof-joins to capture prices from before the filing date.
- **Status**: ✓ Fixed in Phase 4 by `MarketCalendar.calendar_days_to_trading_date()`.
- **Residual risk**: Leakage audit check `check_future_timestamps` catches
  any recurrence.

### 2.2 Regime Leakage
- **Description**: If the HMM regime labels are assigned using macro data that
  was available after the signal quarter, the regime conditioning artificially
  improves in-sample fit.
- **Detection**: `check_regime_leakage()` in the leakage audit.
- **Residual risk**: The HMM is fit on the full FRED/OFR history before
  regime labeling. This is a known limitation for signals near the end of
  the training window.

### 2.3 Overlapping 13F Windows
- **Description**: Quarterly 13F filings overlap in holding period if positions
  are re-signed in consecutive quarters. The same CUSIP may appear in 2
  consecutive signal sets with overlapping trade windows.
- **Impact**: Inflated trade count, violated independence assumption in t-tests.
- **Detection**: `check_overlapping_labels()` flags and counts overlaps.
- **Mitigation**: Phase 4.17 portfolio constructor enforces single-name caps.

---

## 3. Execution Failures

### 3.1 Instantaneous Fill Assumption (pre-Phase 4)
- **Description**: Phase 3 engine assumed all trades fill at the close on
  exec_date — an unrealistic assumption for institutional-size orders.
- **Status**: ✓ Fixed in Phase 4 by T+1 open fill delay in `ExecutionEngine`.
- **Quantified impact**: Expected to reduce reported Sharpe by 5-15% depending
  on filing date concentration around illiquid periods.

### 3.2 Bid-Ask Spread Model Limitations
- **Description**: Phase 4 uses `0.5 * vol / sqrt(participation_ratio)` as a
  slippage proxy. This approximation is adequate for liquid large-caps but
  understates true spreads for small-cap and international names.
- **Residual risk**: Slippage is underestimated for illiquid names.
- **Future improvement**: Use Corwin-Schultz high-low spread estimator when
  intraday OHLCV data is available.

### 3.3 Capacity Constraints Not Enforced at Portfolio Level
- **Description**: ADV cap is applied per-position. Portfolio-level liquidity
  aggregation (i.e., how much total market volume the combined portfolio
  consumes) is not currently modelled.
- **Impact**: At AUM > ~$500M, the strategy likely consumes meaningful market
  share in smaller positions, creating adverse price impact not captured by
  the per-position model.
- **See**: `notebooks/04_capacity_stress.py` for AUM scaling analysis.

---

## 4. Statistical Failures

### 4.1 Low Observation Count
- **Description**: The 13F universe is quarterly. Even 10 years of data yields
  only 40 quarters. Regime-conditional analysis may have fewer than 30
  observations per regime — below the threshold for reliable t-statistics.
- **Detection**: Evaluation gate flags regimes with n < 30.
- **Mitigation**: Benjamini-Hochberg FDR correction across regime tests.

### 4.2 Non-Stationarity of Return Distribution
- **Description**: The return distribution of 13F-based signals is likely
  non-stationary: alpha has historically concentrated in specific time windows
  (post-GFC 2010-2015, post-COVID 2020-2021) and may be episodic.
- **Evidence**: Walk-forward Sharpe shows fold-to-fold variability > 1.0
  in preliminary analysis.

### 4.3 Multiple Testing (Implicit)
- **Description**: Phase 4 represents ~21 subphases of hyperparameter selection
  and model configuration. The Deflated Sharpe Ratio is computed with
  `n_trials=21` to adjust for this implicitly.
- **Residual risk**: DSR assumes trials are independent. Correlated parameter
  choices (e.g., filing lag and holding period are both time parameters)
  may underestimate the effective number of independent trials.

---

## 5. Regime Transition Vulnerability

### 5.1 Performance at Regime Boundaries
- **Description**: The RACS signal is calibrated to work within stable regimes.
  During transitions (e.g., Goldilocks → Rate_Shock), institutional managers
  are adjusting positioning, increasing signal noise and transaction costs.
- **Evidence**: `regime_transition_metrics()` typically shows 30-50% lower
  Sharpe at transition periods vs. stable regime periods.
- **Mitigation**: Signal decay analysis identifies whether shorter holding
  periods help preserve alpha during transitions.

### 5.2 Regime Classification Uncertainty
- **Description**: HMM state probabilities below 0.7 indicate low-confidence
  regime assignment. Trades in ambiguous regime periods may be incorrectly
  weighted by the RACS multiplier.
- **Impact**: Low-confidence regime trades can add noise to both in-regime
  and transition-period performance buckets.

---

## 6. Known Open Issues (as of Phase 4)

| Issue | Severity | Mitigation Status |
|---|---|---|
| yfinance coverage gaps for international CUSIPs | Medium | Tracked by provenance; excluded |
| Quality factor not included in risk model | Low | Deferred (point-in-time safety) |
| No portfolio-level liquidity aggregation | Medium | Per-position cap only |
| Walk-forward does not retrain HMM per fold | Medium | Evaluation-only; retraining deferred |
| Corwin-Schultz spread estimator not implemented | Low | Vol-based proxy used |
| No intraday VWAP data available | Low | Open/close proxy used |

---

*This document is maintained alongside the codebase. When a new failure mode
is identified, it should be added here before the corresponding fix or
mitigation is implemented — not after. The honest answer about where a
strategy breaks is more valuable than a suppressed failure mode.*
