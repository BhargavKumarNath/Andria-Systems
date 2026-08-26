import React, { Suspense } from "react";
import { getRegimeData } from "@/lib/loaders";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";
import RegimeChart from "./RegimeChart";
import TransitionHeatmap from "./TransitionHeatmap";
import RegimeDistributionBar from "./RegimeDistributionBar";
import { REGIME_COLORS, REGIME_LABELS } from "@/lib/taxonomy";

function Skeleton() {
  return <div className="skeleton-shimmer" style={{ width: "100%", height: 500 }} />;
}

/* ─── Compact chip ───────────────────────────────────────────────────────────── */
function Chip({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      padding: "0.2rem 0.55rem", borderRadius: 4,
      fontSize: "0.68rem", fontWeight: 600, fontFamily: "monospace",
      backgroundColor: `${color}15`, color,
      border: `1px solid ${color}28`,
      whiteSpace: "nowrap",
    }}>
      {text}
    </span>
  );
}

/* ─── Regime card data ───────────────────────────────────────────────────────── */
const REGIME_META: Record<string, {
  multiplier: string;
  positive: boolean;
  chips: string[];
}> = {
  Goldilocks: {
    multiplier: "+20% RACS",
    positive: true,
    chips: ["VIX < 18", "Spreads tight", "Fed on hold / cutting", "Equity rally", "Activists succeed"],
  },
  Recovery: {
    multiplier: "+10% RACS",
    positive: true,
    chips: ["VIX falling 25→18", "Fiscal stimulus", "Post-drawdown bounce", "Value leads", "Cyclicals outperform"],
  },
  Rate_Shock: {
    multiplier: "−15% RACS",
    positive: false,
    chips: ["Fed hiking 50-75bp/meeting", "2Y > 10Y (inverted)", "VIX 20-30", "Growth equities -40-70%", "Crowding noise elevated"],
  },
  Recession_Fear: {
    multiplier: "−25% RACS",
    positive: false,
    chips: ["OFR FSI spiked", "HY spreads > 600bp", "VIX > 30", "Systematic deleveraging", "Redemptions dominate flow"],
  },
};

