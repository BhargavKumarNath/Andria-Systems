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

/* ─── RACS formula decoder ───────────────────────────────────────────────────── */
function RacsFormulaDecoder() {
  const terms = [
    {
      term: "consensus_weight",
      color: "#3b82f6",
      short: "How much AUM is behind this stock",
      long: "The share of total activist AUM allocated to this ticker across all filing managers in the quarter. A stock held by 30 managers each with large positions scores higher than one held by 5 managers with token stakes.",
    },
    {
      term: "log(activist_buyers + 1.1)",
      color: "#8a2be2",
      short: "Independent conviction count",
      long: "Number of Conviction Activist and Nimble Trader managers who independently entered or increased this position. The logarithm prevents mega-activists from dominating. Adding 1.1 ensures no signal bottoms at zero even with one buyer.",
    },
    {
      term: "(1 - crowding)",
      color: "#f59e0b",
      short: "Originality of the thesis",
      long: "The crowding penalty subtracts the fraction of total 13F AUM already holding this stock. If everyone on Wall Street already owns it, the signal value is low -- there are no new buyers left to drive the price. Low crowding = undiscovered conviction.",
    },
    {
      term: "(1 +/- regime_weight x regime_prob)",
      color: "#10b981",
      short: "Macro environment multiplier",
      long: "The Gaussian HMM assigns the current quarter to one of four macro regimes. Goldilocks and Recovery amplify signals (+10-20%); Rate Shock and Recession Fear discount them (-15-25%). The model's confidence (regime_prob) scales the adjustment -- a 95% confident Goldilocks read amplifies more than a 60% read.",
    },
  ];

  return (
    <div style={{
      borderRadius: 12,
      border: "1px solid rgba(138,43,226,0.2)",
      backgroundColor: "rgba(138,43,226,0.05)",
      overflow: "hidden",
    }}>
      {/* Formula header */}
      <div style={{
        padding: "0.9rem 1.3rem",
        borderBottom: "1px solid rgba(138,43,226,0.12)",
        backgroundColor: "rgba(138,43,226,0.08)",
      }}>
        <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a2be2", marginBottom: "0.4rem" }}>
          RACS formula breakdown
        </div>
        <div style={{ fontFamily: "monospace", fontSize: "0.85rem", color: "#c4b5fd", fontWeight: 600, lineHeight: 1.5 }}>
          RACS = <span style={{ color: "#3b82f6" }}>consensus_weight</span>
          {" * "}
          <span style={{ color: "#8a2be2" }}>log(activist_buyers + 1.1)</span>
          {" * "}
          <span style={{ color: "#f59e0b" }}>(1 - crowding)</span>
          {" * "}
          <span style={{ color: "#10b981" }}>(1 +/- regime_weight * regime_prob)</span>
        </div>
      </div>

      {/* Term breakdown grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        {terms.map(({ term, color, short, long }, i) => (
          <div key={term} style={{
            padding: "0.9rem 1rem",
            borderRight: i < 3 ? "1px solid rgba(138,43,226,0.1)" : "none",
          }}>
            <div style={{
              fontFamily: "monospace",
              fontSize: "0.62rem",
              fontWeight: 700,
              color,
              marginBottom: "0.35rem",
              wordBreak: "break-all",
            }}>
              {term}
            </div>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.35rem" }}>
              {short}
            </div>
            <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              {long}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Table column guide ─────────────────────────────────────────────────────── */
function TableColumnGuide() {
  const cols = [
    {
      col: "RACS Score",
      color: "#8a2be2",
      what: "The regime-adjusted final score. This is the number that determines rank. Higher = stronger, more independently confirmed, less crowded, macro-tailwind thesis.",
      actionable: "Stocks in the top 10 have passed every filter simultaneously: activist conviction, low crowding, and macro alignment.",
    },
    {
      col: "Activists",
      color: "#3b82f6",
      what: "Number of Conviction Activist or Nimble Trader managers who independently entered or grew a position in this stock this quarter.",
      actionable: "The log transform means each additional activist adds diminishing marginal score. 20+ buyers is exceptionally high -- this stock has broad independent conviction.",
    },
    {
      col: "Strong Buys",
      color: "#10b981",
      what: "Subset of activist buyers where the position size increased by >50% of the manager's average conviction delta -- i.e., they did not just buy, they bet heavily.",
      actionable: "A high Strong Buys to Activists ratio means the buyers are all-in, not just dipping a toe. ITW shows 17 of 22 buyers as strong -- exceptional conviction alignment.",
    },
    {
      col: "Crowding",
      color: "#f59e0b",
      what: "Fraction of the total 13F institutional AUM universe already holding this stock. Green (<20%) = undiscovered. Amber (20-40%) = moderate. Red (>40%) = crowded thesis.",
      actionable: "Prefer green. A high-conviction activist play in an already-crowded stock is far more fragile because any sentiment shift triggers mass exits simultaneously.",
    },
  ];

  return (
    <div style={{
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.07)",
      backgroundColor: "rgba(255,255,255,0.02)",
      overflow: "hidden",
      marginTop: "0.85rem",
    }}>
      <div style={{
        padding: "0.65rem 1.2rem",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        backgroundColor: "rgba(255,255,255,0.02)",
        display: "flex", alignItems: "center", gap: "0.5rem",
      }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#8a2be2", boxShadow: "0 0 6px #8a2be2" }} />
        <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a2be2" }}>
          How to read this table
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        {cols.map(({ col, color, what, actionable }, i) => (
          <div key={col} style={{
            padding: "0.8rem 1rem",
            borderRight: i < 3 ? "1px solid rgba(255,255,255,0.05)" : "none",
          }}>
            <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color, marginBottom: "0.3rem" }}>
              {col}
            </div>
            <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)", lineHeight: 1.55, margin: "0 0 0.45rem" }}>
              {what}
            </p>
            <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", lineHeight: 1.5, margin: 0, fontStyle: "italic" }}>
              {actionable}
            </p>
          </div>
        ))}
      </div>
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>

      {/* ── 1. Hero ───────────────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.05}>
        <GlassCard hierarchy="primary">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "2rem", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
                padding: "0.2rem 0.7rem", borderRadius: 20, marginBottom: "1.1rem",
                backgroundColor: "rgba(138,43,226,0.1)", border: "1px solid rgba(138,43,226,0.28)",
              }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#8a2be2" }} />
                <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#c4b5fd", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  RACS Engine · Alpha Signal Output
                </span>
              </div>

              <h1 style={{
                fontSize: "clamp(1.6rem, 2.4vw, 2.2rem)",
                fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.15,
                margin: "0 0 0.85rem",
                background: "linear-gradient(135deg, #ffffff 0%, rgba(196,181,253,0.85) 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>
                Where the Machine Finds<br />Institutional Conviction
              </h1>

              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: "52ch", margin: "0 0 1rem" }}>
                Each row in this table is a stock where multiple independent, sophisticated hedge funds
                have simultaneously built new positions -- and the current macro regime amplifies rather
                than discounts their collective signal. The RACS score synthesises four orthogonal
                evidence sources: how much capital is committed, how many independent managers agree,
                how undiscovered the thesis is, and whether the macro environment favours the trade.
              </p>

              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                {[
                  validation_passed
                    ? { text: "Evaluation Gate: PASSED", color: "#10b981" }
                    : { text: "Evaluation Gate: FAILED", color: "#ef4444" },
                  { text: `${(provenance_quality * 100).toFixed(1)}% ticker provenance`, color: "#8a2be2" },
                  { text: `${total_signals.toLocaleString()} pipeline signals`, color: "#3b82f6" },
                ].map(({ text, color }) => (
                  <div key={text} style={{
                    padding: "0.25rem 0.75rem", borderRadius: 6,
                    fontSize: "0.72rem", fontWeight: 700,
                    backgroundColor: `${color}12`, color,
                    border: `1px solid ${color}30`,
                  }}>
                    {text}
                  </div>
                ))}
              </div>
            </div>

            {/* Top signal spotlight */}
            {topSignal && (
              <div style={{
                padding: "1.2rem 1.5rem", borderRadius: 14, flexShrink: 0,
                backgroundColor: "rgba(138,43,226,0.08)", border: "1px solid rgba(138,43,226,0.25)",
                minWidth: 200,
              }}>
                <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
                  Top signal this quarter
                </div>
                <div style={{ fontSize: "2.4rem", fontWeight: 900, letterSpacing: "-0.04em", color: "#ffffff", marginBottom: "0.15rem", fontFamily: "monospace" }}>
                  {topSignal.ticker}
                </div>
                <div style={{ fontSize: "0.72rem", color: "#c4b5fd", marginBottom: "0.75rem" }}>
                  RACS {topSignal.regime_adjusted_racs.toFixed(4)}
                </div>
                {[
                  ["Activist buyers", topSignal.activist_buyers],
                  ["Strong buys", topSignal.strong_buys],
                  ["Crowding", `${(topSignal.crowding_penalty * 100).toFixed(1)}%`],
                  ["Regime", REGIME_LABELS[topSignal.regime_label] ?? topSignal.regime_label],
                ].map(([label, val]) => (
                  <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "0.3rem" }}>
                    <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{label}</span>
                    <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-primary)" }}>{val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>
      </RevealContainer>

      {/* ── 2. KPI row ────────────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1.5rem" }}>
          <GlassCard hierarchy="secondary">
            <MetricTile
              label="Pipeline signals"
              value={total_signals.toLocaleString()}
              sub="All ticker-quarters scored by RACS across 12 data quarters"
            />
          </GlassCard>
          <GlassCard hierarchy="secondary">
            <MetricTile
              label="Avg activist buyers"
              value={avgActivists}
              sub="Mean number of independent activist managers per displayed signal"
            />
          </GlassCard>
          <GlassCard hierarchy="secondary">
            <MetricTile
              label="High-conviction signals"
              value={strongConviction}
              sub="Signals with 5 or more strong-buy managers (>50% conviction delta)"
            />
          </GlassCard>
          <GlassCard hierarchy="secondary">
            <MetricTile
              label="Avg crowding"
              value={`${(avgCrowding * 100).toFixed(1)}%`}
              sub="Mean crowding penalty across displayed signals (lower = better)"
            />
          </GlassCard>
        </div>
      </RevealContainer>

      {/* ── 3. RACS formula explainer ──────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="How RACS Scores Are Built"
          description="Four orthogonal evidence sources are multiplied together. A stock must score well on all four simultaneously to reach the top of the rankings -- there is no way to compensate a low score on one term with a high score on another."
        />
        <RacsFormulaDecoder />
      </RevealContainer>

      {/* ── 4. Signal table ───────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="RACS Signal Rankings"
          description={`Top ${signals.length} signals from the most recent pipeline run, sorted by regime_adjusted_racs. Click any column header to re-sort.`}
        />
        <GlassCard hierarchy="primary">
          <SignalsTable signals={signals} />
        </GlassCard>
        <TableColumnGuide />
      </RevealContainer>

      {/* ── 5. Signal distribution by regime ──────────────────────────────────── */}
      <RevealContainer threshold={0.15}>
        <SectionHeader
          title="Signals by Macro Regime"
          description="Which regime was active when each signal was generated. Signals generated during different regimes carry different regime multipliers baked into their RACS score."
        />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(Object.keys(byRegime).length, 1)}, 1fr)`, gap: "1rem" }}>
          {Object.entries(byRegime).map(([regime, count], i) => {
            const color = REGIME_COLORS[regime] ?? "#a1a1aa";
            const label = REGIME_LABELS[regime] ?? regime.replace(/_/g, " ");
            return (
              <GlassCard key={regime} hierarchy="secondary" delayIndex={i}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: color }} />
                  <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color }}>
                    {label}
                  </span>
                </div>
                <div style={{ fontSize: "2.2rem", fontWeight: 800, letterSpacing: "-0.03em", color, marginBottom: "0.15rem" }}>
                  {count}
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.65rem" }}>
                  signals &nbsp;·&nbsp; {((count / signals.length) * 100).toFixed(0)}% of total
                </div>
                <div style={{ height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.06)" }}>
                  <div style={{ height: "100%", borderRadius: 2, background: color, width: `${(count / signals.length) * 100}%`, transition: "width 0.5s ease" }} />
                </div>
              </GlassCard>
            );
          })}
        </div>
      </RevealContainer>

      {/* ── 6. What makes a great signal? ─────────────────────────────────────── */}
      <RevealContainer threshold={0.15}>
        <SectionHeader
          title="Signal Quality Checklist"
          description="When evaluating any row in the table above, these are the characteristics that institutional quantitative analysts look for."
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
          {[
            {
              label: "High activist count (10+)",
              good: true,
              detail: "Ten or more independent Conviction Activists or Nimble Traders building the same position without coordinating signals a broadly shared, independently derived thesis. This is rare and high-value.",
            },
            {
              label: "Low crowding (< 20%)",
              good: true,
              detail: "If institutional ownership is still low, the stock has room to re-rate as more capital rotates in. High-crowding signals are fragile because there is no incremental buyer left to drive price.",
            },
            {
              label: "High strong-buy ratio",
              good: true,
              detail: "When a large fraction of activist buyers are classified as strong buys (>50% conviction delta), it means the smart money is not merely trimming into a position -- they are making a decisive, high-conviction bet.",
            },
            {
              label: "Goldilocks or Recovery regime",
              good: true,
              detail: "Signals generated in Goldilocks or Recovery carry a positive regime multiplier. The macro environment is not working against the thesis -- activist campaigns succeed at above-average rates when volatility is low and capital is freely flowing.",
            },
            {
              label: "High crowding (> 40%)",
              good: false,
              detail: "A crowded signal is fragile. Even legitimate activist conviction can be overwhelmed by forced selling from other holders when sentiment shifts. The (1 - crowding) penalty captures this directly.",
            },
            {
              label: "Rate Shock or Recession Fear regime",
              good: false,
              detail: "Signals generated during stress regimes are discounted because noise from forced selling, redemptions, and macro-driven exits drowns out genuine fundamental conviction. Treat as directional indicators only.",
            },
          ].map(({ label, good, detail }, i) => (
            <GlassCard key={label} hierarchy="secondary" delayIndex={i}>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                <div style={{
                  flexShrink: 0, width: 22, height: 22, borderRadius: "50%",
                  backgroundColor: good ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.12)",
                  border: `1px solid ${good ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.25)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.65rem", fontWeight: 900,
                  color: good ? "#10b981" : "#ef4444",
                  marginTop: "0.1rem",
                }}>
                  {good ? "+" : "-"}
                </div>
                <div>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: good ? "#10b981" : "#ef4444", marginBottom: "0.3rem" }}>
                    {label}
                  </div>
                  <p style={{ fontSize: "0.76rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                    {detail}
                  </p>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      </RevealContainer>
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
