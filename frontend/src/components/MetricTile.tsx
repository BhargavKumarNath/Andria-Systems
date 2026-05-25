import React from "react";
import "./MetricTile.css";

interface MetricTileProps {
  label: string;
  value: string | number;
  delta?: { value: number; type: "positive" | "negative" | "neutral" };
  isHero?: boolean;
}

export default function MetricTile({ label, value, delta, isHero = false }: MetricTileProps) {
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
    </div>
  );
}
