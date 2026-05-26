import React, { Suspense } from "react";
import { getRegimeData } from "@/lib/loaders";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";
import MetricTile from "@/components/MetricTile";
import RegimeChart from "./RegimeChart";
import { REGIME_COLORS, REGIME_LABELS } from "@/lib/taxonomy";

function Skeleton() {
  return <div className="skeleton-shimmer" style={{ width: "100%", height: 500 }} />;
}

async function RegimeContent() {
  const data = await getRegimeData();
  const { current, history, distribution, transition_matrix, total_observations } = data;

  const currentColor = REGIME_COLORS[current.regime_label] ?? "#a1a1aa";
  const currentLabel = REGIME_LABELS[current.regime_label] ?? current.regime_label;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>
      {/* Current regime hero */}
      <RevealContainer threshold={0.1}>
        <GlassCard hierarchy="primary">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "2rem" }}>
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
                Current Macro Regime
              </div>
              <div style={{
                fontSize: "3rem", fontWeight: 700, letterSpacing: "-0.03em",
                color: currentColor,
                marginBottom: "0.5rem",
              }}>
                {currentLabel}
              </div>
              <div style={{ fontSize: "1rem", color: "var(--text-secondary)" }}>
                HMM State {current.regime_id} &nbsp;·&nbsp; {(current.regime_prob * 100).toFixed(0)}% confidence &nbsp;·&nbsp; {current.date}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Quarters Observed</div>
                <div style={{ fontSize: "2rem", fontWeight: 700 }}>{total_observations}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>HMM States</div>
                <div style={{ fontSize: "2rem", fontWeight: 700 }}>4</div>
              </div>
            </div>
          </div>
        </GlassCard>
      </RevealContainer>

      {/* Timeline chart */}
      <RevealContainer threshold={0.1}>
        <GlassCard hierarchy="primary">
          <SectionHeader
            title="Regime Confidence Timeline (2019–2024)"
            description="Gaussian HMM state probability per quarter. Bar height = model confidence; colour = assigned regime. Fed by VIX, yield curve, credit spreads, Fed funds delta, OFR stress index."
          />
          <RegimeChart history={history} />
          {/* Colour legend */}
          <div style={{ display: "flex", gap: "1.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
            {Object.entries(REGIME_COLORS).map(([key, color]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  {REGIME_LABELS[key] ?? key}
                </span>
              </div>
            ))}
          </div>
        </GlassCard>
      </RevealContainer>

      {/* Distribution row */}
      <RevealContainer threshold={0.15}>
        <SectionHeader
          title="Regime Distribution"
          description="Historical frequency of each macro state across the full 24-quarter sample"
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
          {distribution.map((d, i) => {
            const color = REGIME_COLORS[d.regime_label] ?? "#a1a1aa";
            const label = REGIME_LABELS[d.regime_label] ?? d.regime_label;
            return (
              <GlassCard key={d.regime_label} hierarchy="secondary" delayIndex={i}>
                <div style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color, marginBottom: "0.5rem" }}>
                  {label}
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 700 }}>{d.count}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
                  quarters ({(d.pct * 100).toFixed(0)}%)
                </div>
                <div style={{ height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.06)" }}>
                  <div style={{ height: "100%", borderRadius: 2, background: color, width: `${d.pct * 100}%` }} />
                </div>
              </GlassCard>
            );
          })}
        </div>
      </RevealContainer>

      {/* Transition matrix */}
      {transition_matrix?.matrix?.length > 0 && (
        <RevealContainer threshold={0.15}>
          <GlassCard hierarchy="secondary">
            <SectionHeader
              title="State Transition Matrix"
              description="Estimated HMM transition probabilities P(next state | current state). Rows = from, columns = to."
            />
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 480 }}>
                <thead>
                  <tr>
                    <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-secondary)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      From ↓ / To →
                    </th>
                    {transition_matrix.labels.map((l) => (
                      <th key={l} style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: REGIME_COLORS[l] ?? "var(--text-secondary)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                        {REGIME_LABELS[l] ?? l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transition_matrix.matrix.map((row, ri) => (
                    <tr key={ri}>
                      <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.82rem", fontWeight: 600, color: REGIME_COLORS[transition_matrix.labels[ri]] ?? "var(--text-secondary)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        {REGIME_LABELS[transition_matrix.labels[ri]] ?? transition_matrix.labels[ri]}
                      </td>
                      {row.map((v, ci) => (
                        <td key={ci} style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontSize: "0.82rem", fontVariantNumeric: "tabular-nums", color: ri === ci ? "#ffffff" : "var(--text-secondary)", fontWeight: ri === ci ? 700 : 400, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          {(v * 100).toFixed(0)}%
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
