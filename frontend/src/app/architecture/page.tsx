import React from "react";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";

interface PipelineStage {
  n: number;
  layer: string;
  title: string;
  tech: string[];
  detail: string;
  color: string;
}

const STAGES: PipelineStage[] = [
  {
    n: 1,
    layer: "Data Ingestion",
    title: "SEC EDGAR + Market Data",
    tech: ["EDGAR EFTS API", "OpenFIGI API", "116M 13F filings", "2004–2024"],
    detail: "Bulk-download all Form 13F XML filings via EDGAR Full-Text Search. Resolve 3.4M CUSIP → ticker mappings through OpenFIGI batch API with local LRU cache.",
    color: "#3b82f6",
  },
  {
    n: 2,
    layer: "Storage & Processing",
    title: "DuckDB + Polars Engine",
    tech: ["DuckDB 0.10", "Polars 0.20", "Parquet columnar", "8-core parallel"],
    detail: "Columnar Parquet storage on local NVMe. DuckDB handles 116M-row analytical queries in <2s. Polars computes 14 behavioral features per manager-quarter in a single lazy scan.",
    color: "#8a2be2",
  },
  {
    n: 3,
    layer: "Manager DNA",
    title: "HDBSCAN + UMAP Clustering",
    tech: ["UMAP (n_neighbors=15)", "HDBSCAN (min_cluster=50)", "14 features", "4 archetypes"],
    detail: "UMAP reduces 14-dimensional feature space to 2D embedding. HDBSCAN identifies density-connected clusters without requiring a fixed k. Cosine similarity labels each cluster to archetype.",
    color: "#f59e0b",
  },
  {
    n: 4,
    layer: "Macro Intelligence",
    title: "Gaussian HMM — 4 States",
    tech: ["hmmlearn", "VIX + yield curve", "OFR stress index", "24-quarter history"],
    detail: "Gaussian HMM on macro features (VIX, yield-curve slope, credit spreads, Fed funds delta, OFR FSI). Cosine similarity assigns each state to: Goldilocks, Recovery, Rate Shock, or Recession Fear.",
    color: "#10b981",
  },
  {
    n: 5,
    layer: "Alpha Engine",
    title: "RACS Signal Generator",
    tech: ["Regime-conditioned", "Crowding penalty", "Activist conviction", "500 signals/quarter"],
    detail: "RACS = consensus_weight × log(activist_buyers + 1.1) × (1 − crowding) × (1 ± regime_weight × regime_prob). Top 500 signals ranked by regime_adjusted_racs per quarter.",
    color: "#8a2be2",
  },
  {
    n: 6,
    layer: "Research Validation",
    title: "EvaluationGate — Bailey et al.",
    tech: ["Walk-forward (10 folds)", "DSR > 1.0", "PBO ≤ 0.40", "3× Monte Carlo"],
    detail: "Expanding-window walk-forward across 10 folds (2010–2024). Deflated Sharpe Ratio adjusts for multiple testing. CSCV with C(16,8)=12,870 path combinations computes PBO. Three Monte Carlo null tests at N=1000 each.",
    color: "#10b981",
  },
  {
    n: 7,
    layer: "Intelligence Synthesis",
    title: "Static Artifact Export",
    tech: ["7 JSON artifacts", "~360KB raw", "~60KB gzipped", "SHA-256 hashed"],
    detail: "export_static_artifacts.py produces 7 typed JSON files from pipeline outputs. Each artifact is SHA-256 hashed and recorded in metadata.json for provenance. This is the only output committed to git.",
    color: "#ef4444",
  },
  {
    n: 8,
    layer: "Delivery",
    title: "Vercel CDN + Next.js",
    tech: ["Next.js 14 App Router", "Static export", "Edge CDN", "Vercel free tier"],
    detail: "Next.js server components read artifacts at build time (fs.readFileSync). Output is a fully static site served from Vercel's global edge CDN. Zero cold-starts, zero compute cost per request.",
    color: "#3b82f6",
  },
];

