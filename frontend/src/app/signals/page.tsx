import React, { Suspense } from "react";
import { getSignalsData } from "@/lib/loaders";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";
import MetricTile from "@/components/MetricTile";
import SignalsTable from "./SignalsTable";

function Skeleton() {
  return <div className="skeleton-shimmer" style={{ width: "100%", height: 500 }} />;
}

async function SignalsContent() {
  const data = await getSignalsData();
  const { signals, total_signals, provenance_quality, validation_passed } = data;

  const byRegime = signals.reduce<Record<string, number>>((acc, s) => {
    acc[s.regime_label] = (acc[s.regime_label] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>
      {/* KPI Row */}
      <RevealContainer threshold={0.1}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1.5rem" }}>
          <GlassCard hierarchy="secondary">
            <MetricTile label="Total Signals (Pipeline)" value={total_signals.toLocaleString()} />
          </GlassCard>
          <GlassCard hierarchy="secondary">
            <MetricTile label="Displayed (Top Ranked)" value={signals.length} />
          </GlassCard>
          <GlassCard hierarchy="secondary">
            <MetricTile
              label="Provenance Quality"
              value={`${((provenance_quality ?? 0) * 100).toFixed(1)}%`}
            />
          </GlassCard>
          <GlassCard hierarchy="secondary">
            <MetricTile
              label="Evaluation Gate"
              value={validation_passed ? "PASSED" : "FAILED"}
            />
          </GlassCard>
        </div>
      </RevealContainer>

      {/* Table */}
      <RevealContainer threshold={0.1}>
        <GlassCard hierarchy="primary">
          <SectionHeader
            title="RACS Signal Rankings"
            description="Regime-Conditioned Activist Conviction Score — consensus_weight × log(activist_buyers + 1.1) × (1 − crowding) × (1 ± regime_weight × regime_prob). Click any column to sort."
          />
          <SignalsTable signals={signals} />
        </GlassCard>
      </RevealContainer>

      {/* Regime breakdown */}
      <RevealContainer threshold={0.15}>
        <SectionHeader
          title="Signal Distribution by Regime"
          description="Count of active signals per HMM macro regime label"
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
          {Object.entries(byRegime).map(([regime, count], i) => (
            <GlassCard key={regime} hierarchy="secondary" delayIndex={i}>
              <div style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                {regime.replace(/_/g, " ")}
              </div>
              <div style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" }}>{count}</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                {((count / signals.length) * 100).toFixed(0)}% of displayed
              </div>
            </GlassCard>
          ))}
        </div>
      </RevealContainer>
    </div>
  );
}

export default function SignalsPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <SignalsContent />
    </Suspense>
  );
}
