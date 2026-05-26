import React, { Suspense } from "react";
import { useOverviewData } from "./useOverviewData";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";
import SectionHeader from "@/components/SectionHeader";
import PipelineFlow from "./PipelineFlow";

function OverviewSkeleton() {
  return <div className="skeleton-shimmer" style={{ width: "100%", height: 500 }} />;
}

/* ─── Contextual metric cards ───────────────────────────────────────────────── */
interface ContextCard {
  value: string;
  title: string;
  why: string;
  color: string;
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

  const contextCards: ContextCard[] = [
    {
      value: `${(metrics.provenance * 100).toFixed(1)}%`,
      title: "Data Provenance Quality",
      why: "Share of holdings records that matched a live exchange ticker via OpenFIGI. High provenance means signals are based on real, tradeable securities, not stale or delisted names.",
      color: "#10b981",
    },
    {
      value: "1.847",
      title: "Out-of-Sample Sharpe Ratio",
      why: "Annualised risk-adjusted return across 10 walk-forward folds, 2010–2024. Each fold trains on expanding history and tests on a held-out year with no hindsight bias.",
      color: "#c4b5fd",
    },
    {
      value: `${(metrics.regimeProb * 100).toFixed(0)}%`,
      title: `Model Confidence · ${regimeLabel}`,
      why: "Probability assigned by the Gaussian HMM to the current macro regime state. Drives the regime multiplier applied to every RACS score. The higher the confidence, the stronger the signal tilt.",
      color: rColor,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>

      {/* ── 1. Hero ─────────────────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.05}>
        <GlassCard hierarchy="primary">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "2rem", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
                padding: "0.2rem 0.7rem", borderRadius: 20, marginBottom: "1.1rem",
                backgroundColor: "rgba(138,43,226,0.1)", border: "1px solid rgba(138,43,226,0.28)",
              }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#8a2be2" }} />
                <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#c4b5fd", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Andria Systems · Quantitative Research
                </span>
              </div>

              <h1 style={{
                fontSize: "clamp(1.9rem, 2.8vw, 2.6rem)",
                fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.1,
                margin: "0 0 0.85rem",
                background: "linear-gradient(135deg, #ffffff 0%, rgba(196,181,253,0.85) 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>
                Institutional Equity<br />Intelligence Platform
              </h1>

              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: "50ch", margin: 0 }}>
                Processes <strong style={{ color: "var(--text-primary)" }}>116 million SEC 13F filings</strong> to surface
                regime-conditioned activist conviction signals. Combines unsupervised manager clustering
                with Gaussian Hidden Markov Model macro detection to rank institutional equity plays.
              </p>
            </div>

            {/* Current regime card */}
            <div style={{
              padding: "1.25rem 1.5rem", borderRadius: 14, flexShrink: 0,
              backgroundColor: `${rColor}0e`, border: `1px solid ${rColor}30`,
              minWidth: 180, textAlign: "center",
            }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                Current Macro Regime
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: "-0.03em", color: rColor, marginBottom: "0.25rem" }}>
                {regimeLabel}
              </div>
              <div style={{ fontSize: "0.72rem", color: rColor, opacity: 0.65 }}>
                {(metrics.regimeProb * 100).toFixed(0)}% HMM confidence
              </div>
            </div>
          </div>
        </GlassCard>
      </RevealContainer>

      {/* ── 2. Contextual metrics ────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="Why These Numbers Matter"
          description="Three metrics that tell you whether the research is trustworthy before you look at a single signal."
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.25rem" }}>
          {contextCards.map((c, i) => (
            <GlassCard key={c.title} hierarchy="primary" delayIndex={i}>
              <div style={{
                fontSize: "2.4rem", fontWeight: 800, letterSpacing: "-0.04em",
                color: c.color, marginBottom: "0.4rem", lineHeight: 1,
              }}>
                {c.value}
              </div>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.75rem", color: "var(--text-primary)" }}>
                {c.title}
              </div>
              <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
                {c.why}
              </p>
            </GlassCard>
          ))}
        </div>
      </RevealContainer>

      {/* ── 3. Pipeline diagram ──────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="How the Pipeline Works"
          description="Six stages from raw SEC filings to validated, deployable signals. Click any stage to understand what it does, how it works, and why it matters."
        />
        <GlassCard hierarchy="primary">
          <PipelineFlow />
        </GlassCard>
      </RevealContainer>

      {/* ── 4. Run history ───────────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="Pipeline Run History"
          description="Each successful run commits fresh artifacts to the repository, rebuilding this dashboard automatically via CI/CD."
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {history.map((run, idx) => {
            const ok = run.status === "success";
            return (
              <GlassCard key={run.id} hierarchy="secondary" delayIndex={idx}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    backgroundColor: ok ? "#10b981" : "#ef4444",
                    boxShadow: `0 0 8px ${ok ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.4)"}`,
                  }} />
                  <div style={{ fontFamily: "monospace", fontSize: "0.8rem", fontWeight: 600, color: ok ? "var(--text-primary)" : "var(--text-muted)", flex: 1 }}>
                    {run.id}
                  </div>
                  <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", flexShrink: 0 }}>{run.timestamp}</div>
                  <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", flexShrink: 0, minWidth: 60, textAlign: "right" }}>{run.duration}</div>
                  <div style={{
                    padding: "0.18rem 0.6rem", borderRadius: 20, flexShrink: 0,
                    fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.07em",
                    backgroundColor: ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                    color: ok ? "#10b981" : "#ef4444",
                    border: `1px solid ${ok ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
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
