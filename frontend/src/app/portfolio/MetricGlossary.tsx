"use client";

import React, { useState } from "react";

/* ─── Metric Glossary (client — needs hover state) ───────────────────────────── */
const GLOSSARY_ITEMS = [
  {
    icon: "◎",
    term: "Sharpe Ratio",
    short: "Risk-adjusted return",
    detail: "Annualised return divided by annualised volatility. Above 1.0 means the strategy earns more per unit of risk than a raw equity index. Above 1.5 is strong; above 2.0 is rare.",
    good: "> 1.0",
    color: "#10b981",
  },
  {
    icon: "▽",
    term: "Max Drawdown",
    short: "Worst peak-to-trough loss",
    detail: "The largest loss from any peak to the subsequent trough, expressed as a percentage. Negative numbers — a drawdown of −8% means the book fell 8% from its prior high before recovering.",
    good: "< −15%",
    color: "#ef4444",
  },
  {
    icon: "⇄",
    term: "Gross Exposure",
    short: "Σ |position sizes|",
    detail: "The total absolute value of all long and short positions as a fraction of NAV. 120% means for every $100 of capital, $120 of assets are held. Values above 100% imply leverage.",
    good: "≤ 150%",
    color: "#8a2be2",
  },
  {
    icon: "α",
    term: "Alpha (α)",
    short: "Return beyond factor models",
    detail: "The intercept from a Fama-French 5-factor + Momentum regression. Positive alpha means the strategy earned returns that cannot be explained by known systematic risk premia — evidence of genuine informational edge.",
    good: "> 0%",
    color: "#f59e0b",
  },
];

export default function MetricGlossary() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: "0.75rem",
    }}>
      {GLOSSARY_ITEMS.map(({ icon, term, short, detail, good, color }, i) => {
        const isOpen = expanded === i;
        return (
          <div
            key={term}
            onClick={() => setExpanded(isOpen ? null : i)}
            style={{
              borderRadius: 12,
              border: `1px solid ${isOpen ? color + "44" : "rgba(255,255,255,0.07)"}`,
              backgroundColor: isOpen ? `${color}0a` : "rgba(255,255,255,0.02)",
              padding: "0.9rem 1rem",
              cursor: "pointer",
              transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              userSelect: "none",
            }}
          >
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
              <span style={{
                fontSize: "1rem", color,
                width: 24, height: 24,
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 6,
                backgroundColor: `${color}18`,
                flexShrink: 0,
              }}>
                {icon}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-primary)" }}>{term}</div>
                <div style={{ fontSize: "0.63rem", color: "var(--text-muted)" }}>{short}</div>
              </div>
              <span style={{
                fontSize: "0.62rem", color: "var(--text-muted)",
                transform: isOpen ? "rotate(180deg)" : "none",
                transition: "transform 0.2s ease",
              }}>▾</span>
            </div>

            {/* Benchmark badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "0.3rem",
              padding: "0.12rem 0.45rem", borderRadius: 4,
              backgroundColor: `${color}14`, color,
              fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.06em",
              marginBottom: isOpen ? "0.65rem" : 0,
            }}>
              Target: {good}
            </div>

            {/* Expanded detail */}
            {isOpen && (
              <p style={{
                fontSize: "0.73rem", color: "var(--text-secondary)",
                lineHeight: 1.65, margin: 0,
              }}>
                {detail}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
