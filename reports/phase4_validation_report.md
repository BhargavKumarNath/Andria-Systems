# Phase 4 Validation Report: Institutional Readiness & Leakage Audit

**Author:** Senior Quant Research Engineer & System Validation Lead
**Date:** May 2026
**Target:** Andria Phase 4 (Realism & Validation Upgrades)

## Executive Summary

An aggressive, adversarial validation sweep of the Andria Phase 4 system has been completed. The mandate was to break the system, expose weaknesses, identify leakage risks, surface hidden assumptions, validate reproducibility, and stress-test statistical credibility.

Overall, Phase 4 introduces robust institutional-grade mechanisms for look-ahead bias elimination, transaction cost modelling, and statistical validation. **However, three critical bugs and several methodological limitations were uncovered during this sweep.** Two of the bugs were patched during the validation process, while others have been documented for future remediation.

The system is conditionally cleared for Phase 5 (Integration), provided the remaining limitations are understood by the portfolio management team.

---

## 1. Exchange Calendar & Timing (Suite 1)

**Status:** PASS 🟢 (After Fixes)

We aggressively validated the `MarketCalendar` and `AlphaFactoryEngine` timing logic against the strict temporal hierarchy defined in `docs/event_timing.md`.

*   **Filing Lag (45 Days):** Verified that `Q1 -> +45 cal days` correctly snaps to the *next available NYSE trading day* if the lag lands on a weekend or holiday.
*   **Execution Delay (T+1):** Verified that the system correctly waits until the open of the next trading day (`exec_date_t1`) to execute trades.
*   **Holiday Snapping:** Forward and backward snapping for market holidays (e.g., July 4th, Christmas, New Year) works flawlessly.

---

## 2. Leakage Audit (Suite 2)

**Status:** PASS 🟢 (After Bug Fix)

The `LeakageAuditReport` operates as a hard gate before backtest metrics are computed.

*   **Future Timestamps:** Correctly detects and flags `exec_date` exceeding the maximum available pricing date as an `ERROR`.
*   **Look-ahead Joins:** Correctly detects if `actual_exit_date < exec_date` as an `ERROR`.
*   **Forward Contamination:** Null entry prices after asof-joins are correctly flagged.
*   **Overlapping Labels:**
    *   > [!WARNING]
        > **BUG FOUND & FIXED:** The `check_overlapping_labels` logic was fundamentally broken. It computed `exit_dt = exec_dt` instead of `exit_dt = exec_dt + holding_period_days`. This meant the overlap check would *never* trigger. This has been remediated in `leakage_audit.py`.

---

## 3. Execution Realism (Suite 3)

**Status:** PASS 🟢

*   **T+1 Delay:** Fully enforced.
*   **Transaction Costs:** The `TransactionCostModel` correctly applies 20 bps for Large Cap and 50 bps for Small Cap, plus a non-linear square-root market impact model bounded to 500 bps max.
*   **ADV Cap:** Trades exceeding 5% of ADTV are correctly clipped via `adv_capped`.

---

## 4. Overfitting Diagnostics (Suite 5)

**Status:** PASS 🟢 (After Bug Fix)

*   **Probability of Backtest Overfitting (PBO):** PBO partitioning logic operates correctly, bounding results in `[0, 1]`.
    *   > [!NOTE]
        > **Methodological Limitation:** The PBO implementation uses a simplified OOS Sharpe < 0 proxy instead of true Combinatorially Symmetric Cross-Validation (CSCV) rank-based metrics. This may understate PBO for universally positive-Sharpe datasets.
*   **Deflated Sharpe Ratio (DSR):**
    *   > [!WARNING]
        > **BUG FOUND & FIXED:** `DeflatedSharpeRatio.compute()` was returning a `numpy.bool_` instead of a native Python `bool` for the `is_significant` flag, which breaks downstream JSON serialisation and strict type checks. This was patched.

---

## 5. Portfolio Construction (Suite 8)

**Status:** FAIL / KNOWN ISSUE 🔴

*   **Weights & Turnover:** Weights generally sum to 1.0, and turnover estimates are finite and positive.
*   **Sector Caps:** Sector concentration caps (`max_sector_pct`) are proportionally applied.
*   **Position Caps:**
    *   > [!CAUTION]
        > **CRITICAL BUG EXPOSED:** The `PortfolioConstructor` applies position caps incorrectly when `vol_scalar` > 1. If positions are capped at 5%, but there are only 10 positions in the portfolio, the subsequent `_normalize_weights()` function forces the weights back up to 10% each to maintain full investment.
        > **Current state:** The position cap is *not* guaranteed to be enforced after normalisation. This requires an iterative redistribution algorithm to fix, which was deferred as it constitutes a major feature rebuild.

---

## 6. Drift & Population Stability (Suite 10)

**Status:** PASS 🟢

*   **Population Stability Index (PSI) & KS Tests:** Synthetic validation confirms the detection mechanisms accurately distinguish between stable signals and artificially drifted (shifted) signals.
*   **Signal Decay:** The `SignalDecayAnalyzer` successfully computes Information Coefficient (IC) decay at 5, 20, and 60-day horizons, successfully identifying half-lives.
    *   > [!NOTE]
        > **Methodological Limitation:** IC decay uses an integer scalar approximation for calendar days (`horizon * 365/252`). This creates an error margin of up to 10 days for long horizons.

---

## 7. Data Provenance & Reproducibility (Suites 11 & 12)

**Status:** PASS 🟢

*   **Reproducibility:** Confirmed that identical seeds in the `MonteCarloTester` produce identical bootstrap intervals, hit rates, and p-values.
*   **Coverage Reporting:** `ProvenanceTracker` accurately calculates `coverage_quality` and correctly identifies `stale`, `unmapped`, and `partial` histories.
*   **Survivorship Bias:** Delisted/dead tickers correctly default to -100% returns if their exit pricing is unavailable.

---

## Conclusion

The Andria Phase 4 system exhibits a high degree of quantitative rigor. The implementation of strict leakage auditing, T+1 enforcement, and market calendar awareness elevates it to institutional grade.

**Action Items for Phase 5:**
1. Implement iterative redistribution in `PortfolioConstructor` to ensure `max_position_pct` is strictly obeyed post-normalisation.
2. Upgrade the PBO calculation to Bailey's strict CSCV rank methodology.
3. Replace the scalar calendar-day approximation in `SignalDecayAnalyzer` with rigorous `MarketCalendar` trading-day arithmetic.
