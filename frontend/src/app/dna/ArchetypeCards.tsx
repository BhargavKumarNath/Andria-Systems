"use client";

import React, { useState } from "react";
import type { ArchetypeMeta } from "@/lib/loaders";
import { ARCHETYPE_COLORS } from "@/lib/taxonomy";

/* ─── Rich detail for each archetype ────────────────────────────────────────── */
const ARCHETYPE_DETAIL: Record<string, {
  who: string;
  tradingStyle: string;
  signalPower: string;
  signatures: string[];
}> = {
  "Conviction Activists": {
    who: "The most influential players in the 13F universe. These institutions take large, concentrated positions specifically to force strategic change: board reshuffling, spinoffs, buybacks, divestitures. They file a 13D form when crossing the 5% ownership threshold, triggering mandatory public disclosure. Think Pershing Square, Elliott Management, or ValueAct Capital.",
    tradingStyle: "Extremely low turnover: they do not trade, they accumulate and hold. Position sizes grow over multiple quarters as conviction builds. Holding duration is often 12-36 months. Portfolios are small in number of holdings (highly concentrated) but very large in per-position AUM. New position entries are rare and well-researched.",
    signalPower: "The highest-weight segment in RACS. Every additional activist buyer in a stock adds meaningfully to the log(activist_buyers + 1.1) term. A stock where five independent Conviction Activists are simultaneously accumulating is the strongest signal this platform can generate; it means multiple sophisticated, long-horizon investors have independently concluded the stock is significantly mispriced.",
    signatures: ["Low avg_turnover", "High avg_conviction_delta", "Low exit_rate", "High avg_holding_duration_qtrs", "Low n_holdings (concentrated)", "Low new_position_rate"],
  },
  "Index Huggers": {
    who: "The largest asset managers on earth: Vanguard, BlackRock, State Street, Fidelity. They hold virtually every publicly traded stock in proportion to its index weight. Their 13F filings are enormous and span thousands of securities, but individual holdings carry almost no active decision-making signal. They buy because a stock is in the index, not because they believe it is mispriced.",
    tradingStyle: "Near-zero turnover: positions only change when index composition changes (e.g., Russell reconstitution, S&P inclusions/exclusions). Thousands of holdings per quarter, minimal conviction delta, extremely predictable filing patterns. Very low filing lag because they have large compliance teams. They vote on virtually every shareholder proposal (high shared_vote_ratio).",
    signalPower: "Individual Index Hugger presence in a stock carries near-zero incremental RACS weight; they hold everything by definition. However, anomalies matter: an Index Hugger overweighting a stock beyond its index weight, or trimming below weight, signals an active portfolio management decision. These deviations are captured in the conviction_delta feature.",
    signatures: ["Very high n_holdings", "Very low avg_turnover", "Very low avg_conviction_delta", "High shared_vote_ratio", "Low new_position_rate", "Low aum_volatility"],
  },
  "Macro Tourists": {
    who: "Global macro hedge funds, multi-strategy funds, and thematic ETF managers that rotate rapidly in and out of equity positions based on top-down economic views: interest rate cycle positioning, commodity supercycles, geopolitical risk themes, currency plays. They have no long-term loyalty to individual companies; their unit of analysis is the macro theme, not the stock.",
    tradingStyle: "Very high turnover: they enter and exit within 1-3 quarters. High new position rate and high exit rate simultaneously (constant churn). Heavy use of options and derivatives alongside equity (high options_notional_ratio). Sector concentration shifts dramatically quarter-to-quarter based on whatever macro theme is dominant. AUM can be very volatile due to performance fees and redemptions.",
    signalPower: "The RACS crowding penalty is specifically calibrated against Macro Tourist dominance. Their presence inflates apparent consensus_weight; they push the same macro trade simultaneously, but this does not represent genuine fundamental conviction. When macro themes reverse, Macro Tourists exit in unison, causing sharp price dislocations. RACS penalises stocks where this archetype dominates the buyer base.",
    signatures: ["Very high avg_turnover", "High new_position_rate", "High exit_rate", "Low avg_holding_duration_qtrs", "High options_notional_ratio", "High aum_volatility"],
  },
  "Nimble Traders": {
    who: "Fundamentals-driven active managers at mid-sized hedge funds and long/short equity shops that identify mispricings and move quickly when a catalyst materialises: earnings beats, FDA drug approvals, management changes, M&A rumours, or activist 13D disclosures. They buy on catalyst and sell once the thesis plays out. Think mid-tier hedge funds running concentrated 20-50 name books.",
    tradingStyle: "Moderate-to-high turnover. Entry decisions are decisive (high conviction delta on new positions) but exits are also disciplined; once the thesis matures or fails, they move on. Holding duration is medium (2-6 quarters). They often enter positions that later attract Conviction Activists, making them useful early-indicator signals. Portfolio size is moderate.",
    signalPower: "Nimble Traders frequently enter a stock 1-2 quarters before a Conviction Activist discloses. Detecting their accumulation before the activist 13D filing provides a meaningful timing edge. The log(activist_buyers + 1.1) term in RACS partially captures this sequencing; a stock with Nimble Traders building plus one incoming Conviction Activist generates very high scores.",
    signatures: ["Moderate avg_turnover", "High avg_conviction_delta (on entry)", "Moderate avg_holding_duration_qtrs", "Moderate new_position_rate", "Moderate n_holdings"],
  },
};

