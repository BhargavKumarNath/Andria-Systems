import React, { Suspense } from "react";
import { getSignalsData } from "@/lib/loaders";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";
import MetricTile from "@/components/MetricTile";
import SignalsTable from "./SignalsTable";
import { REGIME_COLORS, REGIME_LABELS } from "@/lib/taxonomy";

function Skeleton() {
  return <div className="skeleton-shimmer" style={{ width: "100%", height: 500 }} />;
}

/* ─── Visual RACS formula ────────────────────────────────────────────────────── */
function RacsFormulaVisual({ currentRegime }: { currentRegime: string }) {
  const terms = [
    {
      formula: "consensus_weight",
      label: "Capital behind it",
      sub: "Share of activist AUM in this ticker",
      color: "#3b82f6",
    },
    {
      formula: "log(activist_buyers + 1.1)",
      label: "Independent agreement",
      sub: "How many managers independently bought",
      color: "#8a2be2",
    },
    {
      formula: "1 − crowding",
      label: "Originality",
      sub: "Low institutional ownership = undiscovered",
      color: "#f59e0b",
    },
    {
      formula: "1 ± regime_weight × prob",
      label: "Macro tailwind",
      sub: `${currentRegime.replace(/_/g, " ")} regime multiplier`,
      color: "#10b981",
    },
  ];

  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
      {terms.map(({ formula, label, sub, color }, i) => (
        <React.Fragment key={formula}>
          {i > 0 && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 0.5rem", color: "var(--text-muted)", fontSize: "1.3rem", fontWeight: 300, flexShrink: 0,
            }}>
              ×
            </div>
          )}
          <div style={{
            flex: 1,
            padding: "1rem 1.1rem",
            borderRadius: 10,
            backgroundColor: `${color}0d`,
            border: `1px solid ${color}28`,
          }}>
            <div style={{ fontFamily: "monospace", fontSize: "0.65rem", color, fontWeight: 700, marginBottom: "0.45rem", wordBreak: "break-all" }}>
              {formula}
            </div>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.2rem" }}>
              {label}
            </div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
              {sub}
            </div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

/* ─── Column key strip ───────────────────────────────────────────────────────── */
function ColumnKey() {
  const cols = [
    { col: "RACS Score", color: "#8a2be2", note: "Final regime-adjusted score · higher = stronger" },
    { col: "Activists", color: "#3b82f6", note: "Independent Conviction Activist / Nimble Trader buyers" },
    { col: "Strong Buys", color: "#10b981", note: "Buyers who entered with > 50% conviction delta" },
    { col: "Crowding", color: "#f59e0b", note: "Green < 20% (undiscovered) · Red > 40% (fragile)" },
  ];
  return (
    <div style={{
      display: "flex", gap: "1.5rem", flexWrap: "wrap",
      padding: "0.6rem 1rem",
      borderRadius: 8,
      backgroundColor: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      marginTop: "0.6rem",
    }}>
      {cols.map(({ col, color, note }) => (
        <div key={col} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{
            fontSize: "0.62rem", fontWeight: 700, fontFamily: "monospace",
            color, letterSpacing: "0.04em",
          }}>
            {col}
          </span>
          <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>— {note}</span>
        </div>
      ))}
    </div>
  );
}

