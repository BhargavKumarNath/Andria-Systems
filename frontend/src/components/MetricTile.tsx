import React from "react";
import "./MetricTile.css";

interface MetricTileProps {
  label: string;
  value: string | number;
  delta?: { value: number; type: "positive" | "negative" | "neutral" };
  sub?: string;
  isHero?: boolean;
}

export default function MetricTile({ label, value, delta, sub, isHero = false }: MetricTileProps) {
  const containerClass = isHero ? "metric-tile hero-tile" : "metric-tile standard-tile";

  return (
    <div className={containerClass}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {delta && (
        <div className={`metric-delta delta-${delta.type}`}>
          {delta.type === "positive" ? "+" : delta.type === "negative" ? "-" : ""}
          {delta.value}%
        </div>
      )}
      {sub && (
        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1.4, marginTop: "0.35rem" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