/* ─── Expanded detail panel ──────────────────────────────────────────────────── */
function ExpandedPanel({ archetype, color, onClose }: {
  archetype: ArchetypeMeta;
  color: string;
  onClose: () => void;
}) {
  const detail = ARCHETYPE_DETAIL[archetype.archetype_label];
  if (!detail) return null;

  return (
    <div style={{
      gridColumn: "1 / -1",
      borderRadius: 14,
      border: `1px solid ${color}30`,
      backgroundColor: `${color}06`,
      overflow: "hidden",
      animation: "expandIn 0.25s cubic-bezier(0.16,1,0.3,1) both",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0.9rem 1.4rem",
        borderBottom: `1px solid ${color}20`,
        backgroundColor: `${color}0a`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%",
            backgroundColor: color,
            boxShadow: `0 0 8px ${color}80`,
          }} />
          <span style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)" }}>
            {archetype.archetype_label}
          </span>
          <span style={{
            padding: "0.15rem 0.55rem", borderRadius: 4,
            fontSize: "0.7rem", fontWeight: 600, fontFamily: "monospace",
            backgroundColor: `${color}18`, color,
          }}>
            {archetype.count.toLocaleString()} managers · {(archetype.pct * 100).toFixed(1)}%
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-muted)", fontSize: "1rem",
            padding: "0.25rem 0.45rem", borderRadius: 6,
            transition: "color 0.15s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          ✕
        </button>
      </div>

      {/* Three columns */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: `1px solid ${color}12` }}>
        {[
          { icon: "◈", label: "Who they are", text: detail.who },
          { icon: "◉", label: "Trading style", text: detail.tradingStyle },
          { icon: "◎", label: "Signal power in RACS", text: detail.signalPower },
        ].map(({ icon, label, text }, i) => (
          <div key={label} style={{
            padding: "1.1rem 1.3rem",
            borderRight: i < 2 ? `1px solid ${color}12` : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.6rem" }}>
              <span style={{ fontSize: "0.7rem", color }}>{icon}</span>
              <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color }}>
                {label}
              </span>
            </div>
            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>
              {text}
            </p>
          </div>
        ))}
      </div>

      {/* Behavioral signatures */}
      <div style={{ padding: "0.8rem 1.3rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-muted)", flexShrink: 0 }}>
          Behavioral signatures
        </span>
        {detail.signatures.map((sig) => (
          <span key={sig} style={{
            padding: "0.15rem 0.5rem", borderRadius: 4,
            fontSize: "0.7rem", fontFamily: "monospace", fontWeight: 600,
            backgroundColor: `${color}12`, color,
            border: `1px solid ${color}25`,
          }}>
            {sig}
          </span>
        ))}
      </div>

      <style>{`
        @keyframes expandIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/* ─── Single archetype card ──────────────────────────────────────────────────── */
function ArchetypeCard({ archetype, active, onClick }: {
  archetype: ArchetypeMeta;
  active: boolean;
  onClick: () => void;
}) {
  const color = ARCHETYPE_COLORS[archetype.archetype_label] ?? "#a1a1aa";

  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left", cursor: "pointer",
        padding: "1.4rem", borderRadius: 14,
        backgroundColor: active ? `${color}12` : `${color}07`,
        border: `1px solid ${active ? color + "50" : color + "22"}`,
        boxShadow: active ? `0 0 0 1px ${color}25, 0 4px 24px ${color}12` : "none",
        transform: active ? "translateY(-2px)" : "none",
        transition: "all 0.22s cubic-bezier(0.16,1,0.3,1)",
        width: "100%",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = `${color}10`;
          e.currentTarget.style.borderColor = `${color}38`;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = `${color}07`;
          e.currentTarget.style.borderColor = `${color}22`;
        }
      }}
    >
      {/* Top row: badge + count */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
        <div>
          <div style={{
            display: "inline-block", padding: "0.18rem 0.6rem",
            borderRadius: 4, fontSize: "0.65rem", fontWeight: 700,
            letterSpacing: "0.06em", textTransform: "uppercase",
            backgroundColor: `${color}18`, color,
            border: `1px solid ${color}35`, marginBottom: "0.45rem",
          }}>
            Archetype {archetype.cluster_id}
          </div>
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)" }}>
            {archetype.archetype_label}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.03em", color }}>
            {archetype.count.toLocaleString()}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
            {(archetype.pct * 100).toFixed(1)}% of universe
          </div>
        </div>
      </div>

      {/* Short description */}
      <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 0.85rem" }}>
        {archetype.description}
      </p>

      {/* Share bar */}
      <div style={{ height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.07)", marginBottom: "0.6rem" }}>
        <div style={{ height: "100%", borderRadius: 2, background: color, width: `${archetype.pct * 100}%`, transition: "width 0.5s ease" }} />
      </div>

      {/* Click hint */}
      <div style={{
        fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.07em",
        color: active ? color : "rgba(255,255,255,0.2)",
        transition: "color 0.2s ease",
        textTransform: "uppercase",
      }}>
        {active ? "▲ Collapse" : "▼ Deep dive"}
      </div>
    </button>
  );
}

/* ─── Main export ────────────────────────────────────────────────────────────── */
export default function ArchetypeCards({ archetypes }: { archetypes: ArchetypeMeta[] }) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const toggle = (i: number) => setActiveIdx((prev) => (prev === i ? null : i));

  // Render in 2-column grid with expanded panels inserted after each row
  const row0 = archetypes.slice(0, 2);
  const row1 = archetypes.slice(2, 4);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      {/* Row 0 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.85rem" }}>
        {row0.map((a, i) => (
          <ArchetypeCard key={a.archetype_label} archetype={a} active={activeIdx === i} onClick={() => toggle(i)} />
        ))}
        {activeIdx !== null && activeIdx < 2 && (
          <ExpandedPanel
            archetype={archetypes[activeIdx]}
            color={ARCHETYPE_COLORS[archetypes[activeIdx].archetype_label] ?? "#a1a1aa"}
            onClose={() => setActiveIdx(null)}
          />
        )}
      </div>

      {/* Row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.85rem" }}>
        {row1.map((a, i) => (
          <ArchetypeCard key={a.archetype_label} archetype={a} active={activeIdx === i + 2} onClick={() => toggle(i + 2)} />
        ))}
        {activeIdx !== null && activeIdx >= 2 && (
          <ExpandedPanel
            archetype={archetypes[activeIdx]}
            color={ARCHETYPE_COLORS[archetypes[activeIdx].archetype_label] ?? "#a1a1aa"}
            onClose={() => setActiveIdx(null)}
          />
        )}
      </div>
    </div>
  );
}
