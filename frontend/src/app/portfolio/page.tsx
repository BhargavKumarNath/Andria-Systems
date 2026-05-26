import React, { Suspense } from "react";
import { getPortfolioData, getBacktestData } from "@/lib/loaders";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";
import MetricTile from "@/components/MetricTile";
import FactorChart from "./FactorChart";
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

async function PortfolioContent() {
  const [portfolio, backtest] = await Promise.all([getPortfolioData(), getBacktestData()]);
  const { summary, top_holdings, costs, factor_risk } = portfolio;
  const { factor_attribution, capacity, summary: bSummary } = backtest;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>
      {/* Hero KPIs */}
      <RevealContainer threshold={0.1}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem" }}>
          <GlassCard hierarchy="primary">
            <MetricTile isHero label="Annualised Sharpe" value={bSummary.annualized_sharpe.toFixed(3)} />
          </GlassCard>
          <GlassCard hierarchy="primary">
            <MetricTile isHero label="Annual Return" value={`${(bSummary.annualized_return * 100).toFixed(1)}%`} />
          </GlassCard>
          <GlassCard hierarchy="primary">
            <MetricTile isHero label="Max Drawdown" value={`${(bSummary.max_drawdown * 100).toFixed(1)}%`} />
          </GlassCard>
        </div>
      </RevealContainer>

      {/* Exposure + holdings grid */}
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

      {/* Factor attribution */}
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
          <FactorChart attribution={factor_attribution as unknown as Record<string, number>} />
        </GlassCard>
      </RevealContainer>

      {/* Capacity + costs */}
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
