import React, { Suspense } from "react";
import { getValidationData, getBacktestData } from "@/lib/loaders";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";
import { DsrWaterfall, PboGauge, MonteCarloVisual, WalkForwardHeatmap } from "./ValidationCharts";

function Skeleton() {
  return <div className="skeleton-shimmer" style={{ width: "100%", height: 500 }} />;
}

/* ─── Gate check card (enhanced) ────────────────────────────────────────────── */
function GateCheck({ label, passed, detail, value, threshold, icon, description }: {
  label: string; passed: boolean; detail: string;
  value?: number; threshold?: number;
  icon: string; description: string;
}) {
  const color = passed ? "#10b981" : "#ef4444";
  return (
    <div style={{
      borderRadius: 14,
      border: `1px solid ${color}33`,
      backgroundColor: `${color}07`,
      padding: "1.25rem 1.4rem",
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem",
    }}>
      {/* Icon + status row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            backgroundColor: `${color}18`, border: `1px solid ${color}44`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1rem", flexShrink: 0,
          }}>
            {icon}
          </div>
          <div>
            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-primary)" }}>{label}</div>
            <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginTop: "0.05rem" }}>{description}</div>
          </div>
        </div>
        <span style={{
          padding: "0.18rem 0.55rem", borderRadius: 5, fontSize: "0.68rem", fontWeight: 700,
          backgroundColor: `${color}1a`, color,
          border: `1px solid ${color}40`,
          letterSpacing: "0.06em", flexShrink: 0, marginLeft: "0.5rem",
        }}>
          {passed ? "✓ PASS" : "✗ FAIL"}
        </span>
      </div>

      {/* Progress bar for numeric checks */}
      {value !== undefined && threshold !== undefined && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Score</span>
            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Threshold</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.07)", position: "relative" }}>
            {/* Value bar */}
            <div style={{
              height: "100%", borderRadius: 3,
              width: `${Math.min((value / Math.max(threshold, value, 0.001)) * 100, 100)}%`,
              background: color,
              boxShadow: `0 0 8px ${color}50`,
            }} />
            {/* Threshold marker */}
            <div style={{
              position: "absolute", top: -3, bottom: -3,
              left: `${(threshold / Math.max(threshold, value, 0.001)) * 100}%`,
              width: 2, backgroundColor: "rgba(239,68,68,0.7)", borderRadius: 1,
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.3rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, fontFamily: "monospace", color }}>
              {(value * 100).toFixed(1)}%
            </span>
            <span style={{ fontSize: "0.7rem", color: "#ef444488", fontFamily: "monospace" }}>
              {(threshold * 100).toFixed(0)}% limit
            </span>
          </div>
        </div>
      )}

      {/* Detail text */}
      <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>{detail}</p>
    </div>
  );
}

