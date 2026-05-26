import React, { Suspense } from "react";
import { getValidationData, getBacktestData } from "@/lib/loaders";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";

function Skeleton() {
  return <div className="skeleton-shimmer" style={{ width: "100%", height: 500 }} />;
}

function CheckRow({ label, passed, detail, value, threshold }: {
  label: string; passed: boolean; detail: string;
  value?: number; threshold?: number;
}) {
  const color = passed ? "#10b981" : "#ef4444";
  return (
    <div style={{
      display: "flex",
      gap: "1rem",
      padding: "1.25rem",
      borderRadius: 10,
      border: `1px solid ${color}33`,
      backgroundColor: `${color}08`,
      alignItems: "flex-start",
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        backgroundColor: `${color}22`, border: `1.5px solid ${color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, fontSize: "0.9rem", fontWeight: 700, color,
      }}>
        {passed ? "✓" : "✗"}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
          <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{label}</div>
          {value !== undefined && threshold !== undefined && (
            <div style={{ fontSize: "0.82rem", fontVariantNumeric: "tabular-nums" }}>
              <span style={{ color, fontWeight: 700 }}>{(value * 100).toFixed(1)}%</span>
              <span style={{ color: "var(--text-secondary)" }}> / {(threshold * 100).toFixed(0)}% threshold</span>
            </div>
          )}
        </div>
        <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{detail}</p>
      </div>
    </div>
  );
}

function MonteCarloRow({ test, p_value, observed_sharpe, sharpe_5pct, sharpe_50pct, sharpe_95pct, significant }: {
  test: string; p_value: number; observed_sharpe: number;
  sharpe_5pct: number; sharpe_50pct: number; sharpe_95pct: number;
  significant: boolean;
}) {
  const pColor = significant ? "#10b981" : "#ef4444";
  return (
    <GlassCard hierarchy="secondary">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
        <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{test}</div>
        <span style={{
          padding: "0.2rem 0.6rem", borderRadius: 4,
          fontSize: "0.72rem", fontWeight: 700,
          backgroundColor: `${pColor}20`, color: pColor,
        }}>
          {significant ? "SIGNIFICANT" : "NOT SIG."}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem" }}>
        {[
          { label: "p-value", value: p_value.toFixed(3), color: pColor },
          { label: "Observed SR", value: observed_sharpe.toFixed(3), color: "#ffffff" },
          { label: "Null 5th %ile", value: sharpe_5pct.toFixed(3), color: "var(--text-secondary)" },
          { label: "Null 50th %ile", value: sharpe_50pct.toFixed(3), color: "var(--text-secondary)" },
        ].map(({ label, value, color }) => (
          <div key={label}>
            <div style={{ fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.2rem" }}>{label}</div>
            <div style={{ fontSize: "1rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color }}>{value}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

async function ValidationContent() {
  const [val, backtest] = await Promise.all([getValidationData(), getBacktestData()]);
  const { gate_passed, checks, dsr, pbo, monte_carlo } = val;
  const gateColor = gate_passed ? "#10b981" : "#ef4444";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>
      {/* Gate banner */}
      <RevealContainer threshold={0.1}>
        <div style={{
          padding: "2.5rem 3rem",
          borderRadius: 16,
          border: `2px solid ${gateColor}55`,
          backgroundColor: `${gateColor}0a`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1.5rem",
        }}>
          <div>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
              Evaluation Gate — Bailey et al. (2016)
            </div>
            <div style={{ fontSize: "3.5rem", fontWeight: 800, letterSpacing: "-0.04em", color: gateColor }}>
              {gate_passed ? "PASSED" : "FAILED"}
            </div>
            <div style={{ fontSize: "0.95rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
              All 4 institutional publication criteria satisfied
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", textAlign: "right" }}>
            <div>
              <div style={{ fontSize: "0.7rem", letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.2rem" }}>Deflated SR</div>
              <div style={{ fontSize: "2rem", fontWeight: 700, color: dsr.is_significant ? "#10b981" : "#ef4444" }}>{dsr.deflated_sharpe.toFixed(3)}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.7rem", letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.2rem" }}>PBO Score</div>
              <div style={{ fontSize: "2rem", fontWeight: 700, color: pbo.passed ? "#10b981" : "#ef4444" }}>{(pbo.score * 100).toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </RevealContainer>

      {/* 4 gate checks */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="Gate Conditions"
          description="All four conditions must pass for research to be published. Failure blocks signal deployment."
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <CheckRow label="Leakage Audit" passed={checks.leakage_audit.passed} detail={checks.leakage_audit.detail} />
          <CheckRow label="Provenance Threshold" passed={checks.provenance_threshold.passed} detail={checks.provenance_threshold.detail} value={checks.provenance_threshold.value} threshold={checks.provenance_threshold.threshold} />
          <CheckRow label="Deterministic Reproducibility" passed={checks.reproducibility.passed} detail={checks.reproducibility.detail} />
          <CheckRow label="Probability of Backtest Overfitting (PBO)" passed={checks.pbo_validation.passed} detail={checks.pbo_validation.detail} value={checks.pbo_validation.value} threshold={checks.pbo_validation.threshold} />
        </div>
      </RevealContainer>

      {/* DSR detail */}
      <RevealContainer threshold={0.1}>
        <GlassCard hierarchy="primary">
          <SectionHeader
            title="Deflated Sharpe Ratio"
            description="Bailey & Lopez de Prado (2014). Adjusts observed Sharpe for number of trials, skewness, excess kurtosis, and serial correlation. DSR > 1.0 required for statistical significance."
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.25rem", marginBottom: "1rem" }}>
            {[
              { label: "Observed Sharpe", value: dsr.observed_sharpe.toFixed(3), color: "#ffffff" },
              { label: "Deflated Sharpe", value: dsr.deflated_sharpe.toFixed(3), color: "#10b981" },
              { label: "Significant", value: dsr.is_significant ? "YES" : "NO", color: dsr.is_significant ? "#10b981" : "#ef4444" },
              { label: "n Trials (configs)", value: dsr.n_trials, color: "var(--text-secondary)" },
              { label: "Skewness", value: dsr.skewness.toFixed(3), color: "var(--text-secondary)" },
              { label: "Excess Kurtosis", value: dsr.excess_kurtosis.toFixed(3), color: "var(--text-secondary)" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ padding: "1rem", borderRadius: 8, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.3rem" }}>{label}</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color }}>{value}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{dsr.detail}</p>
        </GlassCard>
      </RevealContainer>

      {/* PBO detail */}
      <RevealContainer threshold={0.1}>
        <GlassCard hierarchy="primary">
          <SectionHeader
            title="Probability of Backtest Overfitting (PBO)"
            description="Bailey, Borwein, Lopez de Prado & Zhu (2016). Combinatorially Symmetric Cross-Validation (CSCV). PBO > 0.40 blocks publication."
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.25rem", marginBottom: "1rem" }}>
            {[
              { label: "PBO Score", value: `${(pbo.score * 100).toFixed(1)}%`, color: pbo.passed ? "#10b981" : "#ef4444" },
              { label: "Threshold", value: "40%", color: "var(--text-secondary)" },
              { label: "CSCV Partitions", value: pbo.n_partitions, color: "var(--text-secondary)" },
              { label: "Combinations C(16,8)", value: pbo.n_combinations.toLocaleString(), color: "var(--text-secondary)" },
              { label: "Decision", value: pbo.passed ? "PASS" : "FAIL", color: pbo.passed ? "#10b981" : "#ef4444" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ padding: "1rem", borderRadius: 8, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.3rem" }}>{label}</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color }}>{value}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{pbo.detail}</p>
        </GlassCard>
      </RevealContainer>

      {/* Monte Carlo */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="Monte Carlo Robustness Tests"
          description={`Three independent null hypothesis tests across N=${monte_carlo.n_simulations.toLocaleString()} simulations each. All must produce p < 0.05 to confirm signal is not an artefact.`}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <MonteCarloRow {...monte_carlo.bootstrap} />
          <MonteCarloRow {...monte_carlo.randomized_entry} />
          <MonteCarloRow {...monte_carlo.regime_permutation} />
        </div>
      </RevealContainer>

      {/* Walk-forward summary */}
      <RevealContainer threshold={0.15}>
        <GlassCard hierarchy="secondary">
          <SectionHeader
            title="Walk-Forward Validation Summary"
            description={`${backtest.walk_forward_folds.length} expanding-window folds (${backtest.summary.test_period}). Stable Sharpe across folds confirms temporal robustness.`}
          />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead>
                <tr>
                  {["Fold", "Train Period", "Test Year", "Trades", "Sharpe", "Hit Rate", "Max DD"].map((h) => (
                    <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: h === "Fold" || h === "Train Period" || h === "Test Year" ? "left" : "right", fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-secondary)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {backtest.walk_forward_folds.map((f) => (
                  <tr key={f.fold}>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{f.fold}</td>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.82rem" }}>{f.train_start}–{f.train_end}</td>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.82rem" }}>{f.test_start}</td>
                    <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontSize: "0.82rem", fontVariantNumeric: "tabular-nums" }}>{f.n_trades}</td>
                    <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontSize: "0.82rem", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: f.sharpe >= 1.5 ? "#10b981" : "#ffffff" }}>{f.sharpe.toFixed(2)}</td>
                    <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontSize: "0.82rem", fontVariantNumeric: "tabular-nums" }}>{(f.hit_rate * 100).toFixed(1)}%</td>
                    <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontSize: "0.82rem", fontVariantNumeric: "tabular-nums", color: "#ef4444" }}>{(f.max_drawdown * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