async function SignalsContent() {
  const data = await getSignalsData();
  const { signals, total_signals, provenance_quality, validation_passed } = data;

  /* Derived stats */
  const topSignal = signals[0];
  const avgActivists = signals.length
    ? Math.round(signals.reduce((s, x) => s + x.activist_buyers, 0) / signals.length)
    : 0;
  const avgCrowding = signals.length
    ? signals.reduce((s, x) => s + x.crowding_penalty, 0) / signals.length
    : 0;
  const strongConviction = signals.filter((s) => s.strong_buys >= 5).length;

  const byRegime = signals.reduce<Record<string, number>>((acc, s) => {
    acc[s.regime_label] = (acc[s.regime_label] ?? 0) + 1;
    return acc;
  }, {});

  const currentRegime = topSignal?.regime_label ?? "Goldilocks";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>

      {/* ── 1. Hero ───────────────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.05}>
        <GlassCard hierarchy="primary">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "2rem", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
                padding: "0.2rem 0.7rem", borderRadius: 20, marginBottom: "1rem",
                backgroundColor: "rgba(138,43,226,0.1)", border: "1px solid rgba(138,43,226,0.28)",
              }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#8a2be2" }} />
                <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#c4b5fd", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  RACS Engine · Alpha Signal Output
                </span>
              </div>
              <h1 style={{
                fontSize: "clamp(1.5rem, 2.2vw, 2rem)", fontWeight: 800,
                letterSpacing: "-0.04em", lineHeight: 1.15, margin: "0 0 0.6rem",
                background: "linear-gradient(135deg, #ffffff 0%, rgba(196,181,253,0.85) 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>
                Where Institutional Conviction<br />Is Concentrating Right Now
              </h1>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.65, maxWidth: "46ch", margin: "0 0 1rem" }}>
                Stocks where multiple independent activist hedge funds are simultaneously building
                new positions — filtered for low crowding and amplified by the current macro regime.
              </p>
              {/* Status badges */}
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{
                  padding: "0.22rem 0.7rem", borderRadius: 6, fontSize: "0.72rem", fontWeight: 700,
                  backgroundColor: validation_passed ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.1)",
                  color: validation_passed ? "#10b981" : "#ef4444",
                  border: `1px solid ${validation_passed ? "rgba(16,185,129,0.28)" : "rgba(239,68,68,0.25)"}`,
                }}>
                  EvalGate: {validation_passed ? "PASSED" : "FAILED"}
                </span>
                <span style={{ padding: "0.22rem 0.7rem", borderRadius: 6, fontSize: "0.72rem", fontWeight: 700, backgroundColor: "rgba(138,43,226,0.12)", color: "#c4b5fd", border: "1px solid rgba(138,43,226,0.25)" }}>
                  {(provenance_quality * 100).toFixed(1)}% ticker provenance
                </span>
                <span style={{ padding: "0.22rem 0.7rem", borderRadius: 6, fontSize: "0.72rem", fontWeight: 700, backgroundColor: "rgba(59,130,246,0.1)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.2)" }}>
                  {total_signals.toLocaleString()} pipeline signals scored
                </span>
              </div>
            </div>

            {/* Top signal card */}
            {topSignal && (
              <div style={{
                padding: "1.1rem 1.4rem", borderRadius: 14, flexShrink: 0,
                backgroundColor: "rgba(138,43,226,0.08)", border: "1px solid rgba(138,43,226,0.28)",
                minWidth: 190,
              }}>
                <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
                  #1 signal · {topSignal.quarter.replace("_", " ")}
                </div>
                <div style={{ fontSize: "2.6rem", fontWeight: 900, letterSpacing: "-0.05em", color: "#fff", lineHeight: 1, fontFamily: "monospace", marginBottom: "0.15rem" }}>
                  {topSignal.ticker}
                </div>
                <div style={{ fontSize: "0.72rem", color: "#c4b5fd", marginBottom: "0.8rem", fontFamily: "monospace" }}>
                  RACS {topSignal.regime_adjusted_racs.toFixed(4)}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.28rem" }}>
                  {([
                    ["Activist buyers", topSignal.activist_buyers],
                    ["Strong buys", topSignal.strong_buys],
                    ["Crowding", `${(topSignal.crowding_penalty * 100).toFixed(1)}%`],
                    ["Regime", REGIME_LABELS[topSignal.regime_label] ?? topSignal.regime_label],
                  ] as [string, string | number][]).map(([label, val]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                      <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{label}</span>
                      <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-primary)" }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </GlassCard>
      </RevealContainer>

      {/* ── 2. KPI row ────────────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1.25rem" }}>
          {[
            { label: "Pipeline signals", value: total_signals.toLocaleString(), sub: "Ticker-quarters scored across 12 data quarters", color: "#8a2be2" },
            { label: "Avg activist buyers", value: avgActivists, sub: "Independent managers per displayed signal", color: "#3b82f6" },
            { label: "High-conviction", value: strongConviction, sub: "Signals with 5+ strong-buy managers", color: "#10b981" },
            { label: "Avg crowding", value: `${(avgCrowding * 100).toFixed(1)}%`, sub: "Mean crowding penalty (lower is better)", color: "#f59e0b" },
          ].map(({ label, value, sub, color }) => (
            <GlassCard key={label} hierarchy="secondary">
              <div style={{ fontSize: "2rem", fontWeight: 900, color, letterSpacing: "-0.04em", lineHeight: 1, marginBottom: "0.3rem" }}>{value}</div>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.25rem" }}>{label}</div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", lineHeight: 1.4 }}>{sub}</div>
            </GlassCard>
          ))}
        </div>
      </RevealContainer>

      {/* ── 3. RACS formula visual ─────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="How Every Score Is Built"
          description="Four evidence sources multiplied together. A stock must score well on ALL four simultaneously — no single factor can compensate for weakness in another."
        />
        <RacsFormulaVisual currentRegime={currentRegime} />
      </RevealContainer>

      {/* ── 4. Signal table ───────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title={`Top ${signals.length} RACS Rankings · Most Recent Quarter`}
          description="Click any column header to re-sort. Bars in the RACS Score column are relative to the top-ranked ticker."
        />
        <GlassCard hierarchy="primary">
          <SignalsTable signals={signals} />
        </GlassCard>
        <ColumnKey />
      </RevealContainer>

      {/* ── 5. Distribution by regime ─────────────────────────────────────────── */}
      {Object.keys(byRegime).length > 0 && (
        <RevealContainer threshold={0.15}>
          <SectionHeader
            title="Signals by Macro Regime"
            description="Regime label at the time each signal was generated — baked into the RACS score."
          />
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.max(Object.keys(byRegime).length, 1)}, 1fr)`,
            gap: "1rem",
          }}>
            {Object.entries(byRegime).map(([regime, count], i) => {
              const color = REGIME_COLORS[regime] ?? "#a1a1aa";
              const label = REGIME_LABELS[regime] ?? regime.replace(/_/g, " ");
              return (
                <GlassCard key={regime} hierarchy="secondary" delayIndex={i}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: color }} />
                    <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color }}>
                      {label}
                    </span>
                  </div>
                  <div style={{ fontSize: "2rem", fontWeight: 900, color, letterSpacing: "-0.04em", marginBottom: "0.15rem" }}>{count}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                    signals · {((count / signals.length) * 100).toFixed(0)}%
                  </div>
                  <div style={{ height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.06)" }}>
                    <div style={{ height: "100%", borderRadius: 2, background: color, width: `${(count / signals.length) * 100}%` }} />
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </RevealContainer>
      )}

    </div>
  );
}

export default function SignalsPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <SignalsContent />
    </Suspense>
  );
}
