"use client";

import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { RegimePoint } from "@/lib/loaders";
import { REGIME_COLORS, REGIME_LABELS } from "@/lib/taxonomy";

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as RegimePoint & { label: string };
  const color = REGIME_COLORS[d.regime_label] ?? "#a1a1aa";
  return (
    <div style={{
      background: "rgba(10,10,12,0.92)",
      border: `1px solid ${color}55`,
      borderRadius: 8,
      padding: "0.7rem 1rem",
      fontSize: "0.82rem",
      backdropFilter: "blur(12px)",
    }}>
      <div style={{ color: "var(--text-secondary)", marginBottom: 4 }}>{d.date}</div>
      <div style={{ color, fontWeight: 700, marginBottom: 2 }}>
        {REGIME_LABELS[d.regime_label] ?? d.regime_label}
      </div>
      <div style={{ color: "var(--text-secondary)" }}>
        Confidence: {(d.regime_prob * 100).toFixed(0)}%
      </div>
    </div>
  );
}

export default function RegimeChart({ history }: { history: RegimePoint[] }) {
  const data = history.map((h) => ({
    ...h,
    label: h.date.slice(0, 7),
    prob_pct: Math.round(h.regime_prob * 100),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -24, bottom: 0 }} barCategoryGap="8%">
        <XAxis
          dataKey="label"
          tick={{ fill: "#a1a1aa", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval={3}
        />
        <YAxis
          tick={{ fill: "#a1a1aa", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <ReferenceLine y={80} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
        <Bar dataKey="prob_pct" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={REGIME_COLORS[d.regime_label] ?? "#a1a1aa"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
