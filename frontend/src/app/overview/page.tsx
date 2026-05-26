import React, { Suspense } from "react";
import { useOverviewData } from "./useOverviewData";
import { OVERVIEW_CONSTANTS } from "./overview.constants";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";
import ArchitectureNotice from "@/components/ArchitectureNotice";

function OverviewSkeleton() {
  return <div className="skeleton-shimmer" style={{ width: "100%", height: 400 }} />;
}

function StatBadge({ value, label, color = "#8a2be2" }: { value: string; label: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
      <div style={{ fontSize: "2.2rem", fontWeight: 800, letterSpacing: "-0.04em", color }}>{value}</div>
      <div style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

async function OverviewContent() {
  const { metrics, history } = await useOverviewData();

  const regimeColor: Record<string, string> = {
    Goldilocks: "#10b981",
    Recovery: "#3b82f6",
    Rate_Shock: "#f59e0b",
    Recession_Fear: "#ef4444",
  };
  const rColor = regimeColor[metrics.currentRegime] ?? "#8a2be2";
  const regimeLabel = metrics.currentRegime.replace(/_/g, " ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>

      {/* ── Hero banner ─────────────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.05}>
        <GlassCard hierarchy="primary">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "2rem" }}>
            <div style={{ maxWidth: 560 }}>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.2rem 0.7rem",
                borderRadius: 20,
                backgroundColor: "rgba(138,43,226,0.12)",
                border: "1px solid rgba(138,43,226,0.3)",
                marginBottom: "1rem",
              }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#8a2be2" }} />
                <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#c4b5fd", letterSpacing: "0.09em", textTransform: "uppercase" }}>
                  Andria Systems · Quantitative Research
                </span>
              </div>
              <h1 style={{
                fontSize: "clamp(2rem, 3vw, 2.8rem)",
                fontWeight: 800,
                letterSpacing: "-0.04em",
                lineHeight: 1.1,
                margin: "0 0 0.75rem",
                background: "linear-gradient(135deg, #ffffff 0%, rgba(196,181,253,0.85) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>
                Institutional Equity<br />Intelligence Platform
              </h1>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.65, maxWidth: "48ch" }}>
                Processes 116M SEC 13F filings to generate regime-conditioned conviction signals.
                Combines HDBSCAN manager archetypes with Gaussian HMM macro regimes to rank
                activist equity plays through the RACS framework.
              </p>
            </div>

            {/* Regime badge */}
            <div style={{
              padding: "1.25rem 1.75rem",
              borderRadius: 14,
              backgroundColor: `${rColor}0f`,
              border: `1px solid ${rColor}33`,
              textAlign: "right",
              flexShrink: 0,
            }}>
              <div style={{ fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                Current Macro Regime
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.03em", color: rColor }}>
                {regimeLabel}
              </div>
              <div style={{ fontSize: "0.75rem", color: rColor, opacity: 0.7, marginTop: "0.2rem" }}>
                {(metrics.regimeProb * 100).toFixed(0)}% confidence
              </div>
            </div>
          </div>

          {/* Stat row */}
          <div style={{
            display: "flex",
            gap: "2.5rem",
            marginTop: "2rem",
            paddingTop: "1.5rem",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            flexWrap: "wrap",
          }}>
            <StatBadge value="116M" label="13F filings processed" color="#c4b5fd" />
            <StatBadge value={String(metrics.activeSignals)} label="Alpha signals ranked" color="#10b981" />
            <StatBadge value={metrics.managersProfiled.toLocaleString()} label="Managers profiled" color="#3b82f6" />
            <StatBadge value={`${(metrics.provenance * 100).toFixed(1)}%`} label="Provenance quality" color="#f59e0b" />
            <StatBadge value="PASSED" label="EvaluationGate" color="#10b981" />
          </div>
        </GlassCard>
      </RevealContainer>

      {/* ── Architecture notice ──────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <GlassCard hierarchy="secondary">
          <SectionHeader title={OVERVIEW_CONSTANTS.PAGE_TITLE} description={OVERVIEW_CONSTANTS.PAGE_DESCRIPTION} />
          <ArchitectureNotice />
        </GlassCard>
      </RevealContainer>

      {/* ── Pipeline run history ─────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader title="Pipeline Run History" description="Local DuckDB engine execution log — artifacts committed to git on each successful run" />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {history.map((run, idx) => {
            const ok = run.status === "success";
            return (
              <GlassCard key={run.id} hierarchy="secondary" delayIndex={idx}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  {/* Status dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    backgroundColor: ok ? "#10b981" : "#ef4444",
                    boxShadow: `0 0 8px ${ok ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.4)"}`,
                  }} />
                  {/* Run ID */}
                  <div style={{ fontFamily: "monospace", fontSize: "0.82rem", fontWeight: 600, color: ok ? "var(--text-primary)" : "var(--text-muted)", flex: 1 }}>
                    {run.id}
                  </div>
                  {/* Timestamp */}
                  <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", flexShrink: 0 }}>{run.timestamp}</div>
                  {/* Duration */}
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", flexShrink: 0, minWidth: 70, textAlign: "right" }}>{run.duration}</div>
                  {/* Badge */}
                  <div style={{
                    padding: "0.18rem 0.6rem",
                    borderRadius: 20,
                    fontSize: "0.62rem",
                    fontWeight: 700,
                    letterSpacing: "0.07em",
                    backgroundColor: ok ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                    color: ok ? "#10b981" : "#ef4444",
                    border: `1px solid ${ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                    flexShrink: 0,
                  }}>
                    {run.status.toUpperCase()}
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      </RevealContainer>
    </div>
  );
}

export default function OverviewPage() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <OverviewContent />
    </Suspense>
  );
}
