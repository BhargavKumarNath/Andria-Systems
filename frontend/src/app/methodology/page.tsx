import React from "react";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";
import {
  InteractiveFormula,
  UmapScatterSim,
  HmmVisuals,
  ValidationCards,
  CitationsCarousel
} from "./MethodologyVisuals";

function FeatureChip({ label }: { label: string }) {
  return (
    <span style={{
      padding: "0.2rem 0.55rem",
      borderRadius: 4,
      fontSize: "0.72rem",
      fontFamily: "monospace",
      backgroundColor: "rgba(59,130,246,0.1)",
      color: "#93c5fd",
      border: "1px solid rgba(59,130,246,0.2)",
    }}>
      {label}
    </span>
  );
}

export default function MethodologyPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3.5rem" }}>

      {/* ── 0. Hero Overview ─────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.05}>
        <div style={{
          borderRadius: 18,
          border: "1px solid rgba(138,43,226,0.25)",
          background: "linear-gradient(135deg, rgba(138,43,226,0.08) 0%, rgba(59,130,246,0.05) 50%, rgba(16,185,129,0.04) 100%)",
          padding: "2.5rem 3rem",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "0.4rem",
            padding: "0.2rem 0.7rem", borderRadius: 20, marginBottom: "1rem",
            backgroundColor: "rgba(138,43,226,0.1)", border: "1px solid rgba(138,43,226,0.3)",
          }}>
            <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#c4b5fd", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Andria Systems · Research Methodology
            </span>
          </div>

          <h1 style={{
            fontSize: "clamp(1.8rem, 3vw, 2.8rem)", fontWeight: 900,
            letterSpacing: "-0.04em", lineHeight: 1.1, margin: "0 0 1rem",
            background: "linear-gradient(135deg, #ffffff 0%, rgba(196,181,253,0.9) 40%, rgba(59,130,246,0.8) 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>
            Data Science Applied to<br />Institutional Capital Flows
          </h1>

          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: "60ch", margin: "0 0 2rem" }}>
            Every modelling decision maps to a peer-reviewed academic standard.
            We replace traditional discretionary analysis with unsupervised machine learning to extract
            behavioural alpha from 20 years of SEC filings.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
            {[
              { label: "Raw Filings", value: "116M", color: "#3b82f6" },
              { label: "Quarters", value: "81", color: "#8a2be2" },
              { label: "Unique Managers", value: "8,934", color: "#f59e0b" },
              { label: "CUSIP Mappings", value: "3.4M", color: "#10b981" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ padding: "1rem", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: "2.2rem", fontWeight: 800, color, lineHeight: 1, marginBottom: "0.4rem", letterSpacing: "-0.03em" }}>{value}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </RevealContainer>

      {/* ── 1. RACS Signal Engine ────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="1. Signal Engine: RACS Formula"
          description="A composite score synthesising institutional consensus, activist conviction, crowding risk, and macro sensitivity."
        />
        <GlassCard hierarchy="primary">
          <InteractiveFormula />
        </GlassCard>
      </RevealContainer>

      {/* ── 2. Manager DNA (Unsupervised Learning) ───────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="2. Unsupervised Learning: Manager DNA"
          description="Segmentation of 8,934 institutional managers into behavioural archetypes using dimensionality reduction and density clustering."
        />
        <GlassCard hierarchy="primary">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "2rem", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
                The 14-Feature Space
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "1rem" }}>
                Each manager is mapped to a 14-dimensional behavioural vector per quarter. No fundamental or price data is used; only trading behaviour.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.5rem" }}>
                {[
                  "portfolio_hhi", "mean_holding_duration", "turnover_rate",
                  "activist_frequency", "aum_log", "n_holdings",
                  "momentum_tilt", "value_tilt", "sector_concentration",
                  "filing_lag_days", "small_cap_pct", "new_position_rate",
                  "avg_conviction", "regime_sensitivity",
                ].map((f) => <FeatureChip key={f} label={f} />)}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ borderLeft: "2px solid #3b82f6", paddingLeft: "1rem" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>UMAP Projection</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>Preserves local and global manifold structure better than t-SNE.</div>
                </div>
                <div style={{ borderLeft: "2px solid #8a2be2", paddingLeft: "1rem" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>HDBSCAN Clustering</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>Identifies variable-density clusters without requiring a fixed <i>k</i>. Unclustered points are explicitly labelled as Noise.</div>
                </div>
              </div>
            </div>

            {/* Visualisation Component */}
            <div style={{ padding: "1.5rem", borderRadius: 12, backgroundColor: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <UmapScatterSim />
            </div>
          </div>
        </GlassCard>
      </RevealContainer>

      {/* ── 3. Macro Regimes (HMM) ───────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="3. Macro Intelligence: Gaussian HMM"
          description="A 4-state Hidden Markov Model trained on macroeconomic indicators (VIX, yield curve, credit spreads, Fed funds, OFR stress)."
        />
        <GlassCard hierarchy="primary">
          <HmmVisuals />
        </GlassCard>
      </RevealContainer>

      {/* ── 4. Robustness (Evaluation Gate) ──────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="4. Statistical Robustness"
          description="Based on Bailey et al. (2016). A signal must pass all gates simultaneously to be deployed."
        />
        <ValidationCards />
      </RevealContainer>

      {/* ── 5. Backtest Details ──────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          <GlassCard hierarchy="secondary">
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--text-primary)", marginBottom: "1rem" }}>Walk-Forward Validation</div>
            <div style={{ padding: "1rem", borderRadius: 8, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "#c4b5fd", whiteSpace: "pre-wrap" }}>
                {`Fold k:
train = [2004_Q1, ... , T_k] 
test  = [T_k + 1Q, ... , T_k + 4Q]`}
              </div>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Expanding-window out-of-sample evaluation across 10 folds (2010–2024).
              No look-ahead bias: the regime model is retrained entirely from scratch in every fold.
              Transaction costs (5-12 bps) and a realistic 45-day filing lag are strictly enforced.
            </p>
          </GlassCard>

          <GlassCard hierarchy="secondary">
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--text-primary)", marginBottom: "1rem" }}>Factor Attribution</div>
            <div style={{ padding: "1rem", borderRadius: 8, backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "#c4b5fd", whiteSpace: "pre-wrap" }}>
                {`R_p - R_f = α + β_MKT(MKT) + β_SMB(SMB) 
          + β_HML(HML) + β_RMW(RMW) 
          + β_CMA(CMA) + β_MOM(MOM)`}
              </div>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              OLS regression of RACS portfolio returns against the Fama-French 5-Factor + Momentum model.
              A statistically significant alpha (t-stat &gt; 2.0) confirms the strategy captures idiosyncratic edge rather than disguised beta.
            </p>
          </GlassCard>
        </div>
      </RevealContainer>

      {/* ── 6. Academic References ───────────────────────────────────────────── */}
      <RevealContainer threshold={0.15}>
        <SectionHeader
          title="Academic Foundation"
          description="Peer-reviewed papers underpinning the pipeline."
        />
        <CitationsCarousel />
      </RevealContainer>

    </div>
  );
}