async function ValidationContent() {
  const [val, backtest] = await Promise.all([getValidationData(), getBacktestData()]);
  const { gate_passed, checks, dsr, pbo, monte_carlo } = val;
  const gateColor = gate_passed ? "#10b981" : "#ef4444";
  const allMcSignificant = monte_carlo.bootstrap.significant
    && monte_carlo.randomized_entry.significant
    && monte_carlo.regime_permutation.significant;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>

      {/* ── 0. Hero intro ─────────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.05}>
        <GlassCard hierarchy="primary">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "2rem", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              {/* Label pill */}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
                padding: "0.2rem 0.7rem", borderRadius: 20, marginBottom: "1rem",
                backgroundColor: `${gateColor}12`, border: `1px solid ${gateColor}44`,
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%", backgroundColor: gateColor,
                  boxShadow: `0 0 6px ${gateColor}80`,
                  animation: "pulse-glow 2s ease-in-out infinite",
                }} />
                <span style={{ fontSize: "0.62rem", fontWeight: 700, color: gateColor, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Evaluation Gate · Bailey et al. (2016)
                </span>
              </div>

              <h1 style={{
                fontSize: "clamp(1.5rem, 2.2vw, 2rem)", fontWeight: 800,
                letterSpacing: "-0.04em", lineHeight: 1.15, margin: "0 0 0.7rem",
                background: "linear-gradient(135deg, #ffffff 0%, rgba(196,181,253,0.85) 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>
                Does This Strategy Have<br />a Real Edge, or Just Luck?
              </h1>

              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.65, maxWidth: "50ch", margin: "0 0 1rem" }}>
                Before any signal reaches deployment, it must pass four independent statistical gates.
                Each test addresses a different type of <strong style={{ color: "var(--text-primary)" }}>false discovery risk</strong>:
                from data leakage and overfitting to pure randomness.
                All four must pass simultaneously.
              </p>

              {/* Status summary chips */}
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{
                  padding: "0.25rem 0.8rem", borderRadius: 6, fontSize: "0.75rem", fontWeight: 800,
                  backgroundColor: `${gateColor}18`, color: gateColor,
                  border: `1px solid ${gateColor}44`,
                  letterSpacing: "0.06em",
                }}>
                  Gate {gate_passed ? "PASSED" : "FAILED"}
                </span>
                <span style={{ padding: "0.22rem 0.7rem", borderRadius: 6, fontSize: "0.72rem", fontWeight: 700, backgroundColor: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", border: "1px solid rgba(255,255,255,0.09)" }}>
                  4 / 4 criteria
                </span>
                <span style={{ padding: "0.22rem 0.7rem", borderRadius: 6, fontSize: "0.72rem", fontWeight: 700, backgroundColor: "rgba(138,43,226,0.12)", color: "#c4b5fd", border: "1px solid rgba(138,43,226,0.25)" }}>
                  3 Monte Carlo tests
                </span>
              </div>
            </div>

            {/* Gate status panel */}
            <div style={{
              padding: "1.4rem 1.8rem", borderRadius: 16, flexShrink: 0,
              backgroundColor: `${gateColor}09`, border: `1px solid ${gateColor}33`,
              minWidth: 220, textAlign: "center",
            }}>
              <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                Overall verdict
              </div>
              <div style={{
                fontSize: "3.5rem", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1,
                color: gateColor, marginBottom: "0.5rem",
                textShadow: `0 0 30px ${gateColor}60`,
              }}>
                {gate_passed ? "PASS" : "FAIL"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.75rem" }}>
                {[
                  { label: "Deflated SR", value: dsr.deflated_sharpe.toFixed(3), ok: dsr.is_significant },
                  { label: "PBO Score", value: `${(pbo.score * 100).toFixed(1)}%`, ok: pbo.passed },
                  { label: "Monte Carlo", value: allMcSignificant ? "3 / 3" : "< 3", ok: allMcSignificant },
                ].map(({ label, value, ok }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
                    <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{label}</span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: ok ? "#10b981" : "#ef4444", fontFamily: "monospace" }}>
                      {ok ? "✓" : "✗"} {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </GlassCard>
      </RevealContainer>

      {/* ── 1. Why these tests? explainer strip ────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <div style={{
          borderRadius: 12, border: "1px solid rgba(138,43,226,0.18)",
          backgroundColor: "rgba(138,43,226,0.04)", overflow: "hidden",
        }}>
          <div style={{ padding: "0.65rem 1.2rem", borderBottom: "1px solid rgba(138,43,226,0.12)", backgroundColor: "rgba(138,43,226,0.07)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#8a2be2", boxShadow: "0 0 6px #8a2be280" }} />
            <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#c4b5fd" }}>
              What each test is actually checking
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
            {[
              { icon: "🔍", title: "Leakage Audit", risk: "Data contamination", what: "Checks that no signal uses future information; 45-day 13F lag + T+1 fill delay enforced throughout" },
              { icon: "🧬", title: "Provenance", risk: "Missing data bias", what: "Checks CUSIP→ticker resolution rate. Below 90% means too many signals have no real price data" },
              { icon: "🔁", title: "Reproducibility", risk: "Randomness masquerading as skill", what: "SHA-256 checksums across 3 independent runs confirm the output is deterministic, not stochastic luck" },
              { icon: "📊", title: "PBO", risk: "Backtest overfitting", what: "CSCV measures what fraction of in-sample winners lose out-of-sample; directly quantifies overfitting risk" },
            ].map(({ icon, title, risk, what }, i) => (
              <div key={title} style={{ padding: "1rem 1.1rem", borderRight: i < 3 ? "1px solid rgba(138,43,226,0.1)" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.9rem" }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-primary)" }}>{title}</div>
                    <div style={{ fontSize: "0.6rem", color: "#ef4444aa", fontWeight: 600 }}>Risk: {risk}</div>
                  </div>
                </div>
                <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{what}</p>
              </div>
            ))}
          </div>
        </div>
      </RevealContainer>

      {/* ── 2. Gate checks ─────────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="Gate Conditions"
          description="All four must pass simultaneously. Failure on any single check blocks signal deployment."
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <GateCheck
            label="Leakage Audit"
            passed={checks.leakage_audit.passed}
            detail={checks.leakage_audit.detail}
            icon="🔍"
            description="No lookahead bias in signal construction"
          />
          <GateCheck
            label="Provenance Threshold"
            passed={checks.provenance_threshold.passed}
            detail={checks.provenance_threshold.detail}
            value={checks.provenance_threshold.value}
            threshold={checks.provenance_threshold.threshold}
            icon="🧬"
            description="CUSIP→ticker resolution rate must exceed 90%"
          />
          <GateCheck
            label="Deterministic Reproducibility"
            passed={checks.reproducibility.passed}
            detail={checks.reproducibility.detail}
            icon="🔁"
            description="SHA-256 checksums must match across all runs"
          />
          <GateCheck
            label="Probability of Backtest Overfitting (PBO)"
            passed={checks.pbo_validation.passed}
            detail={checks.pbo_validation.detail}
            value={checks.pbo_validation.value}
            threshold={checks.pbo_validation.threshold}
            icon="📊"
            description="CSCV overfitting score must stay below 40%"
          />
        </div>
      </RevealContainer>

      {/* ── 3. DSR + PBO side-by-side ──────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "1.5rem" }}>

          {/* DSR */}
          <GlassCard hierarchy="primary">
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                  Deflated Sharpe Ratio
                </span>
                <span style={{ fontSize: "0.6rem", padding: "0.1rem 0.4rem", borderRadius: 4, backgroundColor: "rgba(16,185,129,0.12)", color: "#10b981", fontWeight: 700 }}>
                  Bailey & Lopez de Prado (2014)
                </span>
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                The observed Sharpe is a biased statistic when you&apos;ve tested multiple configs.
                DSR applies four simultaneous penalties (multiple testing, skewness, fat tails,
                and serial correlation) to produce a conservative, publication-grade estimate.
                A DSR above 1.0 means the edge survives all adjustments.
              </p>
            </div>

            <DsrWaterfall observed={dsr.observed_sharpe} deflated={dsr.deflated_sharpe} />

            {/* Stats grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginTop: "1.25rem" }}>
              {[
                { label: "n Trials", value: dsr.n_trials, color: "var(--text-secondary)" },
                { label: "Skewness", value: dsr.skewness.toFixed(3), color: "var(--text-secondary)" },
                { label: "Excess Kurtosis", value: dsr.excess_kurtosis.toFixed(3), color: "var(--text-secondary)" },
                { label: "Serial Corr.", value: dsr.serial_correlation.toFixed(3), color: "var(--text-secondary)" },
                { label: "Benchmark SR", value: dsr.benchmark_sharpe.toFixed(3), color: "var(--text-secondary)" },
                { label: "Significant", value: dsr.is_significant ? "YES" : "NO", color: dsr.is_significant ? "#10b981" : "#ef4444" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ padding: "0.65rem 0.75rem", borderRadius: 7, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.2rem" }}>{label}</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color }}>{value}</div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* PBO */}
          <GlassCard hierarchy="primary">
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                  Probability of Backtest Overfitting
                </span>
                <span style={{ fontSize: "0.6rem", padding: "0.1rem 0.4rem", borderRadius: 4, backgroundColor: "rgba(16,185,129,0.12)", color: "#10b981", fontWeight: 700 }}>
                  Bailey et al. (2016)
                </span>
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                CSCV splits the backtest into {pbo.n_partitions} equal partitions and evaluates all{" "}
                {pbo.n_combinations.toLocaleString()} C({pbo.n_partitions},{pbo.n_partitions / 2}) combinations.
                For each, it asks: does the in-sample best strategy also win out-of-sample?
                PBO is the fraction of cases where it does not. Below 40% = acceptable.
              </p>
            </div>

            <PboGauge score={pbo.score} threshold={0.4} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "1rem" }}>
              {[
                { label: "CSCV Partitions", value: pbo.n_partitions },
                { label: "Combinations", value: pbo.n_combinations.toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: "0.65rem 0.75rem", borderRadius: 7, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                  <div style={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.2rem" }}>{label}</div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 700, fontFamily: "monospace" }}>{value}</div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </RevealContainer>

      {/* ── 4. Monte Carlo ─────────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="Monte Carlo Robustness Tests"
          description={`Three independent null hypothesis tests, each with N=${monte_carlo.n_simulations.toLocaleString()} simulations. Each asks a different question: "Could this result have been generated by chance?" All three must return p < 0.05.`}
        />

        {/* Explainer row */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem",
          marginBottom: "1.25rem",
          borderRadius: 10, overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          {[
            { test: "Bootstrap", icon: "🔄", question: "Is the Sharpe stable across trade samples?", how: "Resamples trades with replacement 1,000 times. If the observed Sharpe is in the right tail of the null distribution, timing is not the explanation." },
            { test: "Random Entry", icon: "🎲", question: "Does signal timing actually matter?", how: "Randomises entry dates across 1,000 runs. If the real strategy significantly outperforms, signal timing has genuine predictive value." },
            { test: "Regime Permutation", icon: "🌀", question: "Is the regime multiplier real?", how: "Shuffles regime labels across 1,000 runs. If the real RACS significantly outperforms, the HMM macro signal adds genuine value, not just label noise." },
          ].map(({ test, icon, question, how }, i) => (
            <div key={test} style={{
              padding: "0.9rem 1rem",
              borderRight: i < 2 ? "1px solid rgba(255,255,255,0.06)" : "none",
              backgroundColor: "rgba(255,255,255,0.015)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.4rem" }}>
                <span>{icon}</span>
                <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-primary)" }}>{test}</span>
              </div>
              <div style={{ fontSize: "0.68rem", color: "#c4b5fd", fontStyle: "italic", marginBottom: "0.4rem" }}>{question}</div>
              <p style={{ fontSize: "0.67rem", color: "var(--text-muted)", lineHeight: 1.55, margin: 0 }}>{how}</p>
            </div>
          ))}
        </div>

        {/* Monte Carlo visuals */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <MonteCarloVisual {...monte_carlo.bootstrap} />
          <MonteCarloVisual {...monte_carlo.randomized_entry} />
          <MonteCarloVisual {...monte_carlo.regime_permutation} />
        </div>
      </RevealContainer>

      {/* ── 5. Walk-Forward heatmap ────────────────────────────────────────────── */}
      <RevealContainer threshold={0.15}>
        <GlassCard hierarchy="primary">
          <SectionHeader
            title="Walk-Forward Validation"
            description={`${backtest.walk_forward_folds.length} expanding-window folds (${backtest.summary.test_period}). Each fold trains on all prior data and tests on one unseen year. Hover a cell for details.`}
          />

          {/* What is walk-forward explainer */}
          <div style={{
            borderRadius: 9, border: "1px solid rgba(255,255,255,0.06)",
            backgroundColor: "rgba(255,255,255,0.02)",
            padding: "0.75rem 1rem", marginBottom: "1.5rem",
            display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "flex-start",
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.3rem" }}>
                What is walk-forward validation?
              </div>
              <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                Unlike a single backtest, walk-forward validation tests whether the strategy generalises across time. Each fold uses only data that would have been available on the day; it is a simulation of actually trading year-by-year. Stable Sharpe across all folds is strong evidence against regime-specific overfitting.
              </p>
            </div>
            <div style={{ display: "flex", gap: "1.5rem", flexShrink: 0 }}>
              {[
                { label: "Folds", value: backtest.walk_forward_folds.length },
                { label: "Min Sharpe", value: Math.min(...backtest.walk_forward_folds.map(f => f.sharpe)).toFixed(2) },
                { label: "Max Sharpe", value: Math.max(...backtest.walk_forward_folds.map(f => f.sharpe)).toFixed(2) },
                { label: "Avg Sharpe", value: (backtest.walk_forward_folds.reduce((s, f) => s + f.sharpe, 0) / backtest.walk_forward_folds.length).toFixed(2) },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.15rem" }}>{label}</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)", fontFamily: "monospace" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          <WalkForwardHeatmap folds={backtest.walk_forward_folds} />
        </GlassCard>
      </RevealContainer>

    </div>
  );
}

export default function ValidationPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <ValidationContent />
    </Suspense>
  );
}
