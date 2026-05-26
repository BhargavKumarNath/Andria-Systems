import React, { Suspense } from "react";
import { getRegimeData } from "@/lib/loaders";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";
import RegimeChart from "./RegimeChart";
import { REGIME_COLORS, REGIME_LABELS } from "@/lib/taxonomy";

function Skeleton() {
  return <div className="skeleton-shimmer" style={{ width: "100%", height: 500 }} />;
}

/* ─── Rich detail for each regime ───────────────────────────────────────────── */
const REGIME_DETAIL: Record<string, {
  conditions: string;
  equityEnvironment: string;
  racsEffect: string;
  multiplier: string;
  multiplierPositive: boolean;
  historicalExamples: string;
}> = {
  Goldilocks: {
    conditions: "Low and falling volatility (VIX < 18), tight credit spreads, a positively-sloped yield curve, and a Federal Reserve that is on hold or gently easing. GDP is expanding, corporate earnings are beating estimates, and there are no major macro shocks on the horizon.",
    equityEnvironment: "Risk assets broadly outperform. Small and mid-cap equities lead. Activist campaigns succeed at above-average rates because boards are more receptive during benign conditions. Shareholder proposals pass at higher frequency.",
    racsEffect: "RACS scores are amplified in Goldilocks. Activist conviction signals carry full weight because forced-selling noise is minimal -- institutional flows are driven by genuine fundamental views rather than liquidity pressure.",
    multiplier: "+20% signal amplification",
    multiplierPositive: true,
    historicalExamples: "2019 (pre-COVID), late 2021 (post-Delta recovery), 2023 Q4 to present. S&P 500 typically in the 90th+ performance percentile during these windows.",
  },
  Recovery: {
    conditions: "VIX declining from elevated levels (25-35 range falling toward 18). Credit spreads tightening. The Fed is pausing or pivoting from a tightening cycle. GDP growth resuming after a contraction. Fiscal stimulus often present. The regime typically follows Recession Fear.",
    equityEnvironment: "Strong mean-reversion dynamics. Beaten-down sectors (Financials, Industrials, Consumer Discretionary) outperform. Activist managers target deep-value names that underperformed during the stress episode. High dispersion between winners and losers.",
    racsEffect: "RACS scores are modestly amplified. Recovery regimes create high-conviction opportunities for activists who moved early into distressed names. The log(activist_buyers) term is particularly informative during this phase as early-movers with high conviction are separating from reactive buyers.",
    multiplier: "+10% signal amplification",
    multiplierPositive: true,
    historicalExamples: "2020 Q4 to 2021 (post-COVID rebound), 2023 Q2-Q3 (post-SVB regional bank stress). Characterised by sharp rotations into cyclicals and high-yield credit tightening.",
  },
  Rate_Shock: {
    conditions: "Federal Reserve in active aggressive hiking cycle. VIX elevated (20-30). Yield curve inverting (2Y > 10Y). Inflation running significantly above target. Credit spreads widening moderately. Duration-sensitive assets (growth equities, IG bonds, REITs) under severe pressure.",
    equityEnvironment: "Growth and technology equities sell off sharply as discount rates rise. Value and energy outperform. Activist campaigns face headwinds -- boards are preoccupied with refinancing risk and credit access. Forced deleveraging by rate-sensitive hedge funds creates technical selling pressure that obscures fundamental signals.",
    racsEffect: "RACS scores are discounted in Rate Shock. Crowding penalty is elevated because macro tourists and rate-traders pile into the same short-duration, commodity-linked trades simultaneously. The consensus_weight term inflates artificially, triggering the (1 - crowding) penalty.",
    multiplier: "-15% signal discount",
    multiplierPositive: false,
    historicalExamples: "2022 Q1-Q4 (Fed raised 425bp in 12 months). Worst calendar year for 60/40 portfolios since 1937. High-growth equities lost 60-80% peak-to-trough.",
  },
  Recession_Fear: {
    conditions: "OFR Financial Stress Index spiking. Credit spreads blowing out (HY OAS > 600bp). VIX above 30. GDP contracting or widely expected to contract. Systematic deleveraging by multi-strategy funds and risk-parity strategies. Capital preservation dominates over alpha generation.",
    equityEnvironment: "Broad equity decline. Defensive sectors (Utilities, Consumer Staples, Healthcare) relatively outperform but still fall. Activist campaigns are largely abandoned or put on hold. Institutional managers reduce gross exposure -- 13F filings during these quarters show widespread position reduction rather than conviction building.",
    racsEffect: "RACS scores are most heavily penalised in Recession Fear. Even genuinely high-conviction activist positions are buried under redemption-driven selling. The platform applies its maximum crowding penalty and minimum regime multiplier. Signals during this phase should be treated as directional rather than magnitude-precise.",
    multiplier: "-25% signal discount",
    multiplierPositive: false,
    historicalExamples: "2020 Q2 (COVID-19 crash, VIX peaked at 82.69), 2023 Q1 (SVB collapse, First Republic, Signature Bank -- OFR FSI spiked to 2.3 standard deviations).",
  },
};

