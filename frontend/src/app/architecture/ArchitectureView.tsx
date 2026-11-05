"use client";

import React, { useState, useEffect, useRef } from "react";

/* ══════════════════════════════════════════════════════════════════════════════
   DATA
══════════════════════════════════════════════════════════════════════════════ */

const TABS = [
  { id: "overview",    label: "System Overview",    icon: "◈" },
  { id: "pipeline",   label: "Data Pipeline",       icon: "⟶" },
  { id: "ml",         label: "ML Architecture",     icon: "◎" },
  { id: "deployment", label: "Deployment",          icon: "⬡" },
] as const;
type TabId = typeof TABS[number]["id"];

interface Node {
  id: string; label: string; sublabel: string; color: string;
  x: number; y: number; icon: string;
  detail: { title: string; desc: string; tech: string[]; metrics?: { k: string; v: string }[] };
}

/** Serializable facts passed from the server page (see lib/facts.ts). */
export interface ArchitectureFacts {
  filingsRowsShort: string;
  firstQuarter: string;
  period: string;
  totalQuarters: string;
  totalManagers: string;
  clusteredManagers: string;
  namedArchetypes: number;
  noisePct: string;
  regimeObservations: number;
  totalSignals: string;
  signalQuarters: number;
  provenancePct: string;
  gatePassed: boolean;
  failedGateChecks: string[];
  dsr: string;
  pbo: string;
  monteCarlo: string;
  sharpe: string;
  trades: string;
  holdingDays: string;
}

function buildOverviewNodes(f: ArchitectureFacts): Node[] {
  return [
  {
    id: "edgar", label: "SEC EDGAR", sublabel: `${f.filingsRowsShort} filing rows`,
    color: "#3b82f6", x: 14, y: 18, icon: "📄",
    detail: {
      title: "SEC EDGAR Data Source",
      desc: `All 53 SEC Form 13F structured-data bulk files (INFOTABLE and COVERPAGE TSVs), ingested one batch at a time into Hive-partitioned Parquet. Structured data starts in 2013 Q2; earlier quarters (back to ${f.firstQuarter}) come only from late amendments in newer files.`,
      tech: ["SEC 13F bulk TSVs", "CUSIP identifiers", "Hive-partitioned Parquet", "Subprocess isolation"],
      metrics: [{ k: "Filing rows", v: f.filingsRowsShort }, { k: "Period", v: f.period }, { k: "Quarters", v: f.totalQuarters }, { k: "Managers", v: f.totalManagers }],
    },
  },
  {
    id: "fred", label: "FRED", sublabel: "Macro features",
    color: "#38bdf8", x: 14, y: 45, icon: "📈",
    detail: {
      title: "Federal Reserve Economic Data",
      desc: "FRED provides the macro inputs: VIX, 10Y–2Y yield spread, high-yield credit spread, and the Fed funds rate (as a quarterly delta). OFR stress data was unavailable, so FRED's NFCIRISK stands in for it. Together they form the 5-feature input to the Gaussian HMM.",
      tech: ["FRED API", "NFCIRISK (OFR stand-in)", "Quarterly resampling", "Provenance tracking"],
      metrics: [{ k: "Features", v: "5 macro series" }, { k: "History", v: `${f.regimeObservations} quarters` }, { k: "Update", v: "Quarterly" }],
    },
  },
  {
    id: "duckdb", label: "DuckDB Engine", sublabel: "In-process OLAP",
    color: "#8a2be2", x: 38, y: 30, icon: "⚡",
    detail: {
      title: "DuckDB In-Process OLAP",
      desc: `DuckDB runs the analytical queries over all ${f.filingsRowsShort} filing rows in process, scanning Hive-partitioned Parquet directly. Ingestion runs under a 2 GB memory cap after an unbounded first attempt crashed the machine; no server, no Spark cluster.`,
      tech: ["DuckDB", "Parquet columnar", "Temp-table staging", "Polars"],
      metrics: [{ k: "Memory cap", v: "2 GB" }, { k: "Engine", v: "In-process" }, { k: "Cost", v: "$0" }],
    },
  },
  {
    id: "dna", label: "Manager DNA", sublabel: "HDBSCAN clustering",
    color: "#f59e0b", x: 60, y: 18, icon: "🧬",
    detail: {
      title: "Manager DNA Engine",
      desc: `14 behavioural features (HHI, turnover, holding duration, etc.) are computed per manager in a staged DuckDB pipeline, for the ${f.clusteredManagers} managers with at least four filed quarters. HDBSCAN finds density-connected archetypes without a fixed k; UMAP is used for the 2D display. Cosine similarity labels each cluster.`,
      tech: ["HDBSCAN", "UMAP (display)", "14 features", "Cosine similarity labeling"],
      metrics: [{ k: "Managers", v: f.clusteredManagers }, { k: "Named archetypes", v: String(f.namedArchetypes) }, { k: "Noise", v: f.noisePct }],
    },
  },
  {
    id: "hmm", label: "HMM Regimes", sublabel: "4 macro states",
    color: "#10b981", x: 60, y: 45, icon: "🌊",
    detail: {
      title: "Gaussian HMM Macro Regime Detector",
      desc: "A 4-state full-covariance Gaussian HMM is fit on 5 macro features. Label switching is resolved via cosine similarity: each state's emission means are compared to prototype vectors for Goldilocks, Recovery, Rate Shock, and Recession Fear. On the real macro history the fit did not converge; that is logged and reported, not hidden.",
      tech: ["hmmlearn", "Full covariance", "NFCIRISK", "Viterbi decoding"],
      metrics: [{ k: "States", v: "4 regimes" }, { k: "Observations", v: String(f.regimeObservations) }, { k: "Converged", v: "No" }],
    },
  },
  {
    id: "racs", label: "RACS Engine", sublabel: "Signal generation",
    color: "#a855f7", x: 82, y: 30, icon: "◎",
    detail: {
      title: "Regime-Adjusted Conviction Score",
      desc: "racs_raw = consensus_weight × ln(activist_buyers + 1.1), requiring at least two distinct Conviction Activist buyers, discounted for crowding and blended with the regime as racs_raw × (1 + 0.3 × regime_confidence). Top-decile signals with resolvable prices go to the backtest.",
      tech: ["DuckDB SQL", "regime_weight 0.3", "Crowding discount", "≥2 activist buyers"],
      metrics: [{ k: "Signals", v: f.totalSignals }, { k: "Quarters", v: String(f.signalQuarters) }, { k: "Priced trades", v: f.trades }],
    },
  },
  {
    id: "gate", label: "EvaluationGate", sublabel: "Bailey et al.",
    color: "#10b981", x: 82, y: 57, icon: "🔒",
    detail: {
      title: "Research Publication Gate",
      desc: f.gatePassed
        ? "Four checks must all pass before any signal is published: leakage audit, provenance ≥ 90%, reproducibility, and PBO ≤ 40%. Deflated Sharpe and three Monte Carlo null tests are reported alongside. The latest real run passed."
        : `Four checks must all pass before any signal is published: leakage audit, provenance ≥ 90%, reproducibility, and PBO ≤ 40%. The latest real run was REJECTED (failed: ${f.failedGateChecks.join(", ")}). With so few priced trades, PBO and Deflated Sharpe could not be estimated.`,
      tech: ["Deflated Sharpe Ratio", "CSCV PBO (Bailey 2016)", "Monte Carlo N=1000", "Leakage audit"],
      metrics: [{ k: "Gate", v: f.gatePassed ? "Passed" : "Rejected" }, { k: "PBO", v: f.pbo }, { k: "DSR", v: f.dsr }, { k: "MC significant", v: f.monteCarlo }],
    },
  },
  {
    id: "portfolio", label: "Portfolio", sublabel: "Risk-budgeted",
    color: "#ef4444", x: 82, y: 75, icon: "⚖️",
    detail: {
      title: "Portfolio Constructor",
      desc: "PortfolioConstructor converts validated RACS signals into risk-budgeted portfolio weights. Applies volatility targeting, per-position cap (max_position_pct), sector cap (max_sector_pct), and T+1 fill delay with slippage.",
      tech: ["Volatility targeting", "Position cap 5%", "Sector cap 25%", "T+1 fill realism"],
      metrics: [{ k: "Priced trades", v: f.trades }, { k: "Sharpe (ann.)", v: f.sharpe }, { k: "Holding", v: `${f.holdingDays} days` }],
    },
  },
  {
    id: "export", label: "Artifact Export", sublabel: "7 JSON files",
    color: "#f59e0b", x: 50, y: 75, icon: "📦",
    detail: {
      title: "Static Artifact Export",
      desc: "export_static_artifacts.py materialises all pipeline outputs into 7 typed JSON files: signals, regimes, clusters, portfolio, backtest, validation, metadata. Each is SHA-256 hashed, and every number on this dashboard is read from them at build time.",
      tech: ["SHA-256 provenance", "7 typed artifacts", "Pydantic validation", "Git-committed"],
      metrics: [{ k: "Artifacts", v: "7 files" }, { k: "Hash", v: "SHA-256" }],
    },
  },
  {
    id: "frontend", label: "Next.js 14", sublabel: "Static export",
    color: "#3b82f6", x: 50, y: 92, icon: "🌐",
    detail: {
      title: "Next.js 14 App Router: Static Export",
      desc: "Server components read artifacts via fs.readFileSync at build time, so no server-side compute runs per request. Recharts renders charts client-side. GitHub Actions builds and deploys to Vercel.",
      tech: ["Next.js 14 App Router", "TypeScript strict", "Recharts", "Vercel Edge CDN"],
      metrics: [{ k: "Rendering", v: "Build-time" }, { k: "Hosting", v: "Vercel" }, { k: "Runtime compute", v: "None" }],
    },
  },
];
}

