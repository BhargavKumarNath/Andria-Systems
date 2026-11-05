"use client";

import React, { useState } from "react";

interface Stage {
  n: number;
  color: string;
  title: string;
  metric: string;
  desc: string;
  detail: {
    what: string;
    how: string;
    why: string;
    tags?: string[];
  };
}

/** Serializable subset of DashboardFacts passed down from the server page. */
export interface PipelineFacts {
  filingsRowsShort: string;
  firstQuarter: string;
  lastQuarter: string;
  totalQuarters: string;
  totalManagers: string;
  clusteredManagers: string;
  namedArchetypes: string[];
  noisePct: string;
  totalSignals: string;
  signalQuarters: number;
  provenancePct: string;
  provenanceDetail: string;
  gatePassed: boolean;
  failedGateChecks: string[];
}

function buildPipeline(f: PipelineFacts): Stage[] {
  return [
    {
      n: 1,
      color: "#3b82f6",
      title: "SEC EDGAR Filings",
      metric: `${f.filingsRowsShort} rows`,
      desc: `All 53 SEC Form 13F structured-data bulk files, ingested into Hive-partitioned Parquet. ${f.totalQuarters} quarters, ${f.firstQuarter} to ${f.lastQuarter}.`,
      detail: {
        what: "The U.S. SEC requires every institution managing over $100M to publicly disclose its equity holdings each quarter via Form 13F. This creates an auditable record of where the largest investors are putting their money.",
        how: `Each bulk file (INFOTABLE and COVERPAGE TSVs) is ingested one batch at a time in an isolated subprocess under a 2 GB DuckDB memory cap, after an unbounded first attempt crashed the machine. The result is ${f.filingsRowsShort} filing rows from ${f.totalManagers} managers. SEC's structured data starts in 2013 Q2; quarters before that come only from late amendments inside newer files, so pre-2013 coverage is partial.`,
        why: "Every downstream model depends on the completeness and accuracy of this data. Partial early coverage is stated rather than presented as a complete 2004 archive.",
        tags: ["SEC 13F bulk TSV", "Hive-partitioned Parquet", "DuckDB", "Subprocess isolation"],
      },
    },
    {
      n: 2,
      color: "#8b5cf6",
      title: "CUSIP Resolution",
      metric: `${f.provenancePct} resolved`,
      desc: "OpenFIGI batch API maps the CUSIPs in the signal universe to exchange tickers, cached to Parquet.",
      detail: {
        what: "13F filings identify securities by CUSIP, a 9-character code, not a ticker. CUSIPs can go stale after mergers, spin-offs, or delistings, creating silent data-quality failures.",
        how: `Keyless OpenFIGI accepts at most 10 identifiers per request (larger batches return HTTP 413), so the mapper batches at 10 with a delay between requests and caches results to Parquet. In the real run: ${f.provenanceDetail} An unmapped CUSIP is left unmapped rather than guessed.`,
        why: "Signals on securities that cannot be resolved cannot be traded. Provenance below the gate's 90% threshold is one of the reasons this run was rejected.",
        tags: ["OpenFIGI API", "CUSIP", "Batch size 10", `${f.provenancePct} provenance`],
      },
    },
    {
      n: 3,
      color: "#8a2be2",
      title: "Behavioral Feature Engineering",
      metric: "14 dimensions",
      desc: "A staged DuckDB pipeline computes 14 behavioural features per manager (concentration, turnover, holding duration and more).",
      detail: {
        what: "Raw 13F data tells us who owns what, but not how they trade. Fourteen behavioural features per manager compress an institution's investment style into a numeric vector.",
        how: `A six-stage DuckDB pipeline (eligible-manager filter, quarterly portfolios, quarterly aggregates, HHI and top-N concentration, holding-duration statistics, final join) uses staged temp tables. Only managers with at least four filed quarters qualify: ${f.clusteredManagers} of ${f.totalManagers}.`,
        why: "These 14 numbers are the input to HDBSCAN clustering. Without behavioural features you cannot tell a conviction activist from an index hugger, even if they hold the same stocks.",
        tags: ["DuckDB", "14 features", "Portfolio HHI", "Holding duration", "≥4 quarters"],
      },
    },
    {
      n: 4,
      color: "#f59e0b",
      title: "HDBSCAN + Gaussian HMM",
      metric: `${f.namedArchetypes.length} archetypes · 4 regimes`,
      desc: `UMAP reduces to 2D for display, HDBSCAN labels manager archetypes (${f.noisePct} left as noise). A Gaussian HMM labels macro regimes.`,
      detail: {
        what: `Two separate unsupervised models. HDBSCAN segments ${f.clusteredManagers} managers into ${f.namedArchetypes.join(" and ")}, with ${f.noisePct} labelled noise. A four-state Gaussian HMM labels each quarter as Goldilocks, Recovery, Rate Shock, or Recession Fear.`,
        how: "HDBSCAN finds density-connected clusters without a fixed k; managers who fit no cluster are labelled Noise rather than forced into one. The HMM is fit on five macro indicators (VIX, 10Y-2Y spread, high-yield credit spread, Fed funds delta, and FRED NFCIRISK standing in for unavailable OFR stress data). On the real macro history the full-covariance HMM did not converge, a logged finding reported as-is.",
        why: "The regime probability scales each RACS score. A high noise share and a non-converged HMM are reasons for caution about this run, and are shown rather than hidden.",
        tags: ["UMAP", "HDBSCAN", "Gaussian HMM", "hmmlearn", "Did not converge"],
      },
    },
    {
      n: 5,
      color: "#10b981",
      title: "RACS Signal Generation",
      metric: `${f.totalSignals} signals`,
      desc: `RACS combines consensus weight, activist conviction, a crowding discount, and regime probability. ${f.totalSignals} signals across ${f.signalQuarters} quarters.`,
      detail: {
        what: "RACS (Regime-Adjusted Conviction Score) ranks stocks by the combination of broad institutional consensus, activist conviction, crowding risk, and macro regime.",
        how: "racs_raw = consensus_weight × ln(activist_buyers + 1.1), requiring at least two distinct Conviction Activist buyers, then discounted for crowding and blended with the regime as racs_raw × (1 + 0.3 × regime_confidence). Computed in DuckDB SQL with temp-table staging.",
        why: `Requiring several independent conditions to align keeps the signal universe small: ${f.totalSignals} signals over ${f.signalQuarters} quarters on real data, too few for strong statistical claims.`,
        tags: ["RACS formula", "regime_weight 0.3", "Crowding discount", "≥2 activist buyers"],
      },
    },
    {
      n: 6,
      color: f.gatePassed ? "#10b981" : "#ef4444",
      title: "EvaluationGate",
      metric: f.gatePassed ? "PASSED" : "REJECTED",
      desc: f.gatePassed
        ? "Every publication check passed."
        : `Rejected this run. Failed: ${f.failedGateChecks.join(", ")}.`,
      detail: {
        what: "The EvaluationGate must pass before any signal is published. It targets the two most common failure modes in quantitative research: overfitting to historical noise, and trusting a lucky backtest.",
        how: "Four checks must all pass: a look-ahead leakage audit, provenance of at least 90% of CUSIPs resolved, reproducibility, and a Probability of Backtest Overfitting (CSCV) of at most 40%. Deflated Sharpe and three Monte Carlo null tests (bootstrap, randomised entry timing, regime permutation) are reported alongside.",
        why: f.gatePassed
          ? "A strategy that only looks good because of data mining or lucky timing should fail at least one of these checks."
          : "With nine priced trades, PBO and Deflated Sharpe could not be estimated, and provenance was below threshold. Rejecting the run is the gate working as designed, so the dashboard reports it rather than the earlier demo results.",
        tags: ["Leakage audit", "Provenance ≥ 90%", "PBO ≤ 40%", "Deflated Sharpe", "Monte Carlo"],
      },
    },
  ];
}