/* ─── Historical event annotations ──────────────────────────────────────────── */
const REGIME_EVENTS = [
  { date: "2020 Q2", label: "COVID-19 crash", regime: "Recession_Fear", detail: "VIX peaked at 82.69. Fed emergency cut to 0%. $2.2T CARES Act." },
  { date: "2020 Q4", label: "Vaccine rally", regime: "Recovery", detail: "Pfizer/Moderna EUA. S&P 500 +22.3% in Q4. Rotation into cyclicals." },
  { date: "2022 Q1", label: "Fed hike cycle begins", regime: "Rate_Shock", detail: "First hike March 2022. 425bp of cumulative tightening by year-end." },
  { date: "2023 Q1", label: "SVB collapse", regime: "Recession_Fear", detail: "Silicon Valley Bank failed Mar 10. First Republic rescued. OFR FSI spiked." },
  { date: "2023 Q2", label: "Soft landing narrative", regime: "Recovery", detail: "Inflation fell without recession. AI boom. Nasdaq +42% in 2023." },
  { date: "2024 Q1", label: "Return to Goldilocks", regime: "Goldilocks", detail: "Fed pause. Earnings beats. VIX below 15. Activism campaigns accelerating." },
];

/* ─── Transition matrix reading guide ───────────────────────────────────────── */
function TransitionGuide({ color }: { color: string }) {
  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid ${color}18`,
      backgroundColor: `${color}05`,
      padding: "1rem 1.2rem",
      marginTop: "1rem",
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: "1rem",
    }}>
      {[
        {
          icon: "◈",
          label: "How to read the table",
          text: "Each row is the CURRENT state. Each column is the NEXT state. The value is the probability that the model will assign that next-quarter regime, given today's regime. Every row sums to 100%.",
        },
        {
          icon: "◉",
          label: "Diagonal = regime persistence",
          text: "Bold diagonal values show how \"sticky\" each regime is. Goldilocks is most persistent at 78% -- if the model reads Goldilocks today, there is a 78% chance it will read Goldilocks again next quarter. Recession Fear is least persistent at 51%, meaning stress episodes resolve faster than they develop.",
        },
        {
          icon: "◎",
          label: "Why persistence matters for RACS",
          text: "High diagonal values mean the regime multiplier is stable and reliable over multiple quarters. When Goldilocks shows 78% persistence, a manager running a multi-quarter activist campaign can trust the signal amplification will hold. Low persistence (Recession Fear 51%) means the discount is temporary and short-cycle.",
        },
      ].map(({ icon, label, text }) => (
        <div key={label}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginBottom: "0.4rem" }}>
            <span style={{ fontSize: "0.7rem", color }}>{icon}</span>
            <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color }}>
              {label}
            </span>
          </div>
          <p style={{ fontSize: "0.73rem", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
            {text}
          </p>
        </div>
      ))}
    </div>
  );
}

async function RegimeContent() {
  const data = await getRegimeData();
  const { current, history, distribution, transition_matrix, total_observations } = data;

  const currentColor = REGIME_COLORS[current.regime_label] ?? "#a1a1aa";
  const currentLabel = REGIME_LABELS[current.regime_label] ?? current.regime_label;
  const currentDetail = REGIME_DETAIL[current.regime_label];

  /* Derived stats from transition matrix */
  const avgPersistence = transition_matrix?.matrix?.length
    ? transition_matrix.matrix.reduce((sum, row, i) => sum + row[i], 0) / transition_matrix.matrix.length
    : null;

  const longestRun = distribution.reduce((a, b) => (a.count > b.count ? a : b));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>

      {/* ── 1. Hero: current regime + what it means ───────────────────────────── */}
      <RevealContainer threshold={0.05}>
        <GlassCard hierarchy="primary">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "2rem", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
                padding: "0.2rem 0.7rem", borderRadius: 20, marginBottom: "1.1rem",
                backgroundColor: `${currentColor}15`, border: `1px solid ${currentColor}35`,
              }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: currentColor, boxShadow: `0 0 6px ${currentColor}` }} />
                <span style={{ fontSize: "0.62rem", fontWeight: 700, color: currentColor, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Live Macro Regime Detection
                </span>
              </div>

              <h1 style={{
                fontSize: "clamp(1.7rem, 2.6vw, 2.4rem)",
                fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.1,
                margin: "0 0 0.5rem",
                color: currentColor,
              }}>
                {currentLabel}
              </h1>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                {(current.regime_prob * 100).toFixed(0)}% HMM model confidence &nbsp;·&nbsp; {current.date} (most recent quarter)
              </div>

              <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: "52ch", margin: "0 0 0.9rem" }}>
                {currentDetail?.conditions}
              </p>

              {currentDetail && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: "0.5rem",
                  padding: "0.3rem 0.9rem", borderRadius: 6,
                  backgroundColor: currentDetail.multiplierPositive ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                  border: `1px solid ${currentDetail.multiplierPositive ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: currentDetail.multiplierPositive ? "#10b981" : "#ef4444" }}>
                    RACS effect: {currentDetail.multiplier}
                  </span>
                </div>
              )}
            </div>

            {/* Right: What the HMM does */}
            <div style={{
              padding: "1.2rem 1.5rem", borderRadius: 14, flexShrink: 0,
              backgroundColor: "rgba(138,43,226,0.06)", border: "1px solid rgba(138,43,226,0.18)",
              minWidth: 220, maxWidth: 280,
            }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.65rem" }}>
                How regime detection works
              </div>
              {[
                ["Input features", "VIX, yield curve slope (10Y-2Y), credit spreads (HY OAS), Fed funds delta, OFR Financial Stress Index"],
                ["Model", "Gaussian Hidden Markov Model with 4 latent states trained on 24 quarters"],
                ["Output", "Per-quarter probability distribution across all 4 states"],
                ["RACS role", "The highest-probability state sets the regime multiplier applied to every signal score"],
              ].map(([step, desc]) => (
                <div key={step} style={{ marginBottom: "0.6rem" }}>
                  <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#8a2be2", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.2rem" }}>{step}</div>
                  <div style={{ fontSize: "0.73rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </RevealContainer>

      {/* ── 2. Four regime explainer cards ────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="The Four Macro Regimes"
          description="The HMM learns four distinct economic environments from macro feature data. Each regime shifts the weight the platform assigns to institutional conviction signals."
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1.25rem" }}>
          {Object.entries(REGIME_DETAIL).map(([key, detail], i) => {
            const color = REGIME_COLORS[key] ?? "#a1a1aa";
            const label = REGIME_LABELS[key] ?? key;
            const dist = distribution.find((d) => d.regime_label === key);
            const isCurrent = key === current.regime_label;

            return (
              <GlassCard key={key} hierarchy={isCurrent ? "primary" : "secondary"} delayIndex={i}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.85rem" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%", backgroundColor: color,
                        boxShadow: isCurrent ? `0 0 8px ${color}` : "none",
                      }} />
                      <span style={{
                        fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.08em",
                        textTransform: "uppercase", color,
                      }}>
                        {label}
                        {isCurrent && (
                          <span style={{ marginLeft: "0.5rem", opacity: 0.75 }}>-- ACTIVE</span>
                        )}
                      </span>
                    </div>
                    <div style={{
                      display: "inline-block", padding: "0.18rem 0.55rem", borderRadius: 4,
                      fontSize: "0.68rem", fontWeight: 700,
                      backgroundColor: detail.multiplierPositive ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                      color: detail.multiplierPositive ? "#10b981" : "#ef4444",
                      border: `1px solid ${detail.multiplierPositive ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
                    }}>
                      {detail.multiplier}
                    </div>
                  </div>
                  {dist && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "1.4rem", fontWeight: 800, color, letterSpacing: "-0.03em" }}>
                        {dist.count}
                      </div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>
                        qtrs ({(dist.pct * 100).toFixed(0)}%)
                      </div>
                    </div>
                  )}
                </div>

                {/* Three info blocks */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                  {[
                    { icon: "◈", label: "Macro conditions", text: detail.conditions },
                    { icon: "◉", label: "Equity environment", text: detail.equityEnvironment },
                    { icon: "◎", label: "Effect on RACS signals", text: detail.racsEffect },
                  ].map(({ icon, label: blockLabel, text }) => (
                    <div key={blockLabel} style={{
                      padding: "0.6rem 0.8rem",
                      borderRadius: 8,
                      backgroundColor: `${color}07`,
                      border: `1px solid ${color}14`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginBottom: "0.3rem" }}>
                        <span style={{ fontSize: "0.65rem", color }}>{icon}</span>
                        <span style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color }}>
                          {blockLabel}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.73rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                        {text}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Historical examples */}
                <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.03)", borderLeft: `2px solid ${color}40` }}>
                  <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>Historical examples: </span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{detail.historicalExamples}</span>
                </div>

                {/* Distribution bar */}
                {dist && (
                  <div style={{ marginTop: "0.75rem", height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.06)" }}>
                    <div style={{ height: "100%", borderRadius: 2, background: color, width: `${dist.pct * 100}%`, transition: "width 0.5s ease" }} />
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      </RevealContainer>

      {/* ── 3. Regime confidence timeline ─────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="Regime Confidence Timeline (2019-2024)"
          description="Each bar represents one quarter. Bar height shows the HMM's probability for its assigned regime -- the model's confidence in its own classification. Colour encodes which regime was dominant."
        />
        <GlassCard hierarchy="primary">
          <RegimeChart history={history} />

          {/* Legend */}
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

        {/* Chart reading guide */}
        <div style={{
          marginTop: "0.85rem",
          borderRadius: 12,
          border: "1px solid rgba(138,43,226,0.2)",
          backgroundColor: "rgba(138,43,226,0.06)",
          overflow: "hidden",
        }}>
          <div style={{
            padding: "0.65rem 1.2rem",
            borderBottom: "1px solid rgba(138,43,226,0.12)",
            backgroundColor: "rgba(138,43,226,0.08)",
            display: "flex", alignItems: "center", gap: "0.5rem",
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#8a2be2", boxShadow: "0 0 6px #8a2be2" }} />
            <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a2be2" }}>
              How to read this chart + key historical events
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {/* Reading guide left */}
            <div style={{ padding: "0.9rem 1.2rem", borderRight: "1px solid rgba(138,43,226,0.1)" }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a2be2", marginBottom: "0.5rem" }}>
                Reading guide
              </div>
              {[
                ["Bar height", "HMM model confidence for the assigned regime. A 93% bar means the model is nearly certain this is the correct state."],
                ["Bar colour", "Which of the 4 regimes had the highest probability that quarter."],
                ["Dashed line at 80%", "High-confidence threshold. Bars above this line indicate the HMM has a strongly unambiguous regime read."],
                ["Colour transitions", "A sudden colour change between adjacent bars indicates a regime shift -- the model detected a structural change in macro conditions."],
              ].map(([term, desc]) => (
                <div key={term} style={{ display: "flex", gap: "0.6rem", marginBottom: "0.45rem", alignItems: "flex-start" }}>
                  <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#8a2be2", fontFamily: "monospace", flexShrink: 0, paddingTop: "0.1rem", minWidth: 90 }}>{term}</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{desc}</span>
                </div>
              ))}
            </div>
            {/* Key events right */}
            <div style={{ padding: "0.9rem 1.2rem" }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a2be2", marginBottom: "0.5rem" }}>
                Key historical events captured
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                {REGIME_EVENTS.map(({ date, label, regime, detail }) => {
                  const color = REGIME_COLORS[regime] ?? "#a1a1aa";
                  return (
                    <div key={date} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
                      <div style={{
                        flexShrink: 0, padding: "0.1rem 0.4rem", borderRadius: 3,
                        fontSize: "0.58rem", fontWeight: 700, fontFamily: "monospace",
                        backgroundColor: `${color}18`, color,
                        border: `1px solid ${color}30`,
                      }}>
                        {date}
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.1rem" }}>{label}</div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>{detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </RevealContainer>

      {/* ── 4. Regime statistics row ──────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="Regime Statistics"
          description={`Full 24-quarter sample (2019-2024). ${longestRun.count} of ${total_observations} quarters in the most frequent regime (${REGIME_LABELS[longestRun.regime_label] ?? longestRun.regime_label}).`}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
          {distribution.map((d, i) => {
            const color = REGIME_COLORS[d.regime_label] ?? "#a1a1aa";
            const label = REGIME_LABELS[d.regime_label] ?? d.regime_label;
            const detail = REGIME_DETAIL[d.regime_label];
            const isCurrent = d.regime_label === current.regime_label;
            return (
              <GlassCard key={d.regime_label} hierarchy={isCurrent ? "primary" : "secondary"} delayIndex={i}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: "50%",
                    backgroundColor: color,
                    boxShadow: isCurrent ? `0 0 8px ${color}` : "none",
                  }} />
                  <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color }}>
                    {label}
                  </span>
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.03em", color, marginBottom: "0.1rem" }}>
                  {d.count}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.65rem" }}>
                  quarters &nbsp;·&nbsp; {(d.pct * 100).toFixed(0)}% of sample
                </div>
                {detail && (
                  <div style={{
                    fontSize: "0.65rem", fontWeight: 700,
                    color: detail.multiplierPositive ? "#10b981" : "#ef4444",
                    marginBottom: "0.6rem",
                  }}>
                    {detail.multiplier}
                  </div>
                )}
                <div style={{ height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.06)" }}>
                  <div style={{ height: "100%", borderRadius: 2, background: color, width: `${d.pct * 100}%`, transition: "width 0.5s ease" }} />
                </div>
                {isCurrent && (
                  <div style={{ marginTop: "0.5rem", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color, opacity: 0.8 }}>
                    -- current regime
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      </RevealContainer>

      {/* ── 5. Transition matrix + reading guide ──────────────────────────────── */}
      {transition_matrix?.matrix?.length > 0 && (
        <RevealContainer threshold={0.15}>
          <SectionHeader
            title="State Transition Matrix"
            description="Estimated HMM transition probabilities: the probability of moving from one regime to another between consecutive quarters. Rows = current state, columns = next-quarter state."
          />
          <GlassCard hierarchy="secondary">
            {/* Key stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem", paddingBottom: "1.25rem", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {[
                {
                  label: "Avg regime persistence",
                  value: avgPersistence != null ? `${(avgPersistence * 100).toFixed(0)}%` : "--",
                  desc: "Mean diagonal value: probability of staying in the same regime next quarter",
                  color: "#8a2be2",
                },
                {
                  label: "Most persistent",
                  value: "Goldilocks",
                  desc: "78% self-transition probability -- nearly 4 in 5 quarters remain Goldilocks once established",
                  color: REGIME_COLORS["Goldilocks"],
                },
                {
                  label: "Fastest-resolving",
                  value: "Recession Fear",
                  desc: "51% self-persistence is the lowest -- stress regimes tend to resolve within 1-2 quarters",
                  color: REGIME_COLORS["Recession_Fear"],
                },
                {
                  label: "Most likely escape",
                  value: "Fear -> Recovery",
                  desc: "31% probability Recession Fear transitions directly to Recovery -- the most common stress-exit path",
                  color: REGIME_COLORS["Recovery"],
                },
              ].map(({ label, value, desc, color }) => (
                <div key={label}>
                  <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.3rem" }}>{label}</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color, marginBottom: "0.25rem", letterSpacing: "-0.02em" }}>{value}</div>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>{desc}</div>
                </div>
              ))}
            </div>

            {/* Matrix table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 480 }}>
                <thead>
                  <tr>
                    <th style={{
                      padding: "0.6rem 0.9rem", textAlign: "left",
                      fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
                      color: "var(--text-muted)", borderBottom: "1px solid rgba(255,255,255,0.08)",
                    }}>
                      Current regime (row) &#8594; Next quarter (col)
                    </th>
                    {transition_matrix.labels.map((l) => (
                      <th key={l} style={{
                        padding: "0.6rem 0.9rem", textAlign: "center",
                        fontSize: "0.7rem", fontWeight: 700,
                        color: REGIME_COLORS[l] ?? "var(--text-secondary)",
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                      }}>
                        {REGIME_LABELS[l] ?? l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transition_matrix.matrix.map((row, ri) => {
                    const rowColor = REGIME_COLORS[transition_matrix.labels[ri]] ?? "var(--text-secondary)";
                    return (
                      <tr key={ri}>
                        <td style={{
                          padding: "0.65rem 0.9rem",
                          fontSize: "0.82rem", fontWeight: 700, color: rowColor,
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                        }}>
                          {REGIME_LABELS[transition_matrix.labels[ri]] ?? transition_matrix.labels[ri]}
                        </td>
                        {row.map((v, ci) => {
                          const isDiag = ri === ci;
                          const isHigh = v >= 0.2 && !isDiag;
                          const colColor = REGIME_COLORS[transition_matrix.labels[ci]] ?? "#a1a1aa";
                          return (
                            <td key={ci} style={{
                              padding: "0.65rem 0.9rem",
                              textAlign: "center",
                              fontSize: "0.85rem",
                              fontVariantNumeric: "tabular-nums",
                              fontWeight: isDiag ? 800 : isHigh ? 600 : 400,
                              color: isDiag ? colColor : isHigh ? "var(--text-primary)" : "var(--text-muted)",
                              backgroundColor: isDiag ? `${colColor}12` : "transparent",
                              borderBottom: "1px solid rgba(255,255,255,0.04)",
                              borderRadius: isDiag ? 4 : 0,
                            }}>
                              {(v * 100).toFixed(0)}%
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <TransitionGuide color="#8a2be2" />
          </GlassCard>
        </RevealContainer>
      )}

      {/* ── 6. RACS signal formula explainer ──────────────────────────────────── */}
      <RevealContainer threshold={0.15}>
        <SectionHeader
          title="How Regime Multiplier Affects Every Signal"
          description="The current macro regime does not just change interpretation -- it mathematically scales every RACS score produced by the platform."
        />
        <GlassCard hierarchy="secondary">
          {/* Formula display */}
          <div style={{
            padding: "1rem 1.5rem", borderRadius: 10,
            backgroundColor: "rgba(138,43,226,0.08)", border: "1px solid rgba(138,43,226,0.2)",
            marginBottom: "1.5rem", textAlign: "center",
          }}>
            <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
              RACS Formula
            </div>
            <div style={{ fontSize: "0.95rem", fontFamily: "monospace", fontWeight: 600, color: "#c4b5fd", letterSpacing: "0.01em" }}>
              RACS = consensus_weight * log(activist_buyers + 1.1) * (1 - crowding) * (1 +/- regime_weight * regime_prob)
            </div>
          </div>
          {/* Regime multiplier breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
            {[
              { regime: "Goldilocks", sign: "+", weight: "0.20", result: "×1.174", example: "A signal scoring 75 becomes 88 in Goldilocks at 87% confidence" },
              { regime: "Recovery", sign: "+", weight: "0.10", result: "×1.082", example: "A signal scoring 75 becomes 81 in Recovery at 82% confidence" },
              { regime: "Rate_Shock", sign: "-", weight: "0.15", result: "×0.864", example: "A signal scoring 75 becomes 65 in Rate Shock at 91% confidence" },
              { regime: "Recession_Fear", sign: "-", weight: "0.25", result: "×0.803", example: "A signal scoring 75 becomes 60 in Recession Fear at 79% confidence" },
            ].map(({ regime, sign, weight, result, example }) => {
              const color = REGIME_COLORS[regime] ?? "#a1a1aa";
              const label = REGIME_LABELS[regime] ?? regime;
              const positive = sign === "+";
              const isCurrent = regime === current.regime_label;
              return (
                <div key={regime} style={{
                  padding: "0.9rem 1rem", borderRadius: 10,
                  border: `1px solid ${isCurrent ? color + "50" : color + "20"}`,
                  backgroundColor: `${color}${isCurrent ? "10" : "06"}`,
                }}>
                  <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color, marginBottom: "0.4rem" }}>
                    {label}{isCurrent && " -- Active"}
                  </div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 800, letterSpacing: "-0.03em", color, marginBottom: "0.2rem" }}>
                    {result}
                  </div>
                  <div style={{ fontSize: "0.65rem", fontFamily: "monospace", color: positive ? "#10b981" : "#ef4444", marginBottom: "0.5rem", fontWeight: 600 }}>
                    (1 {sign} {weight} * regime_prob)
                  </div>
                  <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                    {example}
                  </p>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </RevealContainer>

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
