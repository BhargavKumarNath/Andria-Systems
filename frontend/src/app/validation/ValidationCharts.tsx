"use client";

import React, { useEffect, useRef, useState } from "react";

/* ─── Animated counting number ───────────────────────────────────────────────── */
function AnimatedNumber({ target, decimals = 0, suffix = "", prefix = "", duration = 1200 }: {
  target: number; decimals?: number; suffix?: string; prefix?: string; duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number | null>(null);
  const start = useRef<number | null>(null);

  useEffect(() => {
    start.current = null;
    const step = (ts: number) => {
      if (!start.current) start.current = ts;
      const progress = Math.min((ts - start.current) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplay(target * ease);
      if (progress < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration]);

  return <>{prefix}{display.toFixed(decimals)}{suffix}</>;
}

/* ─── DSR Waterfall ──────────────────────────────────────────────────────────── */
export function DsrWaterfall({ observed, deflated }: { observed: number; deflated: number }) {
  const haircut = observed - deflated;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setTimeout(() => setMounted(true), 200); }, []);

  const maxVal = Math.max(observed, 1.5) * 1.1;
  const observedH = (observed / maxVal) * 140;
  const deflatedH = (deflated / maxVal) * 140;
  const thresholdH = (1.0 / maxVal) * 140;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Bar comparison */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: "1.5rem", height: 160, paddingBottom: 0 }}>
        {/* Observed */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#fff" }}>{observed.toFixed(3)}</div>
          <div style={{
            width: "100%", height: mounted ? observedH : 0,
            background: "linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.15) 100%)",
            borderRadius: "6px 6px 0 0",
            transition: "height 0.9s cubic-bezier(0.16,1,0.3,1)",
            position: "relative",
          }} />
          <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Observed SR</div>
        </div>

        {/* Haircut arrow */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem", paddingBottom: 24 }}>
          <div style={{ fontSize: "0.72rem", color: "#f59e0b", fontWeight: 700 }}>−{haircut.toFixed(3)}</div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>adjustments</div>
          <div style={{ fontSize: "1rem", color: "#f59e0b" }}>→</div>
        </div>

        {/* Deflated */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#10b981" }}>{deflated.toFixed(3)}</div>
          <div style={{
            width: "100%", height: mounted ? deflatedH : 0,
            background: "linear-gradient(180deg, #10b981 0%, rgba(16,185,129,0.25) 100%)",
            borderRadius: "6px 6px 0 0",
            boxShadow: mounted ? "0 0 16px rgba(16,185,129,0.3)" : "none",
            transition: "height 0.9s cubic-bezier(0.16,1,0.3,1) 0.1s, box-shadow 0.6s ease 0.5s",
            position: "relative",
          }}>
            {/* Threshold line */}
            <div style={{
              position: "absolute", bottom: thresholdH - deflatedH,
              left: -8, right: -8, height: 1.5,
              background: "rgba(239,68,68,0.7)",
              borderRadius: 1,
            }}>
              <span style={{
                position: "absolute", right: 0, top: -9,
                fontSize: "0.55rem", color: "#ef4444", fontWeight: 700, whiteSpace: "nowrap",
              }}>1.0 threshold</span>
            </div>
          </div>
          <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Deflated SR</div>
        </div>
      </div>

      {/* Bottom axis */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.08)", borderRadius: 1 }} />

      {/* Adjustment breakdown chips */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {[
          { label: "Multiple testing", desc: "Penalises 21 configurations tried" },
          { label: "Skewness", desc: "Return distribution is left-skewed" },
          { label: "Excess kurtosis", desc: "Fat tails increase variance of estimate" },
          { label: "Serial correlation", desc: "Returns are not fully independent" },
        ].map(({ label, desc }) => (
          <div key={label} title={desc} style={{
            padding: "0.2rem 0.55rem", borderRadius: 4, fontSize: "0.62rem", fontWeight: 600,
            backgroundColor: "rgba(245,158,11,0.12)", color: "#f59e0b",
            border: "1px solid rgba(245,158,11,0.22)", cursor: "default",
          }}>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── PBO Gauge ──────────────────────────────────────────────────────────────── */
export function PboGauge({ score, threshold }: { score: number; threshold: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setTimeout(() => setMounted(true), 300); }, []);

  const pct = score * 100;
  const thresholdPct = threshold * 100;
  const color = score < threshold ? "#10b981" : "#ef4444";

  // Arc parameters
  const r = 68;
  const cx = 100, cy = 100;
  const startAngle = -150;
  const endAngle = -30;
  const totalDeg = endAngle - startAngle; // 120 → actually we'll do a 240deg arc
  const totalDeg2 = 240;
  const startRad = ((startAngle - 90) * Math.PI) / 180;

  function polarToXY(angle: number, radius: number) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function arcPath(startDeg: number, endDeg: number, rOuter: number) {
    const s = polarToXY(startDeg, rOuter);
    const e = polarToXY(endDeg, rOuter);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${rOuter} ${rOuter} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const arcStart = -210;
  const arcEnd = 30;
  const scoreDeg = arcStart + (pct / 100) * (arcEnd - arcStart);
  const thresholdDeg = arcStart + (thresholdPct / 100) * (arcEnd - arcStart);

  const needle = polarToXY(mounted ? scoreDeg : arcStart, r - 12);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
      <svg width={200} height={130} viewBox="0 0 200 130">
        {/* Track */}
        <path d={arcPath(arcStart, arcEnd, r)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={12} strokeLinecap="round" />
        {/* Fill (safe zone: 0% → threshold) */}
        <path
          d={arcPath(arcStart, Math.min(mounted ? scoreDeg : arcStart, thresholdDeg), r)}
          fill="none" stroke="#10b981" strokeWidth={12} strokeLinecap="round"
          style={{ transition: "all 1s cubic-bezier(0.16,1,0.3,1) 0.2s" }}
        />
        {/* Fill (danger zone: threshold → score, if score > threshold) */}
        {mounted && score > threshold && (
          <path d={arcPath(thresholdDeg, scoreDeg, r)} fill="none" stroke="#ef4444" strokeWidth={12} strokeLinecap="round" />
        )}
        {/* Threshold tick */}
        <line
          x1={polarToXY(thresholdDeg, r - 20).x} y1={polarToXY(thresholdDeg, r - 20).y}
          x2={polarToXY(thresholdDeg, r + 4).x} y2={polarToXY(thresholdDeg, r + 4).y}
          stroke="#ef444488" strokeWidth={2}
        />
        {/* Needle dot */}
        <circle
          cx={needle.x} cy={needle.y} r={5}
          fill={color} stroke="rgba(0,0,0,0.5)" strokeWidth={1.5}
          style={{ transition: "cx 1s cubic-bezier(0.16,1,0.3,1) 0.2s, cy 1s cubic-bezier(0.16,1,0.3,1) 0.2s" }}
        />
        {/* Center value */}
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize={26} fontWeight={800} fill={color} fontFamily="monospace">
          {pct.toFixed(1)}%
        </text>
        <text x={cx} y={cy + 26} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.4)" letterSpacing="0.06em">
          PBO SCORE
        </text>
        {/* Labels */}
        <text x={polarToXY(arcStart - 2, r + 16).x} y={polarToXY(arcStart - 2, r + 16).y} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.35)">0%</text>
        <text x={polarToXY(arcEnd + 2, r + 16).x} y={polarToXY(arcEnd + 2, r + 16).y} textAnchor="middle" fontSize={8} fill="#ef444466">100%</text>
        <text x={polarToXY(thresholdDeg, r + 16).x} y={polarToXY(thresholdDeg, r + 16).y} textAnchor="middle" fontSize={7} fill="#ef4444aa">40%</text>
      </svg>

      <div style={{ display: "flex", gap: "1rem" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Verdict</div>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color }}>{score < threshold ? "PASS" : "FAIL"}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Threshold</div>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#ef4444" }}>&lt; {(threshold * 100).toFixed(0)}%</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Margin</div>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#10b981" }}>
            {((threshold - score) * 100).toFixed(1)}pp below limit
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Monte Carlo distribution visual ───────────────────────────────────────── */
export function MonteCarloVisual({ test, p_value, observed, sharpe_5pct, sharpe_50pct, sharpe_95pct, significant }: {
  test: string; p_value: number; observed: number;
  sharpe_5pct: number; sharpe_50pct: number; sharpe_95pct: number;
  significant: boolean;
}) {
  const observed_sharpe = observed;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setTimeout(() => setMounted(true), 400); }, []);

  const color = significant ? "#10b981" : "#ef4444";
  const nullColor = "rgba(255,255,255,0.18)";

  // Derive a simple bell-curve of 30 points for the null distribution
  const nullMin = sharpe_5pct - (sharpe_95pct - sharpe_5pct) * 0.2;
  const nullMax = sharpe_95pct + (sharpe_95pct - sharpe_5pct) * 0.2;
  const plotMax = Math.max(nullMax, observed_sharpe) * 1.15;
  const plotMin = Math.min(nullMin, 0);
  const range = plotMax - plotMin || 1;

  // 40 gaussian bars for null distribution
  const bars = Array.from({ length: 40 }, (_, i) => {
    const x = nullMin + (i / 39) * (nullMax - nullMin);
    const mu = sharpe_50pct;
    const sigma = (sharpe_95pct - sharpe_5pct) / 3.29; // 99.9% range ≈ 3.29σ
    const h = Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2));
    return { x, h };
  });
  const maxH = Math.max(...bars.map(b => b.h));

  const toXPct = (v: number) => Math.max(0, Math.min(100, ((v - plotMin) / range) * 100));
  const observedPct = toXPct(observed_sharpe);

  const TEST_LABELS: Record<string, string> = {
    bootstrap_resampling: "Bootstrap",
    randomized_entry_timing: "Random Entry",
    regime_permutation: "Regime Permutation",
  };
  const shortName = TEST_LABELS[test] ?? test.replace(/_/g, " ");

  return (
    <div style={{
      borderRadius: 14,
      border: `1px solid ${color}33`,
      backgroundColor: `${color}07`,
      padding: "1.2rem 1.4rem",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.2rem" }}>{shortName}</div>
          <div style={{ fontSize: "0.63rem", color: "var(--text-muted)" }}>p = {p_value.toFixed(3)} · threshold p &lt; 0.05</div>
        </div>
        <span style={{
          padding: "0.22rem 0.7rem", borderRadius: 6, fontSize: "0.72rem", fontWeight: 700,
          backgroundColor: `${color}20`, color,
          border: `1px solid ${color}44`,
          letterSpacing: "0.05em",
        }}>
          {significant ? "✓ SIGNIFICANT" : "✗ NOT SIGNIFICANT"}
        </span>
      </div>

      {/* Distribution chart */}
      <div style={{ position: "relative", height: 70, marginBottom: "0.85rem" }}>
        {/* Null distribution bars */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 1 }}>
          {bars.map((b, i) => {
            const xPct = toXPct(b.x);
            const isAboveObserved = b.x >= observed_sharpe;
            return (
              <div key={i} style={{
                flex: 1, height: mounted ? `${(b.h / maxH) * 100}%` : "0%",
                backgroundColor: isAboveObserved ? `${color}50` : "rgba(255,255,255,0.12)",
                borderRadius: "2px 2px 0 0",
                transition: `height 0.7s cubic-bezier(0.16,1,0.3,1) ${i * 8}ms`,
              }} />
            );
          })}
        </div>

        {/* Observed SR vertical line */}
        <div style={{
          position: "absolute", top: 0, bottom: 0,
          left: `${observedPct}%`,
          width: 2,
          backgroundColor: color,
          boxShadow: `0 0 8px ${color}`,
          transition: "left 0.8s ease",
        }}>
          <div style={{
            position: "absolute", top: -2, left: 4,
            fontSize: "0.58rem", fontWeight: 700, color, whiteSpace: "nowrap",
          }}>
            Observed SR {observed_sharpe.toFixed(3)}
          </div>
        </div>

        {/* 5th percentile tick */}
        <div style={{
          position: "absolute", bottom: 0, top: 0,
          left: `${toXPct(sharpe_5pct)}%`,
          width: 1, backgroundColor: "rgba(255,255,255,0.2)",
          borderStyle: "dashed",
        }} />
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem" }}>
        {[
          { label: "Null 5th %ile", value: sharpe_5pct.toFixed(3), color: "var(--text-muted)" },
          { label: "Null Median", value: sharpe_50pct.toFixed(3), color: "var(--text-secondary)" },
          { label: "Null 95th %ile", value: sharpe_95pct.toFixed(3), color: "var(--text-muted)" },
          { label: "Observed SR", value: observed_sharpe.toFixed(3), color },
        ].map(({ label, value, color: c }) => (
          <div key={label}>
            <div style={{ fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.15rem" }}>{label}</div>
            <div style={{ fontSize: "0.88rem", fontWeight: 700, fontFamily: "monospace", color: c }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Walk-Forward Heatmap ───────────────────────────────────────────────────── */
interface WalkFold {
  fold: number; train_start: number; train_end: number;
  test_start: number; test_end: number;
  n_trades: number; sharpe: number; mean_return: number;
  max_drawdown: number; hit_rate: number;
}

export function WalkForwardHeatmap({ folds }: { folds: WalkFold[] }) {
  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  useEffect(() => { setTimeout(() => setMounted(true), 200); }, []);

  if (!folds.length) return null;

  const maxSharpe = Math.max(...folds.map(f => f.sharpe));
  const minSharpe = Math.min(...folds.map(f => f.sharpe));

  function sharpeToColor(v: number) {
    // Map sharpe 0..3 to a green gradient
    const t = Math.min(Math.max((v - 1.0) / (2.5 - 1.0), 0), 1);
    if (v < 1.0) return "#ef4444";
    // lerp from amber → green
    const r = Math.round(16 + (245 - 16) * (1 - t));
    const g = Math.round(185 + (158 - 185) * t);
    return `rgb(${r},${g},${t > 0.5 ? 129 : 11})`;
  }

  const hoveredFold = hovered !== null ? folds.find(f => f.fold === hovered) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Heatmap grid */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {/* Column header: test years */}
        <div style={{ display: "grid", gridTemplateColumns: `80px repeat(${folds.length}, 1fr)`, gap: "0.3rem", alignItems: "center" }}>
          <div style={{ fontSize: "0.58rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Fold</div>
          {folds.map(f => (
            <div key={f.fold} style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--text-muted)", textAlign: "center" }}>{f.test_start}</div>
          ))}
        </div>

        {/* Sharpe row */}
        {[
          { metric: "Sharpe", key: "sharpe" as keyof WalkFold, fmt: (v: number) => v.toFixed(2), colorFn: sharpeToColor },
          { metric: "Hit Rate", key: "hit_rate" as keyof WalkFold, fmt: (v: number) => `${(v * 100).toFixed(0)}%`, colorFn: (v: number) => v >= 0.55 ? "#10b981" : v >= 0.48 ? "#f59e0b" : "#ef4444" },
          { metric: "Max DD", key: "max_drawdown" as keyof WalkFold, fmt: (v: number) => `${(v * 100).toFixed(1)}%`, colorFn: (v: number) => Math.abs(v) <= 0.05 ? "#10b981" : Math.abs(v) <= 0.12 ? "#f59e0b" : "#ef4444" },
        ].map(({ metric, key, fmt, colorFn }) => (
          <div key={metric} style={{ display: "grid", gridTemplateColumns: `80px repeat(${folds.length}, 1fr)`, gap: "0.3rem", alignItems: "center" }}>
            <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", letterSpacing: "0.04em" }}>{metric}</div>
            {folds.map((f, i) => {
              const val = f[key] as number;
              const cellColor = colorFn(val);
              const isHov = hovered === f.fold;
              return (
                <div
                  key={f.fold}
                  onMouseEnter={() => setHovered(f.fold)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    borderRadius: 6,
                    padding: "0.35rem 0.2rem",
                    textAlign: "center",
                    backgroundColor: mounted ? `${cellColor}22` : "rgba(255,255,255,0.02)",
                    border: `1px solid ${isHov ? cellColor + "88" : cellColor + "28"}`,
                    cursor: "default",
                    transition: `background-color 0.5s ease ${i * 40}ms, border-color 0.2s ease`,
                    transform: isHov ? "scale(1.06)" : "scale(1)",
                  }}
                >
                  <div style={{ fontSize: "0.7rem", fontWeight: 700, color: mounted ? cellColor : "var(--text-muted)", fontFamily: "monospace", transition: `color 0.5s ease ${i * 40}ms` }}>
                    {fmt(val)}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Tooltip / detail on hover */}
      <div style={{
        borderRadius: 10, padding: hoveredFold ? "0.85rem 1.1rem" : "0",
        height: hoveredFold ? "auto" : 0, overflow: "hidden",
        border: hoveredFold ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
        backgroundColor: hoveredFold ? "rgba(255,255,255,0.03)" : "transparent",
        transition: "all 0.2s ease",
      }}>
        {hoveredFold && (
          <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.2rem" }}>Fold {hoveredFold.fold} · Test {hoveredFold.test_start}</div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>Train: {hoveredFold.train_start}–{hoveredFold.train_end}</div>
            </div>
            {[
              { label: "Trades", value: hoveredFold.n_trades },
              { label: "Sharpe", value: hoveredFold.sharpe.toFixed(2) },
              { label: "Hit Rate", value: `${(hoveredFold.hit_rate * 100).toFixed(1)}%` },
              { label: "Max DD", value: `${(hoveredFold.max_drawdown * 100).toFixed(1)}%` },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.15rem" }}>{label}</div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sharpe sparkline */}
      <div>
        <div style={{ fontSize: "0.62rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.5rem" }}>
          Sharpe across folds · temporal stability
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "0.4rem", height: 56 }}>
          {folds.map((f, i) => {
            const h = ((f.sharpe - minSharpe) / (maxSharpe - minSharpe + 0.001)) * 100;
            const col = sharpeToColor(f.sharpe);
            return (
              <div key={f.fold} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem" }}>
                <div style={{
                  width: "100%", height: mounted ? `${Math.max(h, 8)}%` : "0%",
                  background: `linear-gradient(180deg, ${col} 0%, ${col}55 100%)`,
                  borderRadius: "3px 3px 0 0",
                  transition: `height 0.7s cubic-bezier(0.16,1,0.3,1) ${i * 60}ms`,
                  boxShadow: `0 0 6px ${col}40`,
                }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: "0.3rem", gap: "0.4rem" }}>
          {folds.map(f => (
            <div key={f.fold} style={{ flex: 1, textAlign: "center", fontSize: "0.55rem", color: "var(--text-muted)" }}>{f.test_start}</div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", paddingTop: "0.25rem" }}>
        {[
          { color: "#10b981", label: "Strong (≥ 1.5 Sharpe / ≥ 55% hit rate)" },
          { color: "#f59e0b", label: "Acceptable (1.0–1.5 / 48–55%)" },
          { color: "#ef4444", label: "Weak (< 1.0 / < 48%)" },
        ].map(({ color: c, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c }} />
            <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
