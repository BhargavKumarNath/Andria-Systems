import React, { Suspense } from "react";
import { getPortfolioData, getBacktestData } from "@/lib/loaders";
import type { RegimeMetric, CapacityPoint } from "@/lib/loaders";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";
import MetricTile from "@/components/MetricTile";
import MetricGlossary from "./MetricGlossary";
import { REGIME_COLORS } from "@/lib/taxonomy";

function Skeleton() {
  return <div className="skeleton-shimmer" style={{ width: "100%", height: 500 }} />;
}

function fmtPct(v: number | null | undefined, decimals = 1) {
  return v === null || v === undefined ? "not available" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(decimals)}%`;
}

/* ─── Portfolio Hero ─────────────────────────────────────────────────────────── */
function PortfolioHero() {
  const steps = [
    { n: "1", label: "Score signals", desc: "RACS ranks every ticker-quarter by activist conviction × macro tailwind" },
    { n: "2", label: "Select top decile", desc: "Only the top 10% of scored signals pass into the simulated book" },
    { n: "3", label: "Size by risk budget", desc: "PortfolioConstructor weights positions by volatility target and sector caps" },
    { n: "4", label: "Backtest with costs", desc: "All trades simulated with T+1 fill delay, slippage, and ADV participation limits" },
  ];
  return (
    <GlassCard hierarchy="primary">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "2rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          {/* Label pill */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "0.4rem",
            padding: "0.2rem 0.7rem", borderRadius: 20, marginBottom: "1rem",
            backgroundColor: "rgba(138,43,226,0.1)", border: "1px solid rgba(138,43,226,0.28)",
          }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#8a2be2" }} />
            <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#c4b5fd", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              RACS Portfolio Construction · Simulated Book
            </span>
          </div>

          <h1 style={{
            fontSize: "clamp(1.5rem, 2.2vw, 2rem)", fontWeight: 800,
            letterSpacing: "-0.04em", lineHeight: 1.15, margin: "0 0 0.7rem",
            background: "linear-gradient(135deg, #ffffff 0%, rgba(196,181,253,0.85) 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>
            What the Backtest Portfolio<br />Looks Like
          </h1>

          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.65, maxWidth: "48ch", margin: 0 }}>
            This is a <strong style={{ color: "var(--text-primary)" }}>simulated portfolio</strong>, not a live traded book.
            It shows how a strategy that mechanically follows the top RACS signals would have performed,
            after realistic transaction costs and execution constraints.
          </p>
        </div>

        {/* Step list: matches DNA page pattern */}
        <div style={{
          padding: "1.1rem 1.4rem", borderRadius: 14, flexShrink: 0,
          backgroundColor: "rgba(138,43,226,0.07)", border: "1px solid rgba(138,43,226,0.2)",
          minWidth: 240, maxWidth: 320,
        }}>
          <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.7rem" }}>
            How this page is built
          </div>
          {steps.map(({ n, label, desc }) => (
            <div key={n} style={{ display: "flex", gap: "0.65rem", marginBottom: "0.6rem", alignItems: "flex-start" }}>
              <span style={{
                fontSize: "0.6rem", fontWeight: 700, color: "#8a2be2", fontFamily: "monospace",
                flexShrink: 0, paddingTop: "0.12rem",
                width: 18, height: 18, borderRadius: "50%",
                backgroundColor: "rgba(138,43,226,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{n}</span>
              <div>
                <div style={{ fontSize: "0.73rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.1rem" }}>{label}</div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

/* ─── KPI color helpers ──────────────────────────────────────────────────────── */
function sharpeColor(v: number) {
  if (v >= 1.5) return "#10b981";
  if (v >= 1.0) return "#f59e0b";
  return "#ef4444";
}
function returnColor(v: number) { return v >= 0 ? "#10b981" : "#ef4444"; }
function drawdownColor(v: number) {
  const abs = Math.abs(v);
  if (abs <= 0.05) return "#10b981";
  if (abs <= 0.15) return "#f59e0b";
  return "#ef4444";
}

/* ─── Small-sample notice ────────────────────────────────────────────────────── */
function SmallSampleNotice({ totalTrades }: { totalTrades: number }) {
  return (
    <div style={{
      borderRadius: 10, border: "1px solid rgba(245,158,11,0.28)",
      backgroundColor: "rgba(245,158,11,0.06)", padding: "0.75rem 1.1rem",
      display: "flex", alignItems: "center", gap: "0.6rem",
    }}>
      <span style={{ fontSize: "1rem" }}>⚠</span>
      <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.55 }}>
        <strong style={{ color: "#f59e0b" }}>Small sample.</strong> This run of the simulated book closed only{" "}
        <strong style={{ color: "var(--text-primary)" }}>{totalTrades} trades</strong>. Every figure below is
        directional, not statistically conclusive, until more filing history flows through the pipeline.
      </p>
    </div>
  );
}

/* ─── Performance by regime ───────────────────────────────────────────────────── */
function RegimePerformance({ metricsByRegime }: { metricsByRegime: Record<string, RegimeMetric> }) {
  const entries = Object.entries(metricsByRegime);
  if (entries.length === 0) {
    return (
      <GlassCard hierarchy="primary">
        <SectionHeader title="Performance by Regime" description="No regime-level trades recorded for this run." />
      </GlassCard>
    );
  }
  return (
    <GlassCard hierarchy="primary">
      <SectionHeader
        title="Performance by Regime"
        description="Trade outcomes grouped by the HMM macro regime active at entry. p-values are raw, pre-FDR-correction."
      />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(entries.length, 4)}, 1fr)`, gap: "1rem" }}>
        {entries.map(([regime, m]) => {
          const rColor = REGIME_COLORS[regime] ?? "#a1a1aa";
          return (
            <div key={regime} style={{
              borderRadius: 12, border: `1px solid ${rColor}33`, backgroundColor: `${rColor}08`,
              padding: "0.9rem 1rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.6rem" }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: rColor }} />
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  {regime.replace(/_/g, " ")}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Trades</span>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, fontFamily: "monospace" }}>{m.n_obs}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Mean Return</span>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, fontFamily: "monospace", color: returnColor(m.mean_return) }}>{fmtPct(m.mean_return, 1)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Sharpe</span>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, fontFamily: "monospace", color: sharpeColor(m.sharpe) }}>{m.sharpe.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Max DD</span>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, fontFamily: "monospace", color: drawdownColor(m.max_dd) }}>{fmtPct(m.max_dd, 1)}</span>
                </div>
              </div>
              <div style={{
                marginTop: "0.6rem", paddingTop: "0.5rem", borderTop: "1px solid rgba(255,255,255,0.06)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>p = {m.raw_p_value.toFixed(3)}</span>
                <span style={{
                  fontSize: "0.58rem", fontWeight: 700, padding: "0.1rem 0.4rem", borderRadius: 4,
                  backgroundColor: m.fdr_significant ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.06)",
                  color: m.fdr_significant ? "#10b981" : "var(--text-muted)",
                }}>
                  {m.fdr_significant ? "significant" : "not significant"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

/* ─── Capacity curve ──────────────────────────────────────────────────────────── */
function CapacityCurve({ points }: { points: CapacityPoint[] }) {
  if (points.length === 0) {
    return (
      <GlassCard hierarchy="secondary">
        <SectionHeader title="Capacity Analysis" description="No capacity scaling run recorded." />
      </GlassCard>
    );
  }
  const firstDead = points.find((p) => p.n_positions === 0);
  return (
    <GlassCard hierarchy="secondary">
      <SectionHeader
        title="Capacity Analysis"
        description="Simulated AUM scaling: as capital grows, ADV participation limits exclude more positions from the book."
      />
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
          <thead>
            <tr>
              {["AUM", "Positions", "Excluded", "Sharpe", "Mean Return"].map((h, i) => (
                <th key={h} style={{ padding: "0.4rem 0.6rem", textAlign: i === 0 ? "left" : "right", fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((p) => {
              const dead = p.n_positions === 0;
              return (
                <tr key={p.aum_label} style={{ opacity: dead ? 0.5 : 1 }}>
                  <td style={{ padding: "0.45rem 0.6rem", fontSize: "0.78rem", fontWeight: 700, fontFamily: "monospace" }}>{p.aum_label}</td>
                  <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontSize: "0.78rem" }}>{p.n_positions}</td>
                  <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontSize: "0.78rem", color: p.exclusion_pct >= 50 ? "#ef4444" : "var(--text-secondary)" }}>{p.exclusion_pct.toFixed(0)}%</td>
                  <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontSize: "0.78rem", fontFamily: "monospace" }}>{p.sharpe === null ? "not available" : p.sharpe.toFixed(2)}</td>
                  <td style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontSize: "0.78rem", fontFamily: "monospace" }}>{fmtPct(p.mean_return, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {firstDead && (
        <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1.55, margin: "0.75rem 0 0" }}>
          Capacity cliff: by <strong style={{ color: "var(--text-primary)" }}>{firstDead.aum_label}</strong> AUM,
          participation limits exclude every current position from this simulated book.
        </p>
      )}
    </GlassCard>
  );
}

async function PortfolioContent() {
  const [portfolio, backtest] = await Promise.all([getPortfolioData(), getBacktestData()]);
  const { summary, top_holdings } = portfolio;
  const { factor_attribution, capacity, metrics_by_regime, signal_decay, summary: bSummary } = backtest;

  const allHorizonDecay = signal_decay.curve.filter((c) => c.regime === "All").sort((a, b) => a.horizon_days - b.horizon_days);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>

      {/* ── 0. Hero ───────────────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.05}>
        <PortfolioHero />
      </RevealContainer>

      {/* ── 0b. Metric Glossary ────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="How to Read This Page"
          description="Click any card for a plain-English explanation of the key metric."
        />
        <MetricGlossary />
      </RevealContainer>

      {/* ── 1. Small-sample notice + hero KPIs ─────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <SmallSampleNotice totalTrades={bSummary.total_trades} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1.5rem" }}>
            {/* Sharpe */}
            <GlassCard hierarchy="primary">
              <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
                Annualised Sharpe
              </div>
              <div style={{ fontSize: "2.4rem", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: sharpeColor(bSummary.annualized_sharpe) }}>
                {bSummary.annualized_sharpe.toFixed(3)}
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>Target ≥ 1.0</div>
            </GlassCard>

            {/* Total trades */}
            <GlassCard hierarchy="primary">
              <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
                Total Trades
              </div>
              <div style={{ fontSize: "2.4rem", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: "var(--text-primary)" }}>
                {bSummary.total_trades}
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>{bSummary.survivorship_flags} survivorship flags</div>
            </GlassCard>

            {/* Turnover */}
            <GlassCard hierarchy="primary">
              <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
                Turnover
              </div>
              <div style={{ fontSize: "2.4rem", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: "var(--text-primary)" }}>
                {(bSummary.portfolio_turnover_annualized * 100).toFixed(0)}%
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>Annualised</div>
            </GlassCard>

            {/* Positions */}
            <GlassCard hierarchy="primary">
              <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
                Open Positions
              </div>
              <div style={{ fontSize: "2.4rem", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: "var(--text-primary)" }}>
                {summary.n_positions}
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>Filing lag {bSummary.filing_lag_days}d · fill delay {bSummary.fill_delay_days}d</div>
            </GlassCard>
          </div>
        </div>
      </RevealContainer>

      {/* ── 2. Performance by regime ────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <RegimePerformance metricsByRegime={metrics_by_regime} />
      </RevealContainer>

      {/* ── 3. Top holdings ─────────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <GlassCard hierarchy="primary">
          <SectionHeader title="Top Holdings" description="Ranked by mean forward return across the trade ledger" />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["#", "CUSIP", "Mean Return"].map((h, i) => (
                    <th key={h} style={{ padding: "0.4rem 0.75rem", textAlign: i <= 1 ? "left" : "right", fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {top_holdings.map((h) => (
                  <tr key={h.rank}>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{h.rank}</td>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem", fontWeight: 700, fontFamily: "monospace" }}>{h.cusip}</td>
                    <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontSize: "0.82rem", fontVariantNumeric: "tabular-nums", color: returnColor(h.mean_return) }}>{fmtPct(h.mean_return, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", lineHeight: 1.5, margin: "0.75rem 0 0" }}>
            Ticker did not resolve for these CUSIPs in this run; see the Provenance gate on the Validation page for
            the current CUSIP-to-ticker resolution rate.
          </p>
        </GlassCard>
      </RevealContainer>

      {/* ── 4. Factor attribution ──────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <GlassCard hierarchy="primary">
          <SectionHeader
            title="Fama-French 5-Factor + Momentum Attribution"
            description="Regresses trade returns against systematic risk factors to isolate alpha."
          />
          {factor_attribution.status === "skipped" ? (
            <div style={{
              borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)",
              backgroundColor: "rgba(255,255,255,0.02)", padding: "1rem 1.2rem",
              display: "flex", alignItems: "center", gap: "0.75rem",
            }}>
              <span style={{ fontSize: "1.1rem" }}>⊘</span>
              <div>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.2rem" }}>
                  Skipped: not enough data
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
                  {factor_attribution.trades_survived ?? 0} of {factor_attribution.total_ledger ?? 0} ledger trades
                  survived the factor-regression join. A regression needs materially more observations than
                  regressors (6 factors) to produce a stable estimate, so this run does not compute alpha or R².
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
              <MetricTile label="Annualised Alpha" value={factor_attribution.annualized_alpha_bps !== null ? `${factor_attribution.annualized_alpha_bps} bps` : "not available"} />
              <MetricTile label="R²" value={factor_attribution.r_squared !== null ? `${(factor_attribution.r_squared * 100).toFixed(1)}%` : "not available"} />
            </div>
          )}
        </GlassCard>
      </RevealContainer>

      {/* ── 5. Capacity ─────────────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.15}>
        <CapacityCurve points={capacity} />
      </RevealContainer>

      {/* ── 6. Signal decay ─────────────────────────────────────────────────────── */}
      {allHorizonDecay.length > 0 && (
        <RevealContainer threshold={0.15}>
          <GlassCard hierarchy="secondary">
            <SectionHeader
              title="Signal Decay"
              description={`Information coefficient of the RACS score against forward returns, across holding horizons. Half-life: ${signal_decay.half_life_days} days.`}
            />
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${allHorizonDecay.length}, 1fr)`, gap: "0.75rem" }}>
              {allHorizonDecay.map((d) => (
                <div key={d.horizon_days} style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.02)", padding: "0.6rem 0.75rem", textAlign: "center" }}>
                  <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>{d.horizon_days}d</div>
                  <div style={{ fontSize: "1rem", fontWeight: 700, fontFamily: "monospace", color: d.ic >= 0 ? "#10b981" : "#ef4444" }}>{d.ic.toFixed(3)}</div>
                  <div style={{ fontSize: "0.58rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>p = {d.ic_pvalue.toFixed(2)} · n = {d.n_obs}</div>
                </div>
              ))}
            </div>
          </GlassCard>
        </RevealContainer>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <PortfolioContent />
    </Suspense>
  );
}
