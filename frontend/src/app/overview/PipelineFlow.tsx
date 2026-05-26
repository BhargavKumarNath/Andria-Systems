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

const PIPELINE: Stage[] = [
  {
    n: 1,
    color: "#3b82f6",
    title: "SEC EDGAR Filings",
    metric: "116M rows",
    desc: "Bulk-download all Form 13F XML filings via EDGAR Full-Text Search. 81 quarters, 2004–2024.",
    detail: {
      what: "The U.S. SEC requires every institution managing over $100M to publicly disclose all stock holdings each quarter via Form 13F. This creates a complete, auditable record of where the world's largest investors are putting their money.",
      how: "We download all 13F filings through the EDGAR Full-Text Search (EFTS) bulk API, parse the XML, deduplicate amended filings, and store 116 million normalised records in a DuckDB columnar database on local NVMe, completing the full ingest in under 20 minutes.",
      why: "This is the raw signal source. Every downstream model depends on the completeness and accuracy of this data. Without reliable coverage across all 8,934 institutional managers and 81 quarters, no conviction signal would be meaningful.",
      tags: ["EDGAR EFTS API", "Form 13F", "XML parsing", "DuckDB", "Parquet"],
    },
  },
  {
    n: 2,
    color: "#8b5cf6",
    title: "CUSIP Resolution",
    metric: "3.4M mappings",
    desc: "OpenFIGI batch API resolves CUSIP identifiers to live exchange tickers with an LRU cache.",
    detail: {
      what: "Every 13F filing identifies securities by CUSIP, a 9-character alphanumeric code, not a familiar ticker like AAPL or MSFT. CUSIPs can become invalid when companies merge, spin off, or get delisted, creating silent data quality failures.",
      how: "The OpenFIGI API maps each unique CUSIP to a live exchange ticker via batch requests. Results are cached in an LRU store so that only expired or novel CUSIPs require a fresh API call. The provenance score (98.5%) measures how many holdings resolved successfully.",
      why: "Signals built on unresolvable or delisted securities are worthless; they cannot be acted on in the market. High provenance is a precondition for the EvaluationGate to pass, ensuring every ranked signal points to something you can actually buy.",
      tags: ["OpenFIGI API", "CUSIP", "LRU cache", "3.4M mappings", "98.5% provenance"],
    },
  },
  {
    n: 3,
    color: "#8a2be2",
    title: "Behavioral Feature Engineering",
    metric: "14 dimensions",
    desc: "Polars computes 14 per-manager features (turnover, conviction delta, sector HHI, filing lag) in a single lazy scan.",
    detail: {
      what: "Raw 13F data tells us who owns what, but not how they trade. We compute 14 behavioral features per manager per quarter that compress an institution's entire investment personality into a numeric vector: their trading style, risk tolerance, and conviction patterns.",
      how: "Polars lazy evaluation chains all 14 computations in a single pass: portfolio HHI (concentration), quarter-over-quarter turnover, conviction delta (how much position sizes change), filing lag (how quickly they report after quarter-end), small-cap exposure, activist frequency, and 8 more. Runs in under 3 minutes on 116M rows.",
      why: "These 14 numbers are the input to HDBSCAN clustering. Without behavioural features, you cannot distinguish a conviction activist from an index hugger, even if they hold the same stocks. The feature space is what separates signal from noise in the downstream ranking.",
      tags: ["Polars", "14 features", "Portfolio HHI", "Conviction delta", "Filing lag"],
    },
  },
  {
    n: 4,
    color: "#f59e0b",
    title: "HDBSCAN + Gaussian HMM",
    metric: "4 archetypes · 4 regimes",
    desc: "UMAP reduces to 2D, HDBSCAN labels manager archetypes. Gaussian HMM classifies macro states from VIX, yield curve and credit spreads.",
    detail: {
      what: "Two separate unsupervised models run in parallel. HDBSCAN segments 8,934 managers into behavioral archetypes. A Gaussian Hidden Markov Model classifies each quarter into one of four macro regimes: Goldilocks, Recovery, Rate Shock, or Recession Fear.",
      how: "UMAP first reduces the 14-dimensional feature space to 2D, preserving local and global manifold structure. HDBSCAN then finds density-connected clusters without requiring a fixed k; managers who do not fit any cluster are labelled Noise. Separately, the HMM trains on five macro indicators (VIX, yield-curve slope, credit spreads, Fed funds delta, OFR stress index) using Baum-Welch EM, then classifies each quarter via Viterbi decoding.",
      why: "The regime state directly multiplies every RACS score. A signal scoring 0.25 in a Goldilocks regime becomes 0.29 (+15%). This is the same risk-on / risk-off logic that institutional quant desks apply when adjusting factor tilts across the business cycle.",
      tags: ["UMAP", "HDBSCAN", "Gaussian HMM", "hmmlearn", "Baum-Welch EM", "Viterbi"],
    },
  },
  {
    n: 5,
    color: "#10b981",
    title: "RACS Signal Generation",
    metric: "2,847 signals/quarter",
    desc: "RACS = consensus_weight × log(activist_buyers + 1.1) × (1 − crowding) × regime_multiplier. Top 500 ranked per quarter.",
    detail: {
      what: "RACS (Regime-Adjusted Conviction Score) is a composite formula that answers one question: which stocks have the strongest combination of broad institutional consensus, deep activist conviction, manageable crowding risk, and macro tailwind right now?",
      how: "The formula multiplies four components: (1) consensus_weight: fraction of institutions holding the stock, AUM-weighted; (2) log(activist_buyers + 1.1): log-scaled activist buyer count, damping outliers; (3) (1 - crowding): penalises overcrowded trades that face forced-selling risk; (4) regime_multiplier: amplifies by +15% in Goldilocks, dampens by -20% in Recession Fear. Top 500 signals per quarter are exported.",
      why: "No single factor predicts returns reliably. RACS only scores high when all four signals align simultaneously: breadth, depth, safety, and timing. This multi-factor gate reduces false positives that plague simpler momentum or consensus screens.",
      tags: ["RACS formula", "Regime multiplier", "Crowding penalty", "Activist conviction", "500 signals"],
    },
  },
  {
    n: 6,
    color: "#10b981",
    title: "EvaluationGate",
    metric: "PASSED",
    desc: "DSR > 1.0, PBO <= 40%, three Monte Carlo null tests. Bailey & Lopez de Prado (2016) criteria. Blocks deployment on failure.",
    detail: {
      what: "The EvaluationGate is a four-condition publication gate that must pass before any signal can be deployed. It is designed to catch the two most common failure modes in quantitative finance: overfitting to historical noise, and fooling yourself with a lucky backtest.",
      how: "Condition 1: Deflated Sharpe Ratio (DSR) must exceed 1.0; this adjusts the observed Sharpe for the number of strategy configurations tested, non-normal returns, and serial autocorrelation. Condition 2: Probability of Backtest Overfitting (PBO) must stay below 40%; computed via CSCV across 12,870 train/test combinations. Conditions 3-4: Three Monte Carlo null tests at N=1,000 each (bootstrap resampling, randomised entry timing, regime permutation) must all produce p < 0.05.",
      why: "A strategy that only looks good because of data mining or lucky timing will fail at least one of these four gates. This is the same validation framework described in Bailey & Lopez de Prado (2016) Journal of Portfolio Management; the same standard institutional quant teams use before deploying capital.",
      tags: ["DSR", "PBO", "CSCV", "Monte Carlo", "Bailey et al. 2016", "12,870 splits"],
    },
  },
];

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

export default function PipelineFlow() {
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