const PLATFORM_TIERS = [
  {
    name: "Local Compute",
    desc: "Your machine / CI runner",
    role: "Runs the full 116M-row pipeline. DuckDB + Polars + ML models. Never touches prod.",
    cost: "$0",
    items: ["DuckDB 0.10", "Polars 0.20", "scikit-learn HMM", "HDBSCAN / UMAP", "Pyarrow / Parquet"],
    color: "#8a2be2",
  },
  {
    name: "Hugging Face Spaces",
    desc: "CPU Basic — 2 vCPU / 16 GB",
    role: "Hosts the Python research API (FastAPI). Answers methodology + metadata queries. Cold-starts acceptable since frontend is static-first.",
    cost: "$0",
    items: ["FastAPI + Uvicorn", "Governance endpoint", "Pipeline status API", "CORS for Vercel"],
    color: "#f59e0b",
  },
  {
    name: "Vercel Edge CDN",
    desc: "Free tier — 100 GB bandwidth",
    role: "Serves the Next.js static export globally. All artifact data is pre-rendered at build time. Zero server-side compute per visitor request.",
    cost: "$0",
    items: ["Next.js 14 static export", "Global edge CDN", "GitHub Actions CI/CD", "Automatic HTTPS"],
    color: "#10b981",
  },
];

const FLEX_POINTS = [
  {
    label: "Zero-Copy Column Scan",
    detail: "DuckDB scans 116M Parquet rows in <2s on a laptop using SIMD-vectorised columnar execution — no Spark cluster needed.",
  },
  {
    label: "Intelligence Tier Pattern",
    detail: "Heavy compute stays local; only synthesized insights (7 JSON files) cross the network boundary. Mirrors institutional quant stack separation.",
  },
  {
    label: "Provenance Chain",
    detail: "Every artifact carries run_id, git_commit, and SHA-256 hash. Metadata artifact hashes all 6 siblings. Full audit trail from raw filing to live dashboard.",
  },
  {
    label: "Static-First, No Cold Starts",
    detail: "Frontend renders entirely from pre-baked JSON at build time. Vercel edge CDN delivers sub-50ms globally with no compute layer in the request path.",
  },
  {
    label: "Free-Tier $0 Total Cost",
    detail: "Vercel (100 GB BW) + HF Spaces (CPU Basic) + GitHub Actions (2000 min/month) = $0/month. Architecture scales to $0 because compute is front-loaded locally.",
  },
  {
    label: "Deterministic Reproducibility",
    detail: "SHA-256 seeds on UMAP/HDBSCAN, pinned library versions, and deterministic DuckDB aggregations ensure byte-identical artifact output on any machine.",
  },
];

function StageArrow() {
  return (
    <div style={{ display: "flex", justifyContent: "center", margin: "0.15rem 0" }}>
      <div style={{ width: 2, height: 28, background: "rgba(255,255,255,0.12)", position: "relative" }}>
        <div style={{
          position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%)",
          width: 0, height: 0,
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
          borderTop: "7px solid rgba(255,255,255,0.18)",
        }} />
      </div>
    </div>
  );
}

