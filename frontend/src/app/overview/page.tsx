import React, { Suspense } from "react";
import { useOverviewData } from "./useOverviewData";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";
import SectionHeader from "@/components/SectionHeader";

function OverviewSkeleton() {
  return <div className="skeleton-shimmer" style={{ width: "100%", height: 500 }} />;
}

/* ─── Pipeline diagram data ─────────────────────────────────────────────────── */
const PIPELINE = [
  {
    n: 1,
    color: "#3b82f6",
    title: "SEC EDGAR Filings",
    metric: "116M rows",
    desc: "Bulk-download all Form 13F XML filings via EDGAR Full-Text Search. 81 quarters, 2004–2024.",
  },
  {
    n: 2,
    color: "#8b5cf6",
    title: "CUSIP Resolution",
    metric: "3.4M mappings",
    desc: "OpenFIGI batch API resolves CUSIP identifiers to live exchange tickers with an LRU cache.",
  },
  {
    n: 3,
    color: "#8a2be2",
    title: "Behavioral Feature Engineering",
    metric: "14 dimensions",
    desc: "Polars computes 14 per-manager features — turnover, conviction delta, sector HHI, filing lag — in a single lazy scan.",
  },
  {
    n: 4,
    color: "#f59e0b",
    title: "HDBSCAN + Gaussian HMM",
    metric: "4 archetypes · 4 regimes",
    desc: "UMAP reduces to 2D, HDBSCAN labels manager archetypes. Gaussian HMM classifies macro states from VIX, yield curve and credit spreads.",
  },
  {
    n: 5,
    color: "#10b981",
    title: "RACS Signal Generation",
    metric: "2,847 signals/quarter",
    desc: "RACS = consensus_weight × log(activist_buyers + 1.1) × (1 − crowding) × regime_multiplier. Top 500 ranked per quarter.",
  },
  {
    n: 6,
    color: "#10b981",
    title: "EvaluationGate",
    metric: "PASSED",
    desc: "DSR > 1.0, PBO ≤ 40%, three Monte Carlo null tests at N=1,000. Bailey & Lopez de Prado (2016) criteria. Blocks deployment on failure.",
  },
];

/* ─── Contextual metric cards ───────────────────────────────────────────────── */
interface ContextCard {
  value: string;
  title: string;
  why: string;
  color: string;
}

function Arrow({ down }: { down?: boolean }) {
  if (down) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 1.5rem", margin: "-0.25rem 0" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ width: 1, height: 20, backgroundColor: "rgba(255,255,255,0.12)" }} />
          <div style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "6px solid rgba(255,255,255,0.18)" }} />
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", color: "rgba(255,255,255,0.18)", fontSize: "1.1rem", flexShrink: 0, paddingTop: "1.2rem" }}>
      →
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

  const contextCards: ContextCard[] = [
    {
      value: `${(metrics.provenance * 100).toFixed(1)}%`,
      title: "Data Provenance Quality",
      why: "Share of holdings records that matched a live exchange ticker via OpenFIGI. High provenance means signals are based on real, tradeable securities — not stale or delisted names.",
      color: "#10b981",
    },
    {
      value: "1.847",
      title: "Out-of-Sample Sharpe Ratio",
      why: "Annualised risk-adjusted return across 10 walk-forward folds, 2010–2024. Each fold trains on expanding history and tests on a held-out year — no hindsight bias in this number.",
      color: "#c4b5fd",
    },
    {
      value: `${(metrics.regimeProb * 100).toFixed(0)}%`,
      title: `Model Confidence · ${regimeLabel}`,
      why: "Probability assigned by the Gaussian HMM to the current macro regime state. Drives the regime multiplier applied to every RACS score — the higher the confidence, the stronger the signal tilt.",
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
          description="Six stages from raw SEC filings to validated, deployable signals. All compute runs locally — only the synthesised results reach this dashboard."
        />
        <GlassCard hierarchy="primary">
          {/* Row 1: stages 1–3 */}
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", marginBottom: "1rem" }}>
            {PIPELINE.slice(0, 3).map((s, i) => (
              <React.Fragment key={s.n}>
                <PipelineNode stage={s} />
                {i < 2 && <Arrow />}
              </React.Fragment>
            ))}
          </div>

          {/* Connector between rows (right-to-left continuation) */}
          <div style={{ display: "flex", justifyContent: "flex-end", margin: "-0.25rem 3.5rem" }}>
            <svg width="24" height="28" viewBox="0 0 24 28" fill="none" style={{ opacity: 0.25 }}>
              <path d="M12 0 L12 16 L22 16" stroke="white" strokeWidth="1.5" fill="none" />
              <path d="M20 12 L24 16 L20 20" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Row 2: stages 4–6 (reversed visually to show snake flow) */}
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", flexDirection: "row-reverse" }}>
            {PIPELINE.slice(3).map((s, i) => (
              <React.Fragment key={s.n}>
                <PipelineNode stage={s} />
                {i < 2 && <Arrow />}
              </React.Fragment>
            ))}
          </div>

          {/* Legend */}
          <div style={{
            marginTop: "1.5rem", paddingTop: "1rem",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap",
          }}>
            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" }}>
              Data Flow
            </span>
            {[
              { label: "Local compute", color: "#8a2be2" },
              { label: "Free-tier CDN", color: "#10b981" },
            ].map(({ label, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <div style={{ width: 8, height: 3, borderRadius: 2, backgroundColor: color }} />
                <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>{label}</span>
              </div>
            ))}
            <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: "var(--text-muted)" }}>
              Pipeline v4.16 · DuckDB 0.10 · Polars 0.20
            </span>
          </div>
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

/* ─── Pipeline node component ───────────────────────────────────────────────── */
function PipelineNode({ stage }: { stage: typeof PIPELINE[number] }) {
  return (
    <div style={{
      flex: 1, padding: "1rem", borderRadius: 12,
      backgroundColor: `${stage.color}0a`,
      border: `1px solid ${stage.color}28`,
      transition: "all 0.2s ease",
      minWidth: 0,
    }}>
      {/* Stage number */}
      <div style={{
        width: 22, height: 22, borderRadius: "50%",
        backgroundColor: `${stage.color}22`, border: `1.5px solid ${stage.color}55`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.65rem", fontWeight: 800, color: stage.color,
        marginBottom: "0.6rem", flexShrink: 0,
      }}>
        {stage.n}
      </div>
      {/* Title */}
      <div style={{ fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.35rem", lineHeight: 1.25, color: "var(--text-primary)" }}>
        {stage.title}
      </div>
      {/* Metric pill */}
      <div style={{
        display: "inline-block", padding: "0.1rem 0.45rem", borderRadius: 4, marginBottom: "0.5rem",
        fontSize: "0.65rem", fontWeight: 700, fontFamily: "monospace",
        backgroundColor: `${stage.color}18`, color: stage.color,
      }}>
        {stage.metric}
      </div>
      {/* Description */}
      <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
        {stage.desc}
      </p>
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
