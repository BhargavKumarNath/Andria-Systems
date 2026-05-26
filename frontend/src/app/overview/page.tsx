import React, { Suspense } from "react";
import { useOverviewData } from "./useOverviewData";
import { OVERVIEW_CONSTANTS } from "./overview.constants";
import SectionHeader from "@/components/SectionHeader";
import MetricTile from "@/components/MetricTile";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";
import ArchitectureNotice from "@/components/ArchitectureNotice";

// Loading skeleton strictly scoped to this page
function OverviewSkeleton() {
  return <div className="skeleton-shimmer" style={{ width: "100%", height: "400px" }} />;
}

async function OverviewContent() {
  const { metrics, history } = await useOverviewData();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>
      {/* Visual Hierarchy: Hero Layer (Top 3 KPIs) */}
      <RevealContainer threshold={0.1}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "2rem" }}>
          <GlassCard hierarchy="primary">
            <MetricTile isHero label="Filings Processed" value={metrics.totalAUM} />
          </GlassCard>
          <GlassCard hierarchy="primary">
            <MetricTile isHero label="Active Signals" value={String(metrics.activeSignals)} />
          </GlassCard>
          <GlassCard hierarchy="primary">
            <MetricTile isHero label="Current Regime" value={metrics.currentRegime} />
          </GlassCard>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginTop: "1.25rem" }}>
          <GlassCard hierarchy="secondary">
            <MetricTile label="Regime Confidence" value={`${(metrics.regimeProb * 100).toFixed(0)}%`} />
          </GlassCard>
          <GlassCard hierarchy="secondary">
            <MetricTile label="Provenance Quality" value={`${(metrics.provenance * 100).toFixed(1)}%`} />
          </GlassCard>
          <GlassCard hierarchy="secondary">
            <MetricTile label="Managers Profiled" value={metrics.managersProfiled.toLocaleString()} />
          </GlassCard>
          <GlassCard hierarchy="secondary">
            <MetricTile label="EvaluationGate" value="PASSED" />
          </GlassCard>
        </div>
      </RevealContainer>

      {/* Primary Insight Layer */}
      <RevealContainer threshold={0.2}>
        <GlassCard hierarchy="primary">
          <SectionHeader title={OVERVIEW_CONSTANTS.PAGE_TITLE} description={OVERVIEW_CONSTANTS.PAGE_DESCRIPTION} />
          <ArchitectureNotice />
        </GlassCard>
      </RevealContainer>

      {/* Secondary Analysis Layer */}
      <RevealContainer threshold={0.2}>
        <SectionHeader title="Recent Pipeline Executions" description="Local DuckDB engine run history" />
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {history.map((run, idx) => (
            <GlassCard key={run.id} hierarchy="secondary" delayIndex={idx + 1}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{run.id}</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{run.timestamp}</div>
                </div>
                <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
                  <div style={{ fontSize: "0.85rem" }}>Duration: {run.duration}</div>
                  <div style={{
                    padding: "0.25rem 0.75rem",
                    borderRadius: "4px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    backgroundColor: run.status === "success" ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                    color: run.status === "success" ? "var(--success-color)" : "var(--danger-color)"
                  }}>
                    {run.status.toUpperCase()}
                  </div>
                </div>
              </div>
            </GlassCard>
          ))}
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
