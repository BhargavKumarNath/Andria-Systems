"use client";

import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  ReferenceLine, ResponsiveContainer,
} from "recharts";

interface FactorRow { name: string; value: number }

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as FactorRow;
  const pos = d.value >= 0;
  return (
    <div style={{
      background: "rgba(10,10,12,0.92)",
      border: `1px solid ${pos ? "#10b98144" : "#ef444444"}`,
      borderRadius: 8,
      padding: "0.6rem 0.9rem",
      fontSize: "0.82rem",
      backdropFilter: "blur(12px)",
    }}>
      <div style={{ color: "var(--text-secondary)", marginBottom: 2 }}>{d.name}</div>
      <div style={{ color: pos ? "#10b981" : "#ef4444", fontWeight: 700 }}>
        {d.value >= 0 ? "+" : ""}{(d.value * 100).toFixed(2)}%
      </div>
    </div>
  );
}

export default function FactorChart({ attribution }: { attribution: Record<string, number> }) {
  const labels: Record<string, string> = {
    alpha_annualized: "Alpha (α)",
    market_beta: "Market (β)",
    smb: "SMB",
    hml: "HML",
    rmw: "RMW",
    cma: "CMA",
    mom: "Momentum",
  };

  const data: FactorRow[] = Object.entries(labels)
    .filter(([k]) => k in attribution)
    .map(([k, name]) => ({ name, value: attribution[k] }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -8, bottom: 0 }} barCategoryGap="20%">
        <XAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#a1a1aa", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.value >= 0 ? "#10b981" : "#ef4444"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