function Arrow() {
  return (
    <div style={{ display: "flex", alignItems: "center", color: "rgba(255,255,255,0.2)", fontSize: "1rem", flexShrink: 0, paddingTop: "1rem" }}>
      →
    </div>
  );
}

function ExpandedPanel({ stage, onClose }: { stage: Stage; onClose: () => void }) {
  return (
    <div style={{
      marginTop: "1rem",
      borderRadius: 14,
      border: `1px solid ${stage.color}30`,
      backgroundColor: `${stage.color}07`,
      overflow: "hidden",
      animation: "expandIn 0.25s cubic-bezier(0.16,1,0.3,1) both",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0.9rem 1.25rem",
        borderBottom: `1px solid ${stage.color}20`,
        backgroundColor: `${stage.color}0a`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
          <div style={{
            width: 24, height: 24, borderRadius: "50%",
            backgroundColor: `${stage.color}25`, border: `1.5px solid ${stage.color}55`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "0.65rem", fontWeight: 800, color: stage.color, flexShrink: 0,
          }}>
            {stage.n}
          </div>
          <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text-primary)" }}>{stage.title}</span>
          <span style={{
            padding: "0.1rem 0.45rem", borderRadius: 4, fontSize: "0.65rem",
            fontWeight: 700, fontFamily: "monospace",
            backgroundColor: `${stage.color}20`, color: stage.color,
          }}>{stage.metric}</span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-muted)", fontSize: "1rem", lineHeight: 1,
            padding: "0.25rem 0.4rem", borderRadius: 6,
            transition: "color 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0", padding: "0" }}>
        {[
          { label: "What is this?", text: stage.detail.what, icon: "◈" },
          { label: "How we do it", text: stage.detail.how, icon: "◉" },
          { label: "Why it matters", text: stage.detail.why, icon: "◎" },
        ].map(({ label, text, icon }, i) => (
          <div key={label} style={{
            padding: "1.1rem 1.25rem",
            borderRight: i < 2 ? `1px solid ${stage.color}15` : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.6rem" }}>
              <span style={{ fontSize: "0.7rem", color: stage.color }}>{icon}</span>
              <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: stage.color }}>
                {label}
              </span>
            </div>
            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>
              {text}
            </p>
          </div>
        ))}
      </div>

      {/* Tags */}
      {stage.detail.tags && (
        <div style={{
          display: "flex", gap: "0.4rem", flexWrap: "wrap",
          padding: "0.75rem 1.25rem",
          borderTop: `1px solid ${stage.color}15`,
        }}>
          {stage.detail.tags.map((tag) => (
            <span key={tag} style={{
              padding: "0.15rem 0.5rem", borderRadius: 4, fontSize: "0.68rem",
              fontFamily: "monospace", fontWeight: 600,
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text-secondary)",
            }}>{tag}</span>
          ))}
        </div>
      )}

      <style>{`
        @keyframes expandIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function PipelineNode({ stage, active, onClick }: { stage: Stage; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: "1rem", borderRadius: 12, textAlign: "left",
        cursor: "pointer", minWidth: 0,
        backgroundColor: active ? `${stage.color}14` : `${stage.color}08`,
        border: `1px solid ${active ? stage.color + "50" : stage.color + "22"}`,
        boxShadow: active ? `0 0 0 1px ${stage.color}25, 0 4px 20px ${stage.color}15` : "none",
        transition: "all 0.2s cubic-bezier(0.16,1,0.3,1)",
        transform: active ? "translateY(-2px)" : "none",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = `${stage.color}12`;
          e.currentTarget.style.borderColor = `${stage.color}38`;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = `${stage.color}08`;
          e.currentTarget.style.borderColor = `${stage.color}22`;
        }
      }}
    >
      {/* Number badge */}
      <div style={{
        width: 22, height: 22, borderRadius: "50%",
        backgroundColor: `${stage.color}25`, border: `1.5px solid ${stage.color}55`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.65rem", fontWeight: 800, color: stage.color, marginBottom: "0.6rem",
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
      {/* Desc */}
      <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
        {stage.desc}
      </p>
      {/* Click hint */}
      <div style={{
        marginTop: "0.65rem", fontSize: "0.62rem", color: active ? stage.color : "rgba(255,255,255,0.2)",
        fontWeight: 600, letterSpacing: "0.06em",
        transition: "color 0.2s ease",
      }}>
        {active ? "▲ COLLAPSE" : "▼ LEARN MORE"}
      </div>
    </button>
  );
}

export default function PipelineFlow({ facts }: { facts: PipelineFacts }) {
  const PIPELINE = buildPipeline(facts);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const toggle = (i: number) => setActiveIdx((prev) => (prev === i ? null : i));

  const row1 = PIPELINE.slice(0, 3);
  const row2 = PIPELINE.slice(3);

  return (
    <div>
      {/* Row 1 */}
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
        {row1.map((s, i) => (
          <React.Fragment key={s.n}>
            <PipelineNode stage={s} active={activeIdx === i} onClick={() => toggle(i)} />
            {i < 2 && <Arrow />}
          </React.Fragment>
        ))}
      </div>

      {/* Expanded panel for row 1 */}
      {activeIdx !== null && activeIdx < 3 && (
        <ExpandedPanel stage={PIPELINE[activeIdx]} onClose={() => setActiveIdx(null)} />
      )}

      {/* Connector between rows */}
      <div style={{ display: "flex", justifyContent: "flex-end", margin: "0.5rem 3.5rem" }}>
        <svg width="22" height="26" viewBox="0 0 22 26" fill="none" style={{ opacity: 0.2 }}>
          <path d="M11 0 L11 14 L20 14" stroke="white" strokeWidth="1.5" fill="none" />
          <path d="M18 10 L22 14 L18 18" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Row 2 (reversed to snake) */}
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", flexDirection: "row-reverse" }}>
        {row2.map((s, i) => (
          <React.Fragment key={s.n}>
            <PipelineNode stage={s} active={activeIdx === i + 3} onClick={() => toggle(i + 3)} />
            {i < 2 && <Arrow />}
          </React.Fragment>
        ))}
      </div>

      {/* Expanded panel for row 2 */}
      {activeIdx !== null && activeIdx >= 3 && (
        <ExpandedPanel stage={PIPELINE[activeIdx]} onClose={() => setActiveIdx(null)} />
      )}

      {/* Legend */}
      <div style={{
        marginTop: "1.25rem", paddingTop: "1rem",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap",
      }}>
        <span style={{ fontSize: "0.67rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" }}>
          Click any stage to expand
        </span>
        <span style={{ marginLeft: "auto", fontSize: "0.67rem", color: "var(--text-muted)" }}>
          Pipeline v4.16 · DuckDB 0.10 · Polars 0.20
        </span>
      </div>
    </div>
  );
}