// Edges: [from, to]
const OVERVIEW_EDGES: [string, string][] = [
  ["edgar", "duckdb"], ["fred", "duckdb"],
  ["duckdb", "dna"], ["duckdb", "hmm"],
  ["dna", "racs"], ["hmm", "racs"],
  ["racs", "gate"], ["gate", "portfolio"],
  ["portfolio", "export"], ["racs", "export"],
  ["export", "frontend"],
];

/* ══════════════════════════════════════════════════════════════════════════════
   SVG OVERVIEW DIAGRAM
══════════════════════════════════════════════════════════════════════════════ */

function FlowDiagram({ nodes, edges, selected, onSelect }: {
  nodes: Node[]; edges: [string, string][];
  selected: string | null; onSelect: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [animStep, setAnimStep] = useState(0);
  useEffect(() => {
    setTimeout(() => setMounted(true), 100);
    const iv = setInterval(() => setAnimStep(s => (s + 1) % edges.length), 600);
    return () => clearInterval(iv);
  }, [edges.length]);

  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));

  return (
    <div style={{ position: "relative", width: "100%", paddingBottom: "60%", overflow: "hidden" }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <defs>
          {nodes.map(n => (
            <radialGradient key={`grad-${n.id}`} id={`grad-${n.id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={n.color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={n.color} stopOpacity="0.05" />
            </radialGradient>
          ))}
          <marker id="arrowhead" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
            <path d="M0,0 L4,2 L0,4 Z" fill="rgba(255,255,255,0.2)" />
          </marker>
          <marker id="arrowhead-active" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
            <path d="M0,0 L4,2 L0,4 Z" fill="rgba(138,43,226,0.9)" />
          </marker>
          <filter id="glow">
            <feGaussianBlur stdDeviation="0.8" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Background grid */}
        {[20, 40, 60, 80].map(x => (
          <line key={`vg${x}`} x1={x} y1={0} x2={x} y2={100} stroke="rgba(255,255,255,0.03)" strokeWidth="0.2" />
        ))}
        {[20, 40, 60, 80].map(y => (
          <line key={`hg${y}`} x1={0} y1={y} x2={100} y2={y} stroke="rgba(255,255,255,0.03)" strokeWidth="0.2" />
        ))}

        {/* Edges */}
        {edges.map(([fromId, toId], i) => {
          const from = nodeMap[fromId];
          const to = nodeMap[toId];
          if (!from || !to) return null;
          const isActive = animStep === i && mounted;
          const isSelected = selected === fromId || selected === toId;
          return (
            <g key={`${fromId}-${toId}`}>
              <line
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={isSelected ? "rgba(138,43,226,0.5)" : isActive ? "rgba(138,43,226,0.4)" : "rgba(255,255,255,0.07)"}
                strokeWidth={isSelected ? 0.5 : isActive ? 0.4 : 0.2}
                markerEnd={isActive || isSelected ? "url(#arrowhead-active)" : "url(#arrowhead)"}
                style={{ transition: "stroke 0.3s, stroke-width 0.3s" }}
              />
              {isActive && (
                <circle r="0.7" fill="#8a2be2" opacity="0.9" filter="url(#glow)">
                  <animateMotion dur="0.6s" fill="freeze">
                    <mpath href={`#path-${fromId}-${toId}`} />
                  </animateMotion>
                </circle>
              )}
              <path id={`path-${fromId}-${toId}`} d={`M${from.x},${from.y} L${to.x},${to.y}`} fill="none" />
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((n, i) => {
          const isSelected = selected === n.id;
          const isConnected = selected ? OVERVIEW_EDGES.some(([f, t]) => (f === selected && t === n.id) || (t === selected && f === n.id)) : false;
          const dimmed = selected && !isSelected && !isConnected;
          return (
            <g
              key={n.id}
              style={{ cursor: "pointer", transition: "opacity 0.3s", opacity: dimmed ? 0.3 : 1 }}
              onClick={() => onSelect(n.id)}
            >
              {/* Glow ring when selected */}
              {isSelected && (
                <circle cx={n.x} cy={n.y} r={6} fill="none" stroke={n.color} strokeWidth="0.4" opacity="0.5">
                  <animate attributeName="r" values="5;7;5" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0.2;0.5" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              {/* Node circle */}
              <circle
                cx={n.x} cy={n.y} r={isSelected ? 5.2 : 4.5}
                fill={`url(#grad-${n.id})`}
                stroke={n.color}
                strokeWidth={isSelected ? 0.7 : 0.4}
                style={{ transition: "r 0.2s, stroke-width 0.2s" }}
                filter={isSelected ? "url(#glow)" : undefined}
              />
              {/* Icon */}
              <text x={n.x} y={n.y + 0.9} textAnchor="middle" fontSize={3.5} style={{ userSelect: "none", pointerEvents: "none" }}>
                {n.icon}
              </text>
              {/* Label */}
              <text x={n.x} y={n.y + 7.5} textAnchor="middle" fontSize={1.8} fontWeight="700" fill={isSelected ? n.color : "rgba(255,255,255,0.85)"} style={{ transition: "fill 0.2s", userSelect: "none", pointerEvents: "none" }}>
                {n.label}
              </text>
              <text x={n.x} y={n.y + 9.5} textAnchor="middle" fontSize={1.4} fill="rgba(255,255,255,0.4)" style={{ userSelect: "none", pointerEvents: "none" }}>
                {n.sublabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   NODE DETAIL PANEL
══════════════════════════════════════════════════════════════════════════════ */
function NodeDetail({ node, onClose }: { node: Node; onClose: () => void }) {
  return (
    <div style={{
      borderRadius: 16,
      border: `1px solid ${node.color}44`,
      backgroundColor: `${node.color}09`,
      padding: "1.5rem",
      animation: "slideInRight 0.3s cubic-bezier(0.16,1,0.3,1)",
    }}>
      <style>{`@keyframes slideInRight { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:translateX(0); } }`}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <div style={{
            width: 42, height: 42, borderRadius: 11,
            backgroundColor: `${node.color}18`, border: `1px solid ${node.color}44`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem",
          }}>
            {node.icon}
          </div>
          <div>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--text-primary)" }}>{node.detail.title}</div>
            <div style={{ fontSize: "0.63rem", fontWeight: 700, color: node.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>{node.sublabel}</div>
          </div>
        </div>
        <button onClick={onClose} style={{
          background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
          color: "var(--text-muted)", cursor: "pointer", padding: "0.25rem 0.55rem", fontSize: "0.75rem",
        }}>✕</button>
      </div>

      <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.7, margin: "0 0 1rem" }}>
        {node.detail.desc}
      </p>

      {node.detail.metrics && (
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
          {node.detail.metrics.map(({ k, v }) => (
            <div key={k} style={{
              padding: "0.5rem 0.85rem", borderRadius: 8,
              backgroundColor: `${node.color}12`, border: `1px solid ${node.color}28`,
              textAlign: "center",
            }}>
              <div style={{ fontSize: "0.58rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.15rem" }}>{k}</div>
              <div style={{ fontSize: "0.95rem", fontWeight: 800, color: node.color, fontFamily: "monospace" }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {node.detail.tech.map(t => (
          <span key={t} style={{
            padding: "0.18rem 0.55rem", borderRadius: 4, fontSize: "0.68rem",
            fontFamily: "monospace", fontWeight: 600,
            backgroundColor: `${node.color}14`, color: node.color, border: `1px solid ${node.color}33`,
          }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   DATA PIPELINE VIEW
══════════════════════════════════════════════════════════════════════════════ */
function buildPipelineStages(f: ArchitectureFacts) {
  return [
  {
    n: 1, phase: "Ingestion", color: "#3b82f6",
    title: "SEC EDGAR + FRED",
    what: "Raw data acquisition from public sources",
    detail: "EDGARIngester ingests all 53 SEC Form 13F bulk files (INFOTABLE and COVERPAGE TSVs) into Hive-partitioned Parquet, one batch per isolated subprocess under a 2 GB DuckDB memory cap. FREDIngester pulls the macro series; FRED NFCIRISK stands in for unavailable OFR stress data.",
    tech: ["SEC 13F bulk TSVs", "FRED API", "Parquet (Hive-partitioned)", "Subprocess isolation"],
    latency: "Batch per file",
    scale: `${f.filingsRowsShort} rows · ${f.totalQuarters} quarters`,
  },
  {
    n: 2, phase: "CUSIP Resolution", color: "#38bdf8",
    title: "CUSIPMapper → Ticker",
    what: "Map opaque CUSIP codes to tradeable tickers",
    detail: `CUSIPMapper resolves CUSIPs through the keyless OpenFIGI API in batches of 10 (its hard limit; larger batches return HTTP 413), with a delay between requests, and caches results to Parquet. An unmapped CUSIP stays unmapped rather than being guessed. Real-run resolution for the signal universe: ${f.provenancePct}, below the gate's 90% threshold.`,
    tech: ["OpenFIGI batch API", "Batch size 10", "Parquet cache", "ProvenanceTracker"],
    latency: "Rate-limited",
    scale: `${f.provenancePct} resolved`,
  },
  {
    n: 3, phase: "Feature Engineering", color: "#8a2be2",
    title: "ManagerDNABuilder (14 features)",
    what: "Compress raw filing rows into behavioural feature vectors",
    detail: "ManagerDNABuilder runs a six-stage DuckDB pipeline with staged temp tables to compute 14 features per manager: HHI, put ratio, log AUM, turnover, conviction delta, new position rate, exit rate, holding duration, top-5 concentration, options notional ratio, shared vote ratio, amendment rate, quarters active, AUM volatility. Managers need at least four filed quarters.",
    tech: ["DuckDB", "Staged temp tables", "14 behavioural features", "ManagerDNAContract validation"],
    latency: "Batch",
    scale: `${f.clusteredManagers} of ${f.totalManagers} managers`,
  },
  {
    n: 4, phase: "Clustering", color: "#f59e0b",
    title: "UMAP → HDBSCAN → Archetypes",
    what: "Discover manager behavioural phenotypes without labels",
    detail: `HDBSCAN sweeps min_cluster_size over [50, 100, 150, 200, 300] and keeps the best by silhouette score; UMAP (n_neighbors=30, min_dist=0.1) gives the 2D view. Cosine similarity between cluster centroids and prototype vectors assigns archetype labels. The real run produced ${f.namedArchetypes} named archetypes (Index Huggers and Conviction Activists), with ${f.noisePct} of managers left as noise.`,
    tech: ["HDBSCAN", "UMAP", "Silhouette sweep", "Cosine archetype labeling"],
    latency: "Batch",
    scale: `${f.namedArchetypes} archetypes · ${f.noisePct} noise`,
  },
  {
    n: 5, phase: "Regime Detection", color: "#10b981",
    title: "Gaussian HMM (4 states)",
    what: "Identify the current macro environment",
    detail: `MacroRegimeDetector fits a 4-state full-covariance Gaussian HMM on 5 FRED features over ${f.regimeObservations} quarterly observations. Label switching is resolved via cosine similarity to a prototype vector for each named regime. On the real history the fit did not converge; the run logs it and continues, and regime probabilities should be read with that caveat.`,
    tech: ["hmmlearn", "5 macro features", "Viterbi decoding", "Cosine label-switching fix"],
    latency: "Batch",
    scale: "4 states · not converged",
  },
  {
    n: 6, phase: "Signal Generation", color: "#a855f7",
    title: "RACSEngine → Top Signals",
    what: "Score every ticker-quarter by activist conviction × macro tailwind",
    detail: `RACSEngine joins 13F rows with manager DNA clusters and applies the RACS formula in DuckDB SQL, requiring at least two distinct Conviction Activist buyers per stock-quarter. Results are sorted by regime_adjusted_racs. The real run produced ${f.totalSignals} signals across ${f.signalQuarters} quarters.`,
    tech: ["DuckDB SQL", "RACS formula", "regime_weight 0.3", "Crowding discount"],
    latency: "Batch",
    scale: `${f.totalSignals} signals`,
  },
  {
    n: 7, phase: "Backtesting", color: "#ef4444",
    title: "AlphaFactoryEngine + EvaluationGate",
    what: "Validate signal quality under institutional publication standards",
    detail: `AlphaFactoryEngine runs an event-study backtest with a 45-day filing lag, T+1 fills, and transaction costs. WalkForwardValidator, PBO (CSCV), Deflated Sharpe, and three Monte Carlo null tests follow, then the EvaluationGate. Real run: ${f.trades} priced trades, annualised Sharpe ${f.sharpe}; too few trades for walk-forward folds, PBO, or DSR; Monte Carlo significant in ${f.monteCarlo}. Gate: ${f.gatePassed ? "passed" : "rejected"}.`,
    tech: ["45-day lag enforcement", "T+1 fill realism", "DSR + PBO + Monte Carlo", "Walk-forward"],
    latency: "Batch",
    scale: f.gatePassed ? "Gate passed" : "Gate rejected",
  },
  {
    n: 8, phase: "Export & Delivery", color: "#3b82f6",
    title: "Static Artifacts → Vercel CDN",
    what: "Publish research intelligence to the global edge",
    detail: "export_static_artifacts.py materialises 7 typed JSON artifacts with SHA-256 hashes. GitHub Actions builds the Next.js app (server components read the JSONs at build time) and deploys it to Vercel. No compute runs per visitor.",
    tech: ["7 SHA-256 artifacts", "GitHub Actions CI/CD", "Next.js static export", "Vercel Edge CDN"],
    latency: "On push",
    scale: "7 artifacts",
  },
];
}

function PipelineView({ stages }: { stages: ReturnType<typeof buildPipelineStages> }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setTimeout(() => setMounted(true), 100); }, []);

  return (
    <div style={{ display: "flex", gap: "1.5rem" }}>
      {/* Stage list */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0" }}>
        {stages.map((s, i) => {
          const isSelected = selected === i;
          return (
            <div key={s.n}>
              <div
                onClick={() => setSelected(isSelected ? null : i)}
                style={{
                  display: "flex", alignItems: "center", gap: "1rem",
                  padding: "1rem 1.25rem",
                  borderRadius: isSelected ? 12 : 10,
                  border: `1px solid ${isSelected ? s.color + "55" : "rgba(255,255,255,0.06)"}`,
                  backgroundColor: isSelected ? `${s.color}0e` : "rgba(255,255,255,0.02)",
                  cursor: "pointer",
                  transition: "all 0.2s cubic-bezier(0.16,1,0.3,1)",
                  transform: isSelected ? "scale(1.01)" : "scale(1)",
                  marginBottom: "0.35rem",
                  opacity: mounted ? 1 : 0,
                  transitionDelay: `${i * 50}ms`,
                }}
              >
                {/* Stage number */}
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  backgroundColor: `${s.color}1a`, border: `1.5px solid ${s.color}66`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.82rem", fontWeight: 800, color: s.color, flexShrink: 0,
                  boxShadow: isSelected ? `0 0 12px ${s.color}40` : "none",
                  transition: "box-shadow 0.2s",
                }}>
                  {s.n}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.15rem" }}>
                    <span style={{ fontSize: "0.6rem", fontWeight: 700, color: s.color, letterSpacing: "0.09em", textTransform: "uppercase" }}>{s.phase}</span>
                  </div>
                  <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.1rem" }}>{s.title}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{s.what}</div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.2rem", flexShrink: 0 }}>
                  <span style={{ fontSize: "0.62rem", color: s.color, fontFamily: "monospace", fontWeight: 600 }}>{s.latency}</span>
                  <span style={{ fontSize: "0.6rem", color: "var(--text-muted)", fontFamily: "monospace" }}>{s.scale}</span>
                </div>

                <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", transform: isSelected ? "rotate(90deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>›</span>
              </div>

              {/* Expanded detail */}
              {isSelected && (
                <div style={{
                  margin: "0 0 0.75rem 3.25rem",
                  borderRadius: "0 0 10px 10px",
                  border: `1px solid ${s.color}22`, borderTop: "none",
                  backgroundColor: `${s.color}06`,
                  padding: "1rem 1.25rem",
                  animation: "expandDown 0.25s cubic-bezier(0.16,1,0.3,1)",
                }}>
                  <style>{`@keyframes expandDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }`}</style>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.7, margin: "0 0 0.85rem" }}>{s.detail}</p>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {s.tech.map(t => (
                      <span key={t} style={{
                        padding: "0.15rem 0.55rem", borderRadius: 4, fontSize: "0.68rem",
                        fontFamily: "monospace", fontWeight: 600,
                        backgroundColor: `${s.color}14`, color: s.color, border: `1px solid ${s.color}30`,
                      }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Connector line between stages */}
              {i < stages.length - 1 && (
                <div style={{ display: "flex", justifyContent: "flex-start", paddingLeft: "1.75rem", marginBottom: "0" }}>
                  <div style={{ width: 1.5, height: 10, backgroundColor: `${stages[i + 1].color}44`, borderRadius: 1 }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Side progress indicator */}
      <div style={{ width: 3, position: "relative", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
        {stages.map((s, i) => (
          <div key={s.n} style={{ flex: 1, width: 2, backgroundColor: selected === i ? s.color : `${s.color}30`, borderRadius: 2, transition: "background-color 0.3s", boxShadow: selected === i ? `0 0 8px ${s.color}` : "none" }} />
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   ML ARCHITECTURE VIEW
══════════════════════════════════════════════════════════════════════════════ */
function buildMlComponents(f: ArchitectureFacts) {
  return [
  {
    group: "Feature Engineering",
    color: "#8a2be2",
    icon: "⊕",
    items: [
      { name: "ManagerDNABuilder", role: "14 behavioural features per manager via a staged DuckDB pipeline" },
      { name: "avg_hhi / avg_turnover", role: "Portfolio concentration and churn rate signals" },
      { name: "conviction_delta", role: "Average QoQ position size change on entry" },
      { name: "top5_concentration", role: "% AUM in the manager's five largest holdings" },
    ],
    insight: "All 14 features are Z-score normalised before passing to UMAP. No label information is used at any stage; archetypes are fully unsupervised.",
  },
  {
    group: "Dimensionality Reduction",
    color: "#f59e0b",
    icon: "⟶",
    items: [
      { name: "UMAP (n_neighbors=30, min_dist=0.1)", role: "Compresses 14D → 2D for display, preserving local manifold structure" },
      { name: "random_state=42", role: "Deterministic embedding guaranteed across all runs" },
      { name: "metric='euclidean'", role: "Applied on Z-normalised feature matrix" },
    ],
    insight: "UMAP was chosen over t-SNE because it preserves both local cluster structure and global inter-cluster relationships, and is significantly faster on repeated sweeps.",
  },
  {
    group: "Density Clustering",
    color: "#10b981",
    icon: "◉",
    items: [
      { name: "HDBSCAN (min_cluster_size sweep)", role: "Hyperparameter sweep across [50, 100, 150, 200, 300] to maximise silhouette" },
      { name: "Silhouette score optimisation", role: "Best min_cluster_size selected by internal validation" },
      { name: "Noise class (id=−1)", role: `Managers with no dense neighbourhood: ${f.noisePct} of the real universe` },
      { name: "Cosine labeling", role: "Cluster centroids matched to archetype prototypes via cosine similarity" },
    ],
    insight: "HDBSCAN was preferred over KMeans because the number of archetypes is unknown a priori, and the dataset has variable-density regions. DBSCAN was ruled out because it requires a fixed epsilon.",
  },
  {
    group: "Macro Regime Detection",
    color: "#38bdf8",
    icon: "🌊",
    items: [
      { name: "GaussianHMM (n_components=4, full covariance)", role: "Hidden Markov Model over 5 macro features; did not converge on the real history" },
      { name: "Viterbi decoding", role: "Most likely state sequence across all observed quarters" },
      { name: "Label-switching fix", role: "Cosine similarity resolves the permutation ambiguity of HMM state IDs" },
      { name: "Stable semantic mapping", role: "Goldilocks / Recovery / Rate Shock / Recession Fear" },
    ],
    insight: "The HMM label-switching problem (where state IDs shift across training runs) is solved by comparing emission means to hand-crafted prototype vectors. This makes the labels deterministic and interpretable.",
  },
  {
    group: "Signal Synthesis",
    color: "#a855f7",
    icon: "◎",
    items: [
      { name: "RACS formula (4-factor product)", role: "consensus_weight × log(activist_buyers+1.1) × (1−crowding) × (1±regime_weight×prob)" },
      { name: "regime_weight=0.3", role: "racs_raw × (1 + regime_weight × regime_confidence)" },
      { name: "Top decile selection", role: `${f.totalSignals} signals across ${f.signalQuarters} quarters; top decile with resolvable prices is traded` },
      { name: "SignalDecayAnalyzer", role: "Measures IC half-life to determine optimal holding horizon" },
    ],
    insight: "The multiplicative structure means all four components must score well simultaneously. This prevents any single factor from gaming the ranking; exactly the failure mode of linear factor models.",
  },
  {
    group: "Validation Suite",
    color: "#ef4444",
    icon: "🔒",
    items: [
      { name: "DeflatedSharpeRatio", role: "Adjusts observed Sharpe for n_trials, skewness, kurtosis, serial correlation" },
      { name: "ProbabilityOfBacktestOverfitting", role: `CSCV with C(16,8)=12,870 combinations. Real run: ${f.pbo}` },
      { name: "MonteCarloTester (N=1,000×3)", role: "Bootstrap, random entry, regime permutation null tests" },
      { name: "WalkForwardValidator", role: "Expanding-window temporal robustness; the real run had too little trade history for any fold" },
    ],
    insight: "The Bailey et al. framework treats the backtest as a multiple hypothesis testing problem. This is the same standard used by institutional quant research desks to gate strategy publication.",
  },
];
}

function MlView({ components }: { components: ReturnType<typeof buildMlComponents> }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {components.map((c, i) => {
        const isOpen = selected === c.group;
        return (
          <div key={c.group} style={{
            borderRadius: 14,
            border: `1px solid ${isOpen ? c.color + "55" : "rgba(255,255,255,0.07)"}`,
            backgroundColor: isOpen ? `${c.color}09` : "rgba(255,255,255,0.02)",
            overflow: "hidden",
            transition: "all 0.25s cubic-bezier(0.16,1,0.3,1)",
          }}>
            {/* Header */}
            <div
              onClick={() => setSelected(isOpen ? null : c.group)}
              style={{
                display: "flex", alignItems: "center", gap: "1rem", padding: "1rem 1.25rem",
                cursor: "pointer",
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                backgroundColor: `${c.color}18`, border: `1px solid ${c.color}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1rem", flexShrink: 0,
                boxShadow: isOpen ? `0 0 14px ${c.color}40` : "none",
                transition: "box-shadow 0.2s",
              }}>
                {c.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.62rem", fontWeight: 700, color: c.color, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "0.15rem" }}>
                  Stage {i + 1}
                </div>
                <div style={{ fontSize: "0.9rem", fontWeight: 700 }}>{c.group}</div>
              </div>
              <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 220 }}>
                {c.items.slice(0, 2).map(item => (
                  <span key={item.name} style={{
                    padding: "0.1rem 0.45rem", borderRadius: 4, fontSize: "0.62rem",
                    fontFamily: "monospace", color: c.color, border: `1px solid ${c.color}30`,
                    backgroundColor: `${c.color}0f`,
                  }}>{item.name.split(" ")[0]}</span>
                ))}
              </div>
              <span style={{ color: "var(--text-muted)", fontSize: "0.9rem", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s", flexShrink: 0, marginLeft: "0.5rem" }}>›</span>
            </div>

            {/* Expanded content */}
            {isOpen && (
              <div style={{ padding: "0 1.25rem 1.25rem", animation: "expandDown 0.25s ease" }}>
                {/* Items */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
                  {c.items.map(item => (
                    <div key={item.name} style={{
                      display: "flex", gap: "0.75rem", alignItems: "flex-start",
                      padding: "0.6rem 0.9rem", borderRadius: 8,
                      backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)",
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: c.color, flexShrink: 0, marginTop: 5 }} />
                      <div>
                        <div style={{ fontSize: "0.75rem", fontWeight: 700, fontFamily: "monospace", color: c.color, marginBottom: "0.1rem" }}>{item.name}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{item.role}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Insight box */}
                <div style={{
                  padding: "0.75rem 1rem", borderRadius: 8,
                  backgroundColor: `${c.color}0d`, border: `1px solid ${c.color}28`,
                }}>
                  <div style={{ fontSize: "0.6rem", fontWeight: 700, color: c.color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.3rem" }}>
                    Design rationale
                  </div>
                  <p style={{ fontSize: "0.74rem", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>{c.insight}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   DEPLOYMENT VIEW
══════════════════════════════════════════════════════════════════════════════ */
function DeploymentView() {
  const [hoveredTier, setHoveredTier] = useState<string | null>(null);

  const tiers = [
    {
      name: "Local Compute", short: "Developer machine / CI runner", color: "#8a2be2",
      cost: "$0", costNote: "8-core laptop or CI runner",
      components: [
        { name: "Python 3.12 + virtualenv", desc: "Isolated dependency environment" },
        { name: "DuckDB", desc: "In-process OLAP over Hive-partitioned Parquet" },
        { name: "Polars + HDBSCAN + UMAP", desc: "Feature engineering + clustering" },
        { name: "hmmlearn", desc: "Gaussian HMM regime detection" },
        { name: "FastAPI (dev server)", desc: "Local API testing" },
        { name: "export_static_artifacts.py", desc: "Materialises 7 JSON outputs" },
      ],
      arrow: "Git push → GitHub Actions",
    },
    {
      name: "GitHub Actions", short: "CI/CD pipeline", color: "#38bdf8",
      cost: "$0", costNote: "GitHub-hosted runners",
      components: [
        { name: "Python 3.12: lint, type-check, security scan, tests", desc: "Ruff, MyPy, Bandit, pip-audit, pytest" },
        { name: "Push backend to Hugging Face Space", desc: "Research API container" },
        { name: "vercel build", desc: "Server components read the committed JSON artifacts" },
        { name: "vercel deploy --prebuilt", desc: "Publish the static output" },
      ],
      arrow: "Static build → Vercel CDN",
    },
    {
      name: "Vercel Edge CDN", short: "Global static delivery", color: "#10b981",
      cost: "$0", costNote: "Free tier · 100 GB/month BW",
      components: [
        { name: "Next.js static export", desc: "Pre-rendered HTML + JSON at build time" },
        { name: "Vercel CDN", desc: "Static files served from the edge" },
        { name: "Automatic HTTPS", desc: "TLS termination at edge" },
        { name: "Zero cold starts", desc: "No server-side compute per request" },
      ],
      arrow: null,
    },
    {
      name: "HF Spaces (FastAPI)", short: "Research API endpoint", color: "#f59e0b",
      cost: "$0", costNote: "CPU Basic · 2 vCPU / 16 GB",
      components: [
        { name: "Governance endpoint", desc: "Serves methodology + DSR metadata" },
        { name: "Pipeline status API", desc: "Reports last run metadata" },
        { name: "Prometheus /metrics", desc: "Health + latency counters" },
        { name: "TTL in-process cache", desc: "LRU cache to avoid repeated disk reads" },
      ],
      arrow: null,
    },
  ];

  const designPrinciples = [
    { label: "Intelligence Tier Pattern", color: "#8a2be2", desc: "Heavy compute stays local. Only synthesized insights (7 JSON files, ~60 KB gzipped) cross the network boundary. Mirrors the separation between quant research and production systems." },
    { label: "Zero-Cost Architecture", color: "#10b981", desc: "Vercel (100 GB BW) + HF Spaces (CPU Basic) + GitHub Actions (2000 min/month) = $0/month. All compute is front-loaded to the developer machine, eliminating any cloud compute cost." },
    { label: "Static-First, No Cold Starts", color: "#3b82f6", desc: "Frontend is fully static. Server components run at build time, not at request time. Vercel edge CDN delivers the result with sub-50ms TTFB globally, with no compute layer in the hot path." },
    { label: "Provenance Chain", color: "#f59e0b", desc: "Every artifact carries run_id, git_commit, SHA-256 hash, and generated_at. The metadata artifact cross-hashes all 6 siblings. Full audit trail from raw SEC filing to live dashboard pixel." },
    { label: "Deterministic Reproducibility", color: "#a855f7", desc: "SHA-256 seeds on UMAP/HDBSCAN, pinned library versions in requirements.txt, and deterministic DuckDB aggregations guarantee byte-identical artifact output on any machine or CI runner." },
    { label: "Schema Contracts", color: "#38bdf8", desc: "Every domain boundary validates its DataFrame via typed Pydantic contracts (EDGARRawContract, ManagerDNAContract, RACSContract). Silent data drift is caught at the boundary, not downstream." },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
      {/* Tier diagram */}
      <div>
        <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
          Three-tier architecture · CI/CD flow
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
          {tiers.map((t) => {
            const isHov = hoveredTier === t.name;
            return (
              <div
                key={t.name}
                onMouseEnter={() => setHoveredTier(t.name)}
                onMouseLeave={() => setHoveredTier(null)}
                style={{
                  borderRadius: 16,
                  border: `1px solid ${isHov ? t.color + "66" : t.color + "28"}`,
                  backgroundColor: isHov ? `${t.color}0e` : `${t.color}05`,
                  padding: "1.25rem",
                  transition: "all 0.25s cubic-bezier(0.16,1,0.3,1)",
                  transform: isHov ? "translateY(-3px)" : "none",
                  boxShadow: isHov ? `0 8px 32px ${t.color}20` : "none",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.85rem" }}>
                  <div>
                    <div style={{ fontSize: "0.62rem", fontWeight: 700, color: t.color, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "0.25rem" }}>{t.name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{t.short}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 900, color: t.color, lineHeight: 1 }}>{t.cost}</div>
                    <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>{t.costNote}</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  {t.components.map(c => (
                    <div key={c.name} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: t.color, flexShrink: 0, marginTop: 5 }} />
                      <div>
                        <span style={{ fontSize: "0.72rem", fontFamily: "monospace", fontWeight: 600, color: t.color }}>{c.name}</span>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginLeft: "0.4rem" }}>· {c.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {t.arrow && (
                  <div style={{
                    marginTop: "0.85rem", paddingTop: "0.75rem", borderTop: `1px solid ${t.color}20`,
                    fontSize: "0.68rem", color: t.color, fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem",
                  }}>
                    <span style={{ fontSize: "0.8rem" }}>→</span>
                    {t.arrow}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Design principles */}
      <div>
        <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
          Engineering design principles
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.85rem" }}>
          {designPrinciples.map(({ label, color, desc }) => (
            <div key={label} style={{
              padding: "0.9rem 1rem", borderRadius: 10,
              border: `1px solid ${color}22`, backgroundColor: `${color}07`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
                <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>{label}</span>
              </div>
              <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tech stack table */}
      <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
        <div style={{ padding: "0.75rem 1.25rem", borderBottom: "1px solid rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.025)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>Full technology stack · minimum versions</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 540 }}>
            <tbody>
              {[
                ["DuckDB", "≥1.1", "#8a2be2", "In-process OLAP over the full 13F filing history"],
                ["Polars", "≥1.0", "#8a2be2", "Columnar data processing"],
                ["scikit-learn (HDBSCAN)", "≥1.5", "#f59e0b", "Density-based archetype clustering"],
                ["UMAP-learn", "≥0.5.6", "#f59e0b", "14D → 2D manifold embedding"],
                ["hmmlearn", "≥0.3.2", "#10b981", "Gaussian HMM · 4-state regime detection"],
                ["FastAPI", "≥0.110", "#38bdf8", "Research API on HF Spaces"],
                ["Next.js", "14.2.3", "#3b82f6", "App Router, build-time data"],
                ["Recharts", "2.12", "#3b82f6", "Client-side visualisation"],
                ["GitHub Actions", "--", "#a855f7", "CI/CD · build → artifact → deploy"],
                ["Vercel Edge CDN", "--", "#10b981", "Global static delivery · free tier"],
              ].map(([lib, ver, color, role]) => (
                <tr key={lib} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "0.55rem 1.25rem", width: "22%" }}>
                    <span style={{ fontSize: "0.82rem", fontFamily: "monospace", fontWeight: 700, color }}>{lib}</span>
                  </td>
                  <td style={{ padding: "0.55rem 0.75rem", width: "10%" }}>
                    <span style={{ fontSize: "0.72rem", fontFamily: "monospace", color: "var(--text-muted)" }}>{ver}</span>
                  </td>
                  <td style={{ padding: "0.55rem 0.75rem", fontSize: "0.78rem", color: "var(--text-secondary)" }}>{role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════════ */
export default function ArchitectureView({ facts }: { facts: ArchitectureFacts }) {
  const OVERVIEW_NODES = buildOverviewNodes(facts);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const selectedNodeData = OVERVIEW_NODES.find(n => n.id === selectedNode) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 18,
        border: "1px solid rgba(138,43,226,0.25)",
        background: "linear-gradient(135deg, rgba(138,43,226,0.08) 0%, rgba(59,130,246,0.05) 50%, rgba(16,185,129,0.04) 100%)",
        padding: "2rem 2.5rem",
        position: "relative", overflow: "hidden",
      }}>
        {/* Background decoration */}
        <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(138,43,226,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -30, left: "30%", width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ position: "relative" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "0.4rem",
            padding: "0.2rem 0.7rem", borderRadius: 20, marginBottom: "0.85rem",
            backgroundColor: "rgba(138,43,226,0.1)", border: "1px solid rgba(138,43,226,0.3)",
          }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#8a2be2", boxShadow: "0 0 6px #8a2be280" }}>
              <style>{`
                @keyframes pulse { 0%,100%{box-shadow:0 0 4px #8a2be280;} 50%{box-shadow:0 0 10px #8a2be2cc;} }
              `}</style>
            </div>
            <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#c4b5fd", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Andria Systems · System Architecture
            </span>
          </div>

          <h1 style={{
            fontSize: "clamp(1.6rem, 2.5vw, 2.2rem)", fontWeight: 900,
            letterSpacing: "-0.04em", lineHeight: 1.1, margin: "0 0 0.7rem",
            background: "linear-gradient(135deg, #ffffff 0%, rgba(196,181,253,0.9) 40%, rgba(59,130,246,0.8) 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>
            Institutional Quant Intelligence<br />at Zero Infrastructure Cost
          </h1>

          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: "60ch", margin: "0 0 1.5rem" }}>
            A full-stack quantitative research platform processing {facts.filingsRowsShort} SEC 13F filing rows through a multi-stage ML pipeline:
            HDBSCAN clustering, Gaussian HMM regime detection, and RACS signal generation, checked by an evaluation gate built on the
            Bailey et al. (2016) framework. The gate {facts.gatePassed ? "passed" : "rejected"} the latest real run, and this page reports it as such.
          </p>

          {/* System stats */}
          <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
            {[
              { label: "Data Processed", value: facts.filingsRowsShort, sub: "SEC 13F filing rows", color: "#3b82f6" },
              { label: "ML Algorithms", value: "4", sub: "UMAP · HDBSCAN · HMM · DSR", color: "#8a2be2" },
              { label: "Evaluation Gate", value: facts.gatePassed ? "Passed" : "Rejected", sub: "4 checks, latest real run", color: facts.gatePassed ? "#10b981" : "#ef4444" },
              { label: "Infrastructure Cost", value: "$0", sub: "Per month, globally delivered", color: "#f59e0b" },
            ].map(({ label, value, sub, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ fontSize: "2rem", fontWeight: 900, color, letterSpacing: "-0.04em", lineHeight: 1 }}>{value}</div>
                <div>
                  <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-primary)" }}>{label}</div>
                  <div style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: "0.35rem",
        padding: "0.35rem",
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSelectedNode(null); }}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                padding: "0.6rem 1rem",
                borderRadius: 9,
                border: "none", cursor: "pointer",
                fontSize: "0.82rem", fontWeight: isActive ? 700 : 500,
                color: isActive ? "#fff" : "var(--text-secondary)",
                background: isActive
                  ? "linear-gradient(90deg, rgba(138,43,226,0.3) 0%, rgba(59,130,246,0.15) 100%)"
                  : "transparent",
                boxShadow: isActive ? "inset 0 1px 0 rgba(255,255,255,0.08), 0 0 20px rgba(138,43,226,0.1)" : "none",
                transition: "all 0.2s cubic-bezier(0.16,1,0.3,1)",
                borderLeft: isActive ? "1.5px solid rgba(138,43,226,0.5)" : "1.5px solid transparent",
              }}
            >
              <span style={{ fontSize: "0.9rem" }}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ────────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textAlign: "center" }}>
            Click any component to inspect its role, technology, and metrics
          </div>
          <div style={{
            borderRadius: 18, border: "1px solid rgba(255,255,255,0.08)",
            background: "linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)",
            backdropFilter: "blur(20px)",
            padding: "1.5rem",
          }}>
            <FlowDiagram
              nodes={OVERVIEW_NODES}
              edges={OVERVIEW_EDGES}
              selected={selectedNode}
              onSelect={(id) => setSelectedNode(prev => prev === id ? null : id)}
            />
          </div>
          {selectedNodeData && (
            <NodeDetail node={selectedNodeData} onClose={() => setSelectedNode(null)} />
          )}
          {!selectedNodeData && (
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.5rem",
            }}>
              {OVERVIEW_NODES.map(n => (
                <div
                  key={n.id}
                  onClick={() => setSelectedNode(prev => prev === n.id ? null : n.id)}
                  style={{
                    borderRadius: 9, border: `1px solid ${n.color}28`,
                    backgroundColor: `${n.color}08`, padding: "0.65rem 0.75rem",
                    cursor: "pointer", transition: "all 0.2s",
                    display: "flex", alignItems: "center", gap: "0.5rem",
                  }}
                >
                  <span style={{ fontSize: "0.9rem" }}>{n.icon}</span>
                  <div>
                    <div style={{ fontSize: "0.68rem", fontWeight: 700, color: n.color }}>{n.label}</div>
                    <div style={{ fontSize: "0.58rem", color: "var(--text-muted)" }}>{n.sublabel}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "pipeline" && (
        <div style={{
          borderRadius: 18, border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.02)", padding: "1.75rem",
        }}>
          <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1.25rem" }}>
            Click any stage for full technical detail · End-to-end data flow from raw SEC filings to live dashboard
          </div>
          <PipelineView stages={buildPipelineStages(facts)} />
        </div>
      )}

      {activeTab === "ml" && (
        <div style={{
          borderRadius: 18, border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.02)", padding: "1.75rem",
        }}>
          <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1.25rem" }}>
            Click any component to see implementation detail and design rationale
          </div>
          <MlView components={buildMlComponents(facts)} />
        </div>
      )}

      {activeTab === "deployment" && (
        <div style={{
          borderRadius: 18, border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.02)", padding: "1.75rem",
        }}>
          <DeploymentView />
        </div>
      )}
    </div>
  );
}
