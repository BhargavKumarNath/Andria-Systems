"use client";

import React, { useState } from "react";
import { REGIME_COLORS, REGIME_LABELS } from "@/lib/taxonomy";

interface DistItem {
  regime_label: string;
  count: number;
  pct: number;
}

export default function RegimeDistributionBar({ distribution }: { distribution: DistItem[] }) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", height: 36, marginBottom: "0.9rem" }}>
      {distribution.map((d) => {
        const color = REGIME_COLORS[d.regime_label] ?? "#a1a1aa";
        const isHov = hovered === d.regime_label;
        return (
          <div
            key={d.regime_label}
            title={`${REGIME_LABELS[d.regime_label] ?? d.regime_label}: ${d.count} quarters (${(d.pct * 100).toFixed(0)}%)`}
            onMouseEnter={() => setHovered(d.regime_label)}
            onMouseLeave={() => setHovered(null)}
            style={{
              flex: d.pct,
              backgroundColor: color,
              opacity: isHov ? 1 : 0.82,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "opacity 0.2s",
              cursor: "default",
            }}
          >
            <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "#000", opacity: 0.7 }}>
              {(d.pct * 100).toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