async function RegimeContent() {
  const data = await getRegimeData();
  const { current, history, distribution, transition_matrix, total_observations } = data;

  const currentColor = REGIME_COLORS[current.regime_label] ?? "#a1a1aa";
  const currentLabel = REGIME_LABELS[current.regime_label] ?? current.regime_label;
  const currentMeta = REGIME_META[current.regime_label];

  /* Derived stats */
  const avgPersistence = transition_matrix?.matrix?.length
    ? transition_matrix.matrix.reduce((sum, row, i) => sum + row[i], 0) / transition_matrix.matrix.length
    : null;

  const sortedByCount = [...distribution].sort((a, b) => b.count - a.count);
  const dominant = sortedByCount[0];

  /* Transition matrix insight chips — derived from the real matrix, not hardcoded */
  type PersistenceStat = { label: string; pct: number };
  type EscapeStat = { from: string; to: string; pct: number };

  function computeTransitionStats(tm: typeof transition_matrix): {
    mostPersistent: PersistenceStat | null;
    fastestResolving: PersistenceStat | null;
    mostLikelyEscape: EscapeStat | null;
  } {
    if (!tm?.matrix?.length) return { mostPersistent: null, fastestResolving: null, mostLikelyEscape: null };
    const { labels, matrix } = tm;
    let mostPersistent: PersistenceStat | null = null;
    let fastestResolving: PersistenceStat | null = null;
    let mostLikelyEscape: EscapeStat | null = null;
    for (let i = 0; i < matrix.length; i++) {
      const persistence = matrix[i][i];
      if (!mostPersistent || persistence > mostPersistent.pct) mostPersistent = { label: labels[i], pct: persistence };
      if (!fastestResolving || persistence < fastestResolving.pct) fastestResolving = { label: labels[i], pct: persistence };
      for (let j = 0; j < matrix[i].length; j++) {
        if (i === j) continue;
        const p = matrix[i][j];
        if (!mostLikelyEscape || p > mostLikelyEscape.pct) mostLikelyEscape = { from: labels[i], to: labels[j], pct: p };
      }
    }
    return { mostPersistent, fastestResolving, mostLikelyEscape };
  }

  const { mostPersistent, fastestResolving, mostLikelyEscape } = computeTransitionStats(transition_matrix);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>

      {/* ── 1. Hero ───────────────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.05}>
        <GlassCard hierarchy="primary">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "2rem", flexWrap: "wrap" }}>

            {/* Left: current regime */}
            <div>
              <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                Current Macro Regime · {current.date}
              </div>
              <div style={{ fontSize: "clamp(2.2rem, 3.5vw, 3rem)", fontWeight: 900, letterSpacing: "-0.04em", color: currentColor, marginBottom: "0.35rem", lineHeight: 1 }}>
                {currentLabel}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.85rem" }}>
                <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                  {(current.regime_prob * 100).toFixed(0)}% HMM confidence
                </span>
                {currentMeta && (
                  <div style={{
                    padding: "0.22rem 0.75rem", borderRadius: 6,
                    fontSize: "0.75rem", fontWeight: 700,
                    backgroundColor: currentMeta.positive ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.1)",
                    color: currentMeta.positive ? "#10b981" : "#ef4444",
                    border: `1px solid ${currentMeta.positive ? "rgba(16,185,129,0.28)" : "rgba(239,68,68,0.25)"}`,
                  }}>
                    RACS signal: {currentMeta.multiplier}
                  </div>
                )}
              </div>
              {/* HMM inputs */}
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {["VIX", "Yield curve slope (10Y-2Y)", "HY credit spreads", "Fed funds delta", "OFR stress index"].map((f) => (
                  <Chip key={f} text={f} color="#8a2be2" />
                ))}
              </div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "0.45rem" }}>
                Gaussian HMM inputs · 4 latent states · trained on {total_observations} quarters
              </div>
            </div>

            {/* Right: 3 quick stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: "1.5rem", alignItems: "start" }}>
              {[
                {
                  value: total_observations,
                  label: "Quarters",
                  sub: "training data",
                  color: "#8a2be2",
                },
                {
                  value: `${dominant.count}/${total_observations}`,
                  label: REGIME_LABELS[dominant.regime_label] ?? dominant.regime_label,
                  sub: "most frequent",
                  color: REGIME_COLORS[dominant.regime_label] ?? "#a1a1aa",
                },
                {
                  value: avgPersistence != null ? `${(avgPersistence * 100).toFixed(0)}%` : "--",
                  label: "Avg persistence",
                  sub: "per quarter",
                  color: "#10b981",
                },
              ].map(({ value, label, sub, color }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.8rem", fontWeight: 900, color, letterSpacing: "-0.04em", lineHeight: 1 }}>
                    {value}
                  </div>
                  <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "0.25rem" }}>{label}</div>
                  <div style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </RevealContainer>

      {/* ── 2. Four regime cards: compact chips only ───────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="The Four Macro Regimes"
          description="Each regime shifts the RACS multiplier applied to every signal. The HMM detects which state is active from macro feature inputs."
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
          {Object.entries(REGIME_META).map(([key, meta], i) => {
            const color = REGIME_COLORS[key] ?? "#a1a1aa";
            const label = REGIME_LABELS[key] ?? key;
            const dist = distribution.find((d) => d.regime_label === key);
            const isCurrent = key === current.regime_label;

            return (
              <GlassCard key={key} hierarchy={isCurrent ? "primary" : "secondary"} delayIndex={i}>
                {/* Header row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: "50%",
                      backgroundColor: color,
                      boxShadow: isCurrent ? `0 0 10px ${color}` : "none",
                    }} />
                    <span style={{ fontWeight: 800, fontSize: "1rem", color: isCurrent ? color : "var(--text-primary)" }}>
                      {label}
                    </span>
                    {isCurrent && (
                      <span style={{
                        fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.1em",
                        color, border: `1px solid ${color}50`,
                        padding: "0.1rem 0.35rem", borderRadius: 3,
                      }}>
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div style={{
                    padding: "0.2rem 0.6rem", borderRadius: 5,
                    fontSize: "0.72rem", fontWeight: 800,
                    backgroundColor: meta.positive ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.1)",
                    color: meta.positive ? "#10b981" : "#ef4444",
                    border: `1px solid ${meta.positive ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.2)"}`,
                  }}>
                    {meta.multiplier}
                  </div>
                </div>

                {/* Condition chips */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.75rem" }}>
                  {meta.chips.map((chip) => (
                    <Chip key={chip} text={chip} color={color} />
                  ))}
                </div>

                {/* Distribution bar */}
                {dist && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                      <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>Historical frequency</span>
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, color }}>
                        {dist.count} qtrs · {(dist.pct * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.06)" }}>
                      <div style={{
                        height: "100%", borderRadius: 2, background: color,
                        width: `${dist.pct * 100}%`, transition: "width 0.5s ease",
                      }} />
                    </div>
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      </RevealContainer>

      {/* ── 3. Regime timeline with event markers ─────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="Regime Confidence Timeline  2019-2024"
          description="Bar height = HMM confidence. Colour = assigned regime. Dashed verticals = key macro events."
        />
        <GlassCard hierarchy="primary">
          <RegimeChart history={history} />
          {/* Legend */}
          <div style={{ display: "flex", gap: "1.25rem", marginTop: "0.85rem", flexWrap: "wrap", alignItems: "center" }}>
            {Object.entries(REGIME_COLORS).map(([key, color]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                  {REGIME_LABELS[key] ?? key}
                </span>
              </div>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", gap: "1rem" }}>
              {[
                { label: "COVID crash", color: "#ef4444" },
                { label: "Fed hike cycle", color: "#f59e0b" },
                { label: "SVB collapse", color: "#ef4444" },
                { label: "Goldilocks restored", color: "#10b981" },
              ].map(({ label, color }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <div style={{ width: 14, height: 0, borderTop: `2px dashed ${color}` }} />
                  <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </RevealContainer>

      {/* ── 4. Distribution stacked bar ───────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="24-Quarter Regime Distribution"
          description="Time spent in each state across the full training window."
        />
        <GlassCard hierarchy="secondary">
          <RegimeDistributionBar distribution={distribution} />

          {/* Per-regime stat row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem" }}>
            {distribution.map((d) => {
              const color = REGIME_COLORS[d.regime_label] ?? "#a1a1aa";
              const label = REGIME_LABELS[d.regime_label] ?? d.regime_label;
              const meta = REGIME_META[d.regime_label];
              const isCurrent = d.regime_label === current.regime_label;
              return (
                <div key={d.regime_label} style={{
                  padding: "0.65rem 0.8rem", borderRadius: 8,
                  border: `1px solid ${isCurrent ? color + "45" : color + "18"}`,
                  backgroundColor: `${color}${isCurrent ? "0e" : "06"}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: "0.3rem" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: color }} />
                    <span style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color }}>{label}</span>
                  </div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 900, color, letterSpacing: "-0.03em", lineHeight: 1 }}>
                    {d.count}
                  </div>
                  <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
                    quarters · {(d.pct * 100).toFixed(0)}%
                  </div>
                  {meta && (
                    <span style={{
                      fontSize: "0.62rem", fontWeight: 700,
                      color: meta.positive ? "#10b981" : "#ef4444",
                    }}>
                      {meta.multiplier}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </GlassCard>
      </RevealContainer>

      {/* ── 5. Transition matrix heatmap ──────────────────────────────────────── */}
      {(transition_matrix?.matrix?.length ?? 0) > 0 && (
        <RevealContainer threshold={0.15}>
          <SectionHeader
            title="State Transition Matrix"
            description="P(next quarter regime | current regime). Colour intensity = probability. Diagonal = self-persistence."
          />
          <GlassCard hierarchy="secondary">
            {/* Key insight chips */}
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
              {[
                {
                  label: "Most persistent",
                  value: mostPersistent ? `${REGIME_LABELS[mostPersistent.label] ?? mostPersistent.label} ${(mostPersistent.pct * 100).toFixed(0)}%` : "not available",
                  color: mostPersistent ? REGIME_COLORS[mostPersistent.label] ?? "#a1a1aa" : "#a1a1aa",
                },
                {
                  label: "Fastest-resolving",
                  value: fastestResolving ? `${REGIME_LABELS[fastestResolving.label] ?? fastestResolving.label} ${(fastestResolving.pct * 100).toFixed(0)}%` : "not available",
                  color: fastestResolving ? REGIME_COLORS[fastestResolving.label] ?? "#a1a1aa" : "#a1a1aa",
                },
                { label: "Avg persistence", value: `${avgPersistence != null ? (avgPersistence * 100).toFixed(0) : "--"}%`, color: "#8a2be2" },
                {
                  label: "Most likely escape",
                  value: mostLikelyEscape ? `${REGIME_LABELS[mostLikelyEscape.from] ?? mostLikelyEscape.from} → ${REGIME_LABELS[mostLikelyEscape.to] ?? mostLikelyEscape.to} ${(mostLikelyEscape.pct * 100).toFixed(0)}%` : "not available",
                  color: mostLikelyEscape ? REGIME_COLORS[mostLikelyEscape.to] ?? "#a1a1aa" : "#a1a1aa",
                },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  padding: "0.35rem 0.85rem", borderRadius: 6,
                  backgroundColor: `${color}10`, border: `1px solid ${color}25`,
                }}>
                  <span style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>{label}: </span>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color }}>{value}</span>
                </div>
              ))}
            </div>

            <TransitionHeatmap
              labels={transition_matrix?.labels ?? []}
              matrix={transition_matrix?.matrix ?? []}
            />
          </GlassCard>
        </RevealContainer>
      )}

    </div>
  );
}

export default function RegimePage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <RegimeContent />
    </Suspense>
  );
}
