"use client";

import React, { useState, useMemo } from "react";
import type { RacsSignal } from "@/lib/loaders";
import { REGIME_COLORS, REGIME_LABELS } from "@/lib/taxonomy";

const COLUMNS = [
  { key: "rank",                  label: "#",            align: "right"  },
  { key: "ticker",                label: "Ticker",       align: "left"   },
  { key: "regime_adjusted_racs",  label: "RACS Score",   align: "left"   },
  { key: "activist_buyers",       label: "Activists",    align: "right"  },
  { key: "strong_buys",           label: "Strong Buys",  align: "right"  },
  { key: "crowding_penalty",      label: "Crowding",     align: "right"  },
  { key: "regime_label",          label: "Regime",       align: "left"   },
] as const;

type SortKey = (typeof COLUMNS)[number]["key"];

function RegimeBadge({ label }: { label: string }) {
  const color = REGIME_COLORS[label] ?? "#a1a1aa";
  const display = REGIME_LABELS[label] ?? label;
  return (
    <span style={{
      display: "inline-block",
      padding: "0.2rem 0.6rem",
      borderRadius: "4px",
      fontSize: "0.75rem",
      fontWeight: 600,
      letterSpacing: "0.03em",
      backgroundColor: `${color}22`,
      color,
      border: `1px solid ${color}44`,
      whiteSpace: "nowrap",
    }}>
      {display}
    </span>
  );
}

function RacsBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 160 }}>
      <div style={{
        flex: 1, height: 6, borderRadius: 3,
        backgroundColor: "rgba(255,255,255,0.08)",
        overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 3,
          background: "linear-gradient(90deg, #8a2be2, #a855f7)",
          transition: "width 0.4s ease",
        }} />
      </div>
      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", minWidth: 48, textAlign: "right" }}>
        {value.toFixed(4)}
      </span>
    </div>
  );
}

function CrowdingCell({ value }: { value: number }) {
  const pct = Math.min(value * 100, 100);
  const color = pct < 20 ? "#10b981" : pct < 40 ? "#f59e0b" : "#ef4444";
  return (
    <span style={{ color, fontVariantNumeric: "tabular-nums" }}>
      {pct.toFixed(1)}%
    </span>
  );
}

export default function SignalsTable({ signals }: { signals: RacsSignal[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("regime_adjusted_racs");
  const [sortAsc, setSortAsc] = useState(false);

  const maxRacs = useMemo(
    () => Math.max(...signals.map((s) => s.regime_adjusted_racs)),
    [signals],
  );

  const sorted = useMemo(() => {
    return [...signals].sort((a, b) => {
      const av = a[sortKey as keyof RacsSignal] as number | string;
      const bv = b[sortKey as keyof RacsSignal] as number | string;
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortAsc ? cmp : -cmp;
    });
  }, [signals, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((p) => !p);
    else { setSortKey(key); setSortAsc(false); }
  };

  const thStyle = (align: string): React.CSSProperties => ({
    padding: "0.75rem 1rem",
    textAlign: align as React.CSSProperties["textAlign"],
    fontSize: "0.72rem",
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-secondary)",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    background: "rgba(0,0,0,0.2)",
  });

  const tdStyle = (align: string): React.CSSProperties => ({
    padding: "0.7rem 1rem",
    textAlign: align as React.CSSProperties["textAlign"],
    fontSize: "0.875rem",
    color: "var(--text-primary)",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    verticalAlign: "middle",
  });

  return (
    <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th key={col.key} style={thStyle(col.align)} onClick={() => handleSort(col.key)}>
                {col.label}
                {sortKey === col.key && (
                  <span style={{ marginLeft: 4 }}>{sortAsc ? "↑" : "↓"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={`${s.cusip}-${s.quarter}`} style={{ transition: "background 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <td style={{ ...tdStyle("right"), color: "var(--text-secondary)", width: 40 }}>{s.rank}</td>
              <td style={tdStyle("left")}>
                <span style={{
                  fontFamily: "monospace",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  letterSpacing: "0.02em",
                  color: "#ffffff",
                }}>
                  {s.ticker}
                </span>
              </td>
              <td style={tdStyle("left")}>
                <RacsBar value={s.regime_adjusted_racs} max={maxRacs} />
              </td>
              <td style={{ ...tdStyle("right"), fontVariantNumeric: "tabular-nums" }}>{s.activist_buyers}</td>
              <td style={{ ...tdStyle("right"), fontVariantNumeric: "tabular-nums", color: "#10b981" }}>{s.strong_buys}</td>
              <td style={tdStyle("right")}>
                <CrowdingCell value={s.crowding_penalty} />
              </td>
              <td style={tdStyle("left")}>
                <RegimeBadge label={s.regime_label} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
