import React, { Suspense } from "react";
import { getSignalsData, getBacktestData } from "@/lib/loaders";
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
    { col: "Conv. Raw", color: "#a855f7", note: "Pre-regime conviction score · compare to RACS to see regime multiplier effect" },
    { col: "AUM Behind", color: "#38bdf8", note: "Total activist capital in this ticker across all buyers" },
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
          <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>· {note}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Signal Quality Strip ───────────────────────────────────────────────────── */
function SignalQualityStrip({
  halfLifeDays,
  peakIc,
  hitRate,
}: {
  halfLifeDays: number;
  peakIc: number;
  hitRate: number;
}) {
  const items = [
    {
      label: "IC Half-Life",
      value: halfLifeDays > 0 ? `${halfLifeDays}d` : "--",
      sub: "Days until signal predictive power halves",
      icon: "⌛",
      color: halfLifeDays >= 60 ? "#10b981" : halfLifeDays >= 30 ? "#f59e0b" : "#ef4444",
      detail: halfLifeDays >= 60 ? "Long-lived" : halfLifeDays >= 30 ? "Medium decay" : "Fast decay",
    },
    {
      label: "Peak IC",
      value: peakIc > 0 ? peakIc.toFixed(3) : "--",
      sub: "Information Coefficient at optimal holding horizon",
      icon: "◎",
      color: peakIc >= 0.05 ? "#10b981" : peakIc >= 0.02 ? "#f59e0b" : "#ef4444",
      detail: peakIc >= 0.05 ? "Strong" : peakIc >= 0.02 ? "Moderate" : "Weak",
    },
    {
      label: "Hit Rate",
      value: hitRate > 0 ? `${(hitRate * 100).toFixed(1)}%` : "--",
      sub: "Fraction of trades that were profitable",
      icon: "✓",
      color: hitRate >= 0.55 ? "#10b981" : hitRate >= 0.48 ? "#f59e0b" : "#ef4444",
      detail: hitRate >= 0.55 ? "Above chance" : hitRate >= 0.48 ? "Near 50/50" : "Below chance",
    },
  ];

  return (
    <div style={{
      borderRadius: 12,
      border: "1px solid rgba(138,43,226,0.15)",
      backgroundColor: "rgba(138,43,226,0.04)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "0.6rem 1.2rem",
        borderBottom: "1px solid rgba(138,43,226,0.12)",
        backgroundColor: "rgba(138,43,226,0.07)",
        display: "flex", alignItems: "center", gap: "0.5rem",
      }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#8a2be2", boxShadow: "0 0 6px #8a2be280" }} />
        <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#c4b5fd" }}>
          Signal Quality Indicators · From Backtest
        </span>
      </div>

      {/* Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
        {items.map(({ label, value, sub, icon, color, detail }, i) => (
          <div key={label} style={{
            padding: "1rem 1.25rem",
            borderRight: i < 2 ? "1px solid rgba(255,255,255,0.05)" : "none",
            display: "flex", flexDirection: "column", gap: "0.3rem",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.15rem" }}>
              <span style={{ fontSize: "0.75rem", color }}>{icon}</span>
              <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                {label}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
              <span style={{ fontSize: "1.9rem", fontWeight: 800, letterSpacing: "-0.04em", color, lineHeight: 1 }}>
                {value}
              </span>
              <span style={{
                fontSize: "0.62rem", fontWeight: 700, padding: "0.1rem 0.45rem",
                borderRadius: 4, backgroundColor: `${color}18`, color,
              }}>
                {detail}
              </span>
            </div>
            <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
              {sub}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── RACS Score Distribution ────────────────────────────────────────────────── */
function ScoreDistribution({ scores }: { scores: number[] }) {
  if (scores.length === 0) return null;

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const median = [...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)];

  // 5 quintile bands
  const range = max - min || 1;
  const bandSize = range / 5;
  const bands = [
    { label: "Q1 (Lowest)", color: "#ef4444", from: min, to: min + bandSize },
    { label: "Q2", color: "#f59e0b", from: min + bandSize, to: min + bandSize * 2 },
    { label: "Q3", color: "#a1a1aa", from: min + bandSize * 2, to: min + bandSize * 3 },
    { label: "Q4", color: "#3b82f6", from: min + bandSize * 3, to: min + bandSize * 4 },
    { label: "Q5 (Strongest)", color: "#10b981", from: min + bandSize * 4, to: max + 0.0001 },
  ];

  const counts = bands.map(b => scores.filter(s => s >= b.from && s < b.to).length);
  const maxCount = Math.max(...counts, 1);

  return (
    <div style={{
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.07)",
      backgroundColor: "rgba(255,255,255,0.02)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "0.6rem 1.2rem",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            RACS Score Distribution · {scores.length} signals
          </span>
        </div>
        <div style={{ display: "flex", gap: "1rem" }}>
          {[
            { label: "Min", value: min.toFixed(4) },
            { label: "Median", value: median.toFixed(4) },
            { label: "Max", value: max.toFixed(4) },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: "flex", gap: "0.35rem", alignItems: "baseline" }}>
              <span style={{ fontSize: "0.6rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, fontFamily: "monospace", color: "var(--text-secondary)" }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Distribution bars */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
        {bands.map(({ label, color }, i) => {
          const count = counts[i];
          const pct = (count / maxCount) * 100;
          const signalPct = ((count / scores.length) * 100).toFixed(0);
          return (
            <div key={label} style={{
              padding: "1rem 0.85rem",
              borderRight: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none",
              display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "center",
            }}>
              {/* Bar */}
              <div style={{ width: "100%", height: 72, display: "flex", alignItems: "flex-end" }}>
                <div style={{
                  width: "100%",
                  height: `${Math.max(pct, 4)}%`,
                  borderRadius: "4px 4px 0 0",
                  backgroundColor: color,
                  opacity: 0.75,
                  transition: "height 0.4s ease",
                  boxShadow: `0 0 8px ${color}40`,
                }} />
              </div>
              {/* Count */}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 800, color, lineHeight: 1 }}>{count}</div>
                <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>{signalPct}%</div>
              </div>
              {/* Label */}
              <div style={{ fontSize: "0.6rem", fontWeight: 600, color: "var(--text-muted)", textAlign: "center", letterSpacing: "0.05em" }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

async function SignalsContent() {
  const [data, backtest] = await Promise.all([getSignalsData(), getBacktestData()]);
  const { signals, total_signals, provenance_quality, validation_passed } = data;
  const { signal_decay, summary: bSummary } = backtest;

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
  const racsScores = signals.map((s) => s.regime_adjusted_racs);

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
                new positions, filtered for low crowding and amplified by the current macro regime.
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

      {/* ── 3. Signal Quality Strip (NEW) ─────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SignalQualityStrip
          halfLifeDays={signal_decay.half_life_days}
          peakIc={signal_decay.peak_ic}
          hitRate={bSummary.hit_rate}
        />
      </RevealContainer>

      {/* ── 4. RACS formula visual ─────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="How Every Score Is Built"
          description="Four evidence sources multiplied together. A stock must score well on ALL four simultaneously; no single factor can compensate for weakness in another."
        />
        <RacsFormulaVisual currentRegime={currentRegime} />
      </RevealContainer>

      {/* ── 5. Score Distribution (NEW) ───────────────────────────────────────── */}
      {racsScores.length > 0 && (
        <RevealContainer threshold={0.1}>
          <SectionHeader
            title="Score Landscape"
            description="Distribution of all displayed RACS scores across five quintile bands. Most signals cluster in lower quintiles; only a handful reach the top tier simultaneously on all four components."
          />
          <ScoreDistribution scores={racsScores} />
        </RevealContainer>
      )}

      {/* ── 6. Signal table ───────────────────────────────────────────────────── */}
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

      {/* ── 7. Distribution by regime ─────────────────────────────────────────── */}
      {Object.keys(byRegime).length > 0 && (
        <RevealContainer threshold={0.15}>
          <SectionHeader
            title="Signals by Macro Regime"
            description="Regime label at the time each signal was generated; baked into the RACS score."
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
