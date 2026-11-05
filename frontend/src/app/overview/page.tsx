import React, { Suspense } from "react";
import { useOverviewData } from "./useOverviewData";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";
import SectionHeader from "@/components/SectionHeader";
import PipelineFlow, { type PipelineFacts } from "./PipelineFlow";
import { formatInt, formatQuarter, getDashboardFacts } from "@/lib/facts";

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
  const [{ metrics, history }, facts] = await Promise.all([useOverviewData(), getDashboardFacts()]);

  // Provenance comes from the evaluation gate's own record (validation.json),
  // the same value the gate judged, not from signals.json, which leaves it null.
  const provenance = facts.provenanceValue;
  const provenanceThreshold = facts.provenanceThreshold ?? 0.9;
  const provenanceOk = provenance !== null && provenance >= provenanceThreshold;
  const pct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);

  const pipelineFacts: PipelineFacts = {
    filingsRowsShort: facts.filingsRowsShort,
    firstQuarter: formatQuarter(facts.firstQuarter),
    lastQuarter: formatQuarter(facts.lastQuarter),
    totalQuarters: formatInt(facts.totalQuarters),
    totalManagers: formatInt(facts.totalManagers),
    clusteredManagers: formatInt(facts.clusteredManagers),
    namedArchetypes: facts.archetypes.filter((a) => a.label !== "Noise").map((a) => a.label),
    noisePct: facts.noisePct === null ? "none" : `${(facts.noisePct * 100).toFixed(0)}%`,
    totalSignals: formatInt(facts.totalSignals),
    signalQuarters: facts.signalQuarters,
    provenancePct: pct(provenance),
    provenanceDetail: facts.provenanceDetail,
    gatePassed: facts.gatePassed,
    failedGateChecks: facts.failedGateChecks,
  };

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
      value: pct(provenance),
      title: "Data Provenance Quality",
      why: `Share of signal CUSIPs that resolved to a real exchange ticker via OpenFIGI (${facts.provenanceDetail.replace(/\.$/, "")}). The evaluation gate requires ${(provenanceThreshold * 100).toFixed(0)}%; ${provenanceOk ? "this run meets it" : "this run falls short, one reason the gate rejected it"}.`,
      color: provenanceOk ? "#10b981" : "#ef4444",
    },
    {
      value: metrics.sharpe !== null ? metrics.sharpe.toFixed(3) : "not available",
      title: "Backtest Sharpe Ratio",
      why: metrics.walkForwardFolds > 0
        ? `Annualised risk-adjusted return across ${metrics.walkForwardFolds} walk-forward folds. Each fold trains on expanding history and tests on a held-out year with no hindsight bias.`
        : "Annualised risk-adjusted return on the realized trade ledger, computed with T+1 execution and full transaction costs. Walk-forward folds need more calendar history than this run covers.",
      color: "#c4b5fd",
    },
    {
      value: `${(metrics.regimeProb * 100).toFixed(0)}%`,
      title: `Model Confidence · ${regimeLabel}`,
      why: "Probability the Gaussian HMM assigns to the current macro regime; it scales every RACS score. Read with caution: on the real macro history the HMM did not converge, so this is a best-effort fit rather than a validated estimate.",
      color: rColor,
    },
  ];

  const filingsText = metrics.totalFilings
    ? `${(metrics.totalFilings / 1_000_000).toFixed(0)} million SEC 13F filings`
    : "SEC 13F filings";

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
                Processes <strong style={{ color: "var(--text-primary)" }}>{filingsText}</strong> to surface
                regime-conditioned activist conviction signals. Combines unsupervised manager clustering
                with Gaussian Hidden Markov Model macro detection to rank institutional equity plays.
              </p>

              <div style={{
                display: "inline-flex", alignItems: "center", gap: "0.5rem", marginTop: "1.1rem",
                padding: "0.4rem 0.8rem", borderRadius: 8,
                backgroundColor: facts.gatePassed ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                border: `1px solid ${facts.gatePassed ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                fontSize: "0.75rem", color: "var(--text-secondary)",
              }}>
                <strong style={{ color: facts.gatePassed ? "#10b981" : "#ef4444", letterSpacing: "0.04em" }}>
                  Evaluation gate: {facts.gatePassed ? "PASSED" : "REJECTED"}
                </strong>
                {!facts.gatePassed && (
                  <span>
                    {facts.totalTrades ?? 0} priced trades, Sharpe {facts.annualizedSharpe?.toFixed(2) ?? "n/a"};
                    failed {facts.failedGateChecks.join(" and ")}
                  </span>
                )}
              </div>
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
          description="Six stages from raw SEC filings to a gated research result. Click any stage to see what it does, how it works, and what the real run produced."
        />
        <GlassCard hierarchy="primary">
          <PipelineFlow facts={pipelineFacts} />
        </GlassCard>
      </RevealContainer>

      {/* ── 4. Run history ───────────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="Pipeline Run History"
          description="Each row is one andria run/ingest invocation, read from its artifacts/runs/{run_id}/manifest.json."
        />
        {history.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No pipeline runs recorded yet.</p>
        ) : (
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
                  {run.stage && (
                    <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0, minWidth: 48 }}>
                      {run.stage}
                    </div>
                  )}
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
        )}
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
