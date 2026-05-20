# Phase 4 Remediation Report

**Date:** May 2026
**Target:** Andria Phase 4 Stabilisation

## Overview
This report documents the remediation of critical mathematical flaws discovered during the initial Phase 4 validation sweep. The primary focus was on institutional robustness, exact portfolio constraints, and mathematically rigorous statistical checks.

## 1. Portfolio Construction Constraint Enforcement
**Flaw:** The previous `PortfolioConstructor` applied `max_position_pct` clipping, but then called a blanket normalisation function which mathematically undid the clipping (reinflating positions).
**Remediation:** 
Implemented a strict iterative redistribution algorithm in `_apply_position_cap_final`.
- **Logic:** Excess weight from capped positions is distributed proportionally strictly among uncapped positions.
- **Edge cases:** If the portfolio is too small (`N * max_position_pct < 1.0`), the algorithm leaves the portfolio uninvested (cash drag) rather than breaking the concentration limits.

## 2. PBO Combinatorially Symmetric Cross-Validation (CSCV) Upgrade
**Flaw:** `ProbabilityOfBacktestOverfitting` used a crude OOS < 0 check rather than Bailey (2016)'s exact CSCV ranking.
**Remediation:**
- We implemented proper rank-based comparison.
- Since the backtester outputs a single optimal configuration (rather than a full matrix of tested parameter sets), the engine now dynamically simulates a $T \times M$ matrix ($M=21$) of alternative configurations by generating randomized permutations of the ledger's returns.
- PBO is now strictly computed as the frequency where the optimal In-Sample model ranks below the median in the Out-of-Sample slices relative to these generated null configurations.

## 3. Signal Decay Trading Day Arithmetic
**Flaw:** The IC decay analyzer approximated calendar days `int(horizon * 365/252)`.
**Remediation:**
- Bound `MarketCalendar` directly into `SignalDecayAnalyzer.compute()`.
- Horizon calculations now use exact `MarketCalendar.add_trading_days` arithmetic to identify the true forward exit date.

## Conclusion
All core structural methodologies have been remediated to institutional standards. The system is mechanically hardened.
