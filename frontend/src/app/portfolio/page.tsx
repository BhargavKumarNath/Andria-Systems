import React, { Suspense } from "react";
import { getPortfolioData, getBacktestData } from "@/lib/loaders";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";
import MetricTile from "@/components/MetricTile";
import FactorChart from "./FactorChart";
import MetricGlossary from "./MetricGlossary";
import { REGIME_COLORS } from "@/lib/taxonomy";

function Skeleton() {
  return <div className="skeleton-shimmer" style={{ width: "100%", height: 500 }} />;
}

function ExposureBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(Math.abs(value) / max * 100, 100);
  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
        <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{label}</span>
        <span style={{ fontSize: "0.82rem", fontWeight: 600, color }}>{(value * 100).toFixed(0)}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.06)" }}>
        <div style={{ height: "100%", borderRadius: 3, background: color, width: `${pct}%`, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
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
            This is a <strong style={{ color: "var(--text-primary)" }}>simulated portfolio</strong> — not a live traded book.
            It shows how a strategy that mechanically follows the top RACS signals would have performed,
            after realistic transaction costs and execution constraints.
          </p>
        </div>

        {/* Step list — matches DNA page pattern */}
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

/* ─── Variance Decomposition ─────────────────────────────────────────────────── */
function VarianceDecomposition({
  marketVar, factorVar, idiosyncraticVar,
}: { marketVar: number; factorVar: number; idiosyncraticVar: number }) {
  const total = marketVar + factorVar + idiosyncraticVar || 1;
  const segments = [
    { label: "Market β", value: marketVar, color: "#3b82f6" },
    { label: "Other factors", value: factorVar, color: "#f59e0b" },
    { label: "Idiosyncratic", value: idiosyncraticVar, color: "#10b981" },
  ];
  const idioRatio = (idiosyncraticVar / total) * 100;

  return (
    <div style={{
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.07)",
      backgroundColor: "rgba(255,255,255,0.02)",
      padding: "0.85rem 1.1rem",
      marginBottom: "1.25rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.7rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            Variance Decomposition
          </span>
          <span style={{
            fontSize: "0.6rem", padding: "0.1rem 0.45rem", borderRadius: 4,
            backgroundColor: "rgba(16,185,129,0.12)", color: "#10b981", fontWeight: 700,
          }}>
            {idioRatio.toFixed(0)}% idiosyncratic
          </span>
        </div>
        <div style={{ display: "flex", gap: "1rem" }}>
          {segments.map(({ label, color, value }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
              <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>{label}</span>
              <span style={{ fontSize: "0.65rem", fontWeight: 700, color, fontFamily: "monospace" }}>
                {((value / total) * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Stacked bar */}
      <div style={{ height: 10, borderRadius: 5, overflow: "hidden", display: "flex", gap: 1 }}>
        {segments.map(({ label, value, color }) => {
          const pct = (value / total) * 100;
          return (
            <div key={label} style={{
              width: `${pct}%`, height: "100%",
              background: color,
              opacity: 0.8,
              transition: "width 0.5s ease",
              boxShadow: `0 0 6px ${color}50`,
            }} />
          );
        })}
      </div>

      <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", lineHeight: 1.5, margin: "0.55rem 0 0" }}>
        High idiosyncratic variance (green) means the strategy&apos;s returns are not explained by market or factor exposure — evidence of stock-selection skill rather than a beta bet.
      </p>
    </div>
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

async function PortfolioContent() {
  const [portfolio, backtest] = await Promise.all([getPortfolioData(), getBacktestData()]);
  const { summary, top_holdings, costs, factor_risk } = portfolio;
  const { factor_attribution, capacity, summary: bSummary } = backtest;

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

      {/* ── 1. Hero KPIs (now with semantic color) ────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem" }}>

          {/* Sharpe */}
          <GlassCard hierarchy="primary">
            <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
              Annualised Sharpe
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem" }}>
              <div style={{
                fontSize: "2.9rem", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1,
                color: sharpeColor(bSummary.annualized_sharpe),
              }}>
                {bSummary.annualized_sharpe.toFixed(3)}
              </div>
              <span style={{
                fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: 4,
                backgroundColor: `${sharpeColor(bSummary.annualized_sharpe)}18`,
                color: sharpeColor(bSummary.annualized_sharpe),
              }}>
                {bSummary.annualized_sharpe >= 1.5 ? "Strong" : bSummary.annualized_sharpe >= 1.0 ? "Acceptable" : "Weak"}
              </span>
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
              Target ≥ 1.0 · ≥ 1.5 = strong
            </div>
          </GlassCard>

          {/* Annual Return */}
          <GlassCard hierarchy="primary">
            <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
              Annual Return
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem" }}>
              <div style={{
                fontSize: "2.9rem", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1,
                color: returnColor(bSummary.annualized_return),
              }}>
                {bSummary.annualized_return >= 0 ? "+" : ""}{(bSummary.annualized_return * 100).toFixed(1)}%
              </div>
              <span style={{
                fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: 4,
                backgroundColor: `${returnColor(bSummary.annualized_return)}18`,
                color: returnColor(bSummary.annualized_return),
              }}>
                {bSummary.annualized_return >= 0 ? "Positive" : "Negative"}
              </span>
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
              Annualised, after costs &amp; lag
            </div>
          </GlassCard>

          {/* Max Drawdown */}
          <GlassCard hierarchy="primary">
            <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
              Max Drawdown
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem" }}>
              <div style={{
                fontSize: "2.9rem", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1,
                color: drawdownColor(bSummary.max_drawdown),
              }}>
                {(bSummary.max_drawdown * 100).toFixed(1)}%
              </div>
              <span style={{
                fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: 4,
                backgroundColor: `${drawdownColor(bSummary.max_drawdown)}18`,
                color: drawdownColor(bSummary.max_drawdown),
              }}>
                {Math.abs(bSummary.max_drawdown) <= 0.05 ? "Contained" : Math.abs(bSummary.max_drawdown) <= 0.15 ? "Moderate" : "Deep"}
              </span>
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
              Worst peak-to-trough · negative = loss
            </div>
          </GlassCard>
        </div>
      </RevealContainer>

      {/* ── 2. Exposure + holdings grid ───────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "1.5rem" }}>
          {/* Exposure */}
          <GlassCard hierarchy="primary">
            <SectionHeader title="Portfolio Exposure" description="Latest snapshot" />
            <ExposureBar label="Gross Exposure" value={summary.gross_exposure} max={2.5} color="#8a2be2" />
            <ExposureBar label="Net Exposure" value={summary.net_exposure} max={1} color="#10b981" />
            <ExposureBar label="Estimated Turnover" value={summary.estimated_turnover} max={2} color="#3b82f6" />
            <ExposureBar label="Cash Drag" value={summary.cash_drag} max={0.1} color="#f59e0b" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginTop: "1.25rem" }}>
              {[
                { label: "Positions", value: summary.n_positions },
                { label: "Long", value: summary.n_long },
                { label: "Short", value: summary.n_short },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{value}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Top holdings */}
          <GlassCard hierarchy="primary">
            <SectionHeader title="Top Holdings" description="Ranked by RACS regime-adjusted conviction score" />
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["#", "Ticker", "Weight", "RACS", "Regime"].map((h, i) => (
                      <th key={h} style={{ padding: "0.4rem 0.75rem", textAlign: i <= 1 ? "left" : "right", fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {top_holdings.map((h) => {
                    const rColor = REGIME_COLORS[h.regime_label] ?? "#a1a1aa";
                    return (
                      <tr key={h.rank}>
                        <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{h.rank}</td>
                        <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.9rem", fontWeight: 700, fontFamily: "monospace" }}>{h.ticker}</td>
                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontSize: "0.82rem", fontVariantNumeric: "tabular-nums" }}>{(h.weight * 100).toFixed(2)}%</td>
                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontSize: "0.82rem", fontVariantNumeric: "tabular-nums", color: "#8a2be2" }}>{h.racs_score.toFixed(4)}</td>
                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>
                          <span style={{ padding: "0.15rem 0.5rem", borderRadius: 3, fontSize: "0.7rem", fontWeight: 600, backgroundColor: `${rColor}20`, color: rColor }}>
                            {h.regime_label.replace(/_/g, " ")}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      </RevealContainer>

      {/* ── 3. Factor attribution ──────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <GlassCard hierarchy="primary">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
            <SectionHeader
              title="Fama-French 5-Factor + Momentum Attribution"
              description={factor_attribution.detail}
            />
            <div style={{ display: "flex", gap: "1.5rem", flexShrink: 0 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>Alpha (α)</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#10b981" }}>+{(factor_attribution.alpha_annualized * 100).toFixed(1)}%</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>t-stat {factor_attribution.alpha_t_stat.toFixed(2)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>R²</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{(factor_attribution.r_squared * 100).toFixed(1)}%</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>low factor loading</div>
              </div>
            </div>
          </div>

          {/* Variance Decomposition (NEW) */}
          <VarianceDecomposition
            marketVar={factor_risk.market_var}
            factorVar={factor_risk.factor_var}
            idiosyncraticVar={factor_risk.idiosyncratic_var}
          />

          <FactorChart attribution={factor_attribution as unknown as Record<string, number>} />
        </GlassCard>
      </RevealContainer>

      {/* ── 4. Capacity + costs ────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.15}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          <GlassCard hierarchy="secondary">
            <SectionHeader title="Capacity Analysis" description={capacity.detail} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.5rem" }}>
              <MetricTile label="Full Capacity" value={`$${(capacity.estimated_capacity_usd / 1e6).toFixed(0)}M`} />
              <MetricTile label="ADV Cliff" value={`$${(capacity.adv_cliff_at_aum_usd / 1e6).toFixed(0)}M`} />
              <MetricTile label="Participation Limit" value={`${capacity.adv_participation_limit_pct}% ADV`} />
              <MetricTile label="Total Trades" value={bSummary.total_trades.toLocaleString()} />
            </div>
          </GlassCard>
          <GlassCard hierarchy="secondary">
            <SectionHeader title="Execution Model" description="Transaction cost and realism parameters applied to the backtest engine" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.5rem" }}>
              <MetricTile label="Large-Cap Cost" value={`${costs.large_cap_bps} bps`} />
              <MetricTile label="Small-Cap Cost" value={`${costs.small_cap_bps} bps`} />
              <MetricTile label="Filing Lag" value={`${costs.filing_lag_days}d`} />
              <MetricTile label="Hold Period" value={`${costs.holding_period_days}d`} />
            </div>
          </GlassCard>
        </div>
      </RevealContainer>
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
