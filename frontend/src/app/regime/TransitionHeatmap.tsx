"use client";

import React, { useState } from "react";
import { REGIME_COLORS, REGIME_LABELS } from "@/lib/taxonomy";

/* Maps 0-1 probability to a 2-char hex opacity string */
function opHex(v: number): string {
  return Math.round((0.06 + v * 0.74) * 255)
    .toString(16)
    .padStart(2, "0");
}

interface Props {
  labels: string[];
  matrix: number[][];
}

export default function TransitionHeatmap({ labels, matrix }: Props) {
  const [hovered, setHovered] = useState<[number, number] | null>(null);

  return (
    <div>
      {/* Column header row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `140px repeat(${labels.length}, 1fr)`,
          gap: 6,
          marginBottom: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
          <span style={{ fontSize: "0.6rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            from ↓ / to →
          </span>
        </div>
        {labels.map((l) => {
          const color = REGIME_COLORS[l] ?? "#a1a1aa";
          return (
            <div
              key={l}
              style={{
                textAlign: "center",
                padding: "0.4rem 0.25rem",
                borderRadius: 6,
                backgroundColor: `${color}12`,
                border: `1px solid ${color}25`,
              }}
            >
              <span style={{ fontSize: "0.62rem", fontWeight: 700, color, letterSpacing: "0.05em" }}>
                {REGIME_LABELS[l] ?? l}
              </span>
            </div>
          );
        })}
      </div>

      {/* Matrix rows */}
      {matrix.map((row, ri) => {
        const rowColor = REGIME_COLORS[labels[ri]] ?? "#a1a1aa";
        return (
          <div
            key={ri}
            style={{
              display: "grid",
              gridTemplateColumns: `140px repeat(${labels.length}, 1fr)`,
              gap: 6,
              marginBottom: 6,
            }}
          >
            {/* Row label */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                paddingRight: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: rowColor,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: "0.72rem", fontWeight: 600, color: rowColor }}>
                  {REGIME_LABELS[labels[ri]] ?? labels[ri]}
                </span>
              </div>
            </div>

            {/* Cells */}
            {row.map((v, ci) => {
              const isDiag = ri === ci;
              const isHov = hovered?.[0] === ri && hovered?.[1] === ci;
              const bgColor = `${rowColor}${opHex(v)}`;
              const pct = Math.round(v * 100);

              return (
                <div
                  key={ci}
                  onMouseEnter={() => setHovered([ri, ci])}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "1rem 0.5rem",
                    borderRadius: 10,
                    backgroundColor: bgColor,
                    border: isDiag
                      ? `2px solid ${rowColor}90`
                      : isHov
                      ? `1px solid ${rowColor}50`
                      : "1px solid transparent",
                    cursor: "default",
                    transition: "transform 0.15s, border 0.15s",
                    transform: isHov ? "scale(1.06)" : "scale(1)",
                    position: "relative",
                  }}
                >
                  <span
                    style={{
                      fontSize: isDiag ? "1.15rem" : "0.95rem",
                      fontWeight: isDiag ? 800 : v >= 0.2 ? 600 : 400,
                      fontVariantNumeric: "tabular-nums",
                      color: isDiag ? rowColor : v >= 0.2 ? "#ffffff" : "rgba(255,255,255,0.5)",
                    }}
                  >
                    {pct}%
                  </span>
                  {isDiag && (
                    <div
                      style={{
                        position: "absolute",
                        top: 5,
                        right: 7,
                        fontSize: "0.52rem",
                        color: rowColor,
                        opacity: 0.7,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                      }}
                    >
                      SELF
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Legend row */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
          flexWrap: "wrap",
          paddingTop: 12,
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 28, height: 18, borderRadius: 4, background: "linear-gradient(90deg, rgba(138,43,226,0.08), rgba(138,43,226,0.8))" }} />
          <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Low → High probability</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 18, height: 18, borderRadius: 4, border: "2px solid rgba(138,43,226,0.8)", backgroundColor: "rgba(138,43,226,0.4)" }} />
          <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Diagonal = self-persistence (stay in same regime)</span>
        </div>
        <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginLeft: "auto" }}>
          Each row sums to 100%
        </span>
      </div>
    </div>
  );
}
