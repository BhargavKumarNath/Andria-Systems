"use client";

import React, { useState } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import type { UmapPoint, ArchetypeMeta } from "@/lib/loaders";
import { ARCHETYPE_COLORS } from "@/lib/taxonomy";

interface Props {
  points: UmapPoint[];
  archetypes: ArchetypeMeta[];
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as UmapPoint;
  const color = ARCHETYPE_COLORS[d.archetype_label] ?? "#a1a1aa";
  return (
    <div style={{
      background: "rgba(10,10,12,0.92)",
      border: `1px solid ${color}44`,
      borderRadius: 8,
      padding: "0.6rem 0.9rem",
      fontSize: "0.8rem",
      backdropFilter: "blur(12px)",
    }}>
      <div style={{ color, fontWeight: 700, marginBottom: 4 }}>{d.archetype_label}</div>
      <div style={{ color: "var(--text-secondary)" }}>
        ({d.umap_x.toFixed(2)}, {d.umap_y.toFixed(2)})
      </div>
    </div>
  );
}

export default function UmapScatter({ points, archetypes }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggle = (label: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });

  const visible = points.filter((p) => !hidden.has(p.archetype_label));

  const grouped = archetypes.reduce<Record<string, UmapPoint[]>>((acc, a) => {
    acc[a.archetype_label] = visible.filter((p) => p.archetype_label === a.archetype_label);
    return acc;
  }, {});
  grouped["Noise"] = visible.filter((p) => p.archetype_label === "Noise");

  return (
    <div>
      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {[...archetypes, { archetype_label: "Noise", count: 0, pct: 0 }].map((a) => {
          const color = ARCHETYPE_COLORS[a.archetype_label] ?? "#4b5563";
          const isHidden = hidden.has(a.archetype_label);
          return (
            <button
              key={a.archetype_label}
              onClick={() => toggle(a.archetype_label)}
              style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                padding: "0.4rem 0.85rem",
                borderRadius: 20,
                border: `1px solid ${isHidden ? "rgba(255,255,255,0.1)" : color + "66"}`,
                background: isHidden ? "transparent" : `${color}18`,
                color: isHidden ? "var(--text-secondary)" : color,
                fontSize: "0.8rem", fontWeight: 600,
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: isHidden ? "#4b5563" : color, display: "inline-block" }} />
              {a.archetype_label}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={420}>
        <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: -20 }}>
          <XAxis type="number" dataKey="umap_x" name="UMAP-1" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis type="number" dataKey="umap_y" name="UMAP-2" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.1)" }} />
          {Object.entries(grouped).map(([label, pts]) => {
            const color = ARCHETYPE_COLORS[label] ?? "#4b5563";
            return (
              <Scatter key={label} data={pts} fill={color} opacity={label === "Noise" ? 0.25 : 0.7}>
                {pts.map((_, i) => (
                  <Cell key={i} fill={color} />
                ))}
              </Scatter>
            );
          })}
        </ScatterChart>
      </ResponsiveContainer>
      <div style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
        {visible.length.toLocaleString()} of {points.length.toLocaleString()} managers shown &nbsp;·&nbsp; UMAP(n_components=2, n_neighbors=15)
      </div>
    </div>
  );
}