export default function ArchitecturePage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>

      {/* Platform tiers */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="Platform Tiers"
          description="Three isolated layers. Local compute handles all heavy ML work; only synthesized JSON artifacts cross the network boundary."
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.25rem" }}>
          {PLATFORM_TIERS.map((t) => (
            <GlassCard key={t.name} hierarchy="primary">
              <div style={{
                display: "inline-block",
                padding: "0.2rem 0.6rem",
                borderRadius: 4,
                fontSize: "0.68rem",
                fontWeight: 700,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                backgroundColor: `${t.color}20`,
                color: t.color,
                marginBottom: "0.75rem",
              }}>
                {t.name}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>{t.desc}</div>
              <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 1rem" }}>{t.role}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {t.items.map((item) => (
                  <div key={item} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: t.color, flexShrink: 0 }} />
                    <span style={{ fontSize: "0.78rem", fontFamily: "monospace", color: "var(--text-secondary)" }}>{item}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Monthly Cost</span>
                <span style={{ fontSize: "1.4rem", fontWeight: 800, color: t.color }}>{t.cost}</span>
              </div>
            </GlassCard>
          ))}
        </div>
      </RevealContainer>

      {/* Pipeline flow */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="Data Pipeline — 8 Stages"
          description="End-to-end flow from SEC EDGAR raw XML to interactive dashboard. All ML compute happens locally; the CDN serves only pre-rendered intelligence."
        />
        <div style={{ display: "flex", flexDirection: "column" }}>
          {STAGES.map((s, i) => (
            <React.Fragment key={s.n}>
              <GlassCard hierarchy={i % 2 === 0 ? "primary" : "secondary"}>
                <div style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start" }}>
                  {/* Stage number */}
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    backgroundColor: `${s.color}22`,
                    border: `2px solid ${s.color}66`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.9rem", fontWeight: 800, color: s.color,
                    flexShrink: 0,
                  }}>
                    {s.n}
                  </div>
                  <div style={{ flex: 1 }}>
                    {/* Layer badge + title */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem", flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.08em",
                        textTransform: "uppercase", color: s.color,
                      }}>
                        {s.layer}
                      </span>
                      <span style={{ fontSize: "1rem", fontWeight: 700 }}>{s.title}</span>
                    </div>
                    {/* Detail */}
                    <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 0.75rem" }}>{s.detail}</p>
                    {/* Tech pills */}
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                      {s.tech.map((t) => (
                        <span key={t} style={{
                          padding: "0.15rem 0.5rem",
                          borderRadius: 3,
                          fontSize: "0.7rem",
                          fontFamily: "monospace",
                          backgroundColor: `${s.color}14`,
                          color: s.color,
                          border: `1px solid ${s.color}33`,
                        }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </GlassCard>
              {i < STAGES.length - 1 && <StageArrow />}
            </React.Fragment>
          ))}
        </div>
      </RevealContainer>

      {/* Technical flex points */}
      <RevealContainer threshold={0.15}>
        <SectionHeader
          title="Engineering Differentiators"
          description="Design decisions that demonstrate institutional-grade thinking within zero-cost constraints."
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
          {FLEX_POINTS.map((f, i) => (
            <GlassCard key={f.label} hierarchy="secondary" delayIndex={i}>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  backgroundColor: "#8a2be2", flexShrink: 0, marginTop: 6,
                }} />
                <div>
                  <div style={{ fontSize: "0.88rem", fontWeight: 700, marginBottom: "0.35rem" }}>{f.label}</div>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{f.detail}</p>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      </RevealContainer>

      {/* Stack summary table */}
      <RevealContainer threshold={0.15}>
        <GlassCard hierarchy="secondary">
          <SectionHeader title="Full Technology Stack" description="Pinned versions as of pipeline v4.16" />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 540 }}>
              <thead>
                <tr>
                  {["Component", "Library / Service", "Version", "Role"].map((h, i) => (
                    <th key={h} style={{
                      padding: "0.5rem 0.75rem",
                      textAlign: i === 0 ? "left" : "left",
                      fontSize: "0.68rem", fontWeight: 600,
                      letterSpacing: "0.06em", textTransform: "uppercase",
                      color: "var(--text-secondary)",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Data Storage", "DuckDB", "0.10", "In-process OLAP on 116M Parquet rows"],
                  ["DataFrame", "Polars", "0.20", "Lazy columnar feature engineering"],
                  ["Clustering", "HDBSCAN", "0.8.33", "Density-based archetype assignment"],
                  ["Dimensionality Reduction", "UMAP-learn", "0.5", "2D embedding for visualization"],
                  ["Regime Detection", "hmmlearn", "0.3.2", "Gaussian HMM, 4 hidden states"],
                  ["Web Framework", "FastAPI", "0.111", "Research API on HF Spaces"],
                  ["Frontend", "Next.js", "14.2", "App Router + static export"],
                  ["Charts", "recharts", "2.12", "SSR-safe client-side charts"],
                  ["Backtest", "Custom engine", "v4.16", "Walk-forward, costs, EvaluationGate"],
                  ["CI/CD", "GitHub Actions", "—", "Build → artifact export → Vercel deploy"],
                  ["CDN", "Vercel Edge", "—", "Global static delivery, free tier"],
                  ["API Host", "HF Spaces CPU Basic", "—", "2 vCPU / 16 GB RAM, free tier"],
                ].map(([comp, lib, ver, role]) => (
                  <tr key={comp}>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", color: "var(--text-secondary)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>{comp}</td>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.82rem", fontFamily: "monospace", fontWeight: 600, color: "#8a2be2", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>{lib}</td>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.78rem", fontFamily: "monospace", color: "var(--text-secondary)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>{ver}</td>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", color: "var(--text-secondary)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>{role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </RevealContainer>
    </div>
  );
}
