import React from "react";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";

function FormulaBlock({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "monospace",
      fontSize: "0.9rem",
      padding: "1rem 1.25rem",
      borderRadius: 8,
      backgroundColor: "rgba(138,43,226,0.06)",
      border: "1px solid rgba(138,43,226,0.2)",
      color: "#c4b5fd",
      lineHeight: 1.8,
      overflowX: "auto",
      whiteSpace: "pre-wrap",
    }}>
      {children}
    </div>
  );
}

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

function Cite({ authors, year, title, venue }: { authors: string; year: string; title: string; venue: string }) {
  return (
    <div style={{ marginBottom: "0.75rem", paddingLeft: "1rem", borderLeft: "2px solid rgba(138,43,226,0.3)" }}>
      <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.15rem" }}>{title}</div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
        {authors} ({year}) · <em>{venue}</em>
      </div>
    </div>
  );
}

export default function MethodologyPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>

      {/* Overview */}
      <RevealContainer threshold={0.1}>
        <GlassCard hierarchy="primary">
          <SectionHeader
            title="Research Methodology"
            description="Andria Systems applies peer-reviewed quantitative finance techniques to SEC 13F institutional holdings data. Every modelling decision maps to an academic citation or an institutional standard."
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginTop: "0.5rem" }}>
            {[
              { label: "Raw Filings", value: "116M" },
              { label: "Quarters", value: "81" },
              { label: "Unique Managers", value: "8,934" },
              { label: "CUSIP Mappings", value: "3.4M" },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: "center", padding: "0.75rem", borderRadius: 8, backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#8a2be2" }}>{value}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
              </div>
            ))}
          </div>
        </GlassCard>
      </RevealContainer>

      {/* RACS */}
      <RevealContainer threshold={0.1}>
        <GlassCard hierarchy="primary">
          <SectionHeader
            title="RACS: Regime-Adjusted Conviction Score"
            description="A composite signal that combines institutional consensus, activist conviction, crowding risk, and macro regime sensitivity into a single ranked score."
          />

          <div style={{ marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.6rem" }}>Core Formula</div>
            <FormulaBlock>
{`RACS = consensus_weight
     × log(activist_buyers + 1.1)
     × (1 − crowding_penalty)
     × (1 ± regime_weight × regime_prob)

regime_adjusted_racs = RACS × regime_multiplier(current_state)`}
            </FormulaBlock>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            {[
              {
                term: "consensus_weight",
                def: "Fraction of reporting managers holding the security in the quarter, weighted by AUM. Captures breadth of institutional conviction.",
              },
              {
                term: "log(activist_buyers + 1.1)",
                def: "Log-scaled count of activist-identified buyers (13D/13G filers). Logarithm dampens outlier activist clusters; +1.1 prevents log(0).",
              },
              {
                term: "crowding_penalty",
                def: "1 − (holdings_concentration / max_concentration). High crowding reduces RACS; crowded trades face forced liquidation risk during redemptions.",
              },
              {
                term: "regime_weight × regime_prob",
                def: "HMM state probability modulates RACS. Goldilocks/Recovery amplify (+); Rate_Shock/Recession_Fear dampen (−) the score.",
              },
            ].map(({ term, def }) => (
              <div key={term} style={{ padding: "0.875rem", borderRadius: 8, backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#c4b5fd", fontWeight: 600, marginBottom: "0.4rem" }}>{term}</div>
                <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.55, margin: 0 }}>{def}</p>
              </div>
            ))}
          </div>

          <div style={{ padding: "0.875rem 1rem", borderRadius: 8, backgroundColor: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.15)" }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.06em" }}>Regime Multipliers · </span>
            <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
              Goldilocks: +15% &nbsp;·&nbsp; Recovery: +8% &nbsp;·&nbsp; Rate Shock: −12% &nbsp;·&nbsp; Recession Fear: −20%
            </span>
          </div>
        </GlassCard>
      </RevealContainer>

      {/* HDBSCAN + UMAP */}
      <RevealContainer threshold={0.1}>
        <GlassCard hierarchy="primary">
          <SectionHeader
            title="Manager DNA: HDBSCAN + UMAP Clustering"
            description="Unsupervised segmentation of 8,934 institutional managers into behavioural archetypes using a 14-dimensional feature space."
          />

          <div style={{ marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.6rem" }}>14-Feature Space</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {[
                "portfolio_hhi", "mean_holding_duration", "turnover_rate",
                "activist_frequency", "aum_log", "n_holdings",
                "momentum_tilt", "value_tilt", "sector_concentration",
                "filing_lag_days", "small_cap_pct", "new_position_rate",
                "avg_conviction", "regime_sensitivity",
              ].map((f) => <FeatureChip key={f} label={f} />)}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div style={{ padding: "0.875rem", borderRadius: 8, backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.6rem" }}>UMAP Projection</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {[
                  ["n_neighbors", "15"],
                  ["min_dist", "0.1"],
                  ["n_components", "2"],
                  ["metric", "cosine"],
                  ["random_state", "42"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.76rem", fontFamily: "monospace", color: "var(--text-secondary)" }}>{k}</span>
                    <span style={{ fontSize: "0.76rem", fontFamily: "monospace", color: "#c4b5fd" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: "0.875rem", borderRadius: 8, backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.6rem" }}>HDBSCAN Parameters</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {[
                  ["min_cluster_size", "50"],
                  ["min_samples", "10"],
                  ["metric", "euclidean"],
                  ["cluster_selection", "eom"],
                  ["prediction_data", "True"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.76rem", fontFamily: "monospace", color: "var(--text-secondary)" }}>{k}</span>
                    <span style={{ fontSize: "0.76rem", fontFamily: "monospace", color: "#c4b5fd" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
            UMAP (McInnes et al., 2018) preserves local and global manifold structure better than t-SNE for downstream clustering.
            HDBSCAN (Campello et al., 2013) identifies variable-density clusters without requiring a fixed k, and explicitly models noise. Managers that do not fit any archetype are labelled Noise rather than force-assigned.
            Archetype labels (Conviction Activists, Index Huggers, Macro Tourists, Nimble Traders) are assigned by cosine similarity between cluster centroid feature vectors and hand-crafted prototype vectors.
          </p>
        </GlassCard>
      </RevealContainer>

      {/* HMM */}
      <RevealContainer threshold={0.1}>
        <GlassCard hierarchy="primary">
          <SectionHeader
            title="Macro Regime Detection: Gaussian HMM"
            description="A 4-state Gaussian Hidden Markov Model trained on macroeconomic indicators to classify each quarter into a named economic regime."
          />

          <div style={{ marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.6rem" }}>Observation Vector (per quarter)</div>
            <FormulaBlock>
{`o_t = [VIX_level, yield_curve_slope, credit_spreads,
        fed_funds_delta, ofr_stress_index]

P(s_t | o_1..t) via Viterbi decoding
State label = argmax cosine_similarity(mu_k, prototype_k)`}
            </FormulaBlock>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.85rem", marginBottom: "1rem" }}>
            {[
              { label: "Goldilocks", color: "#10b981", desc: "Low VIX, steep yield curve, tight spreads. Risk-on. RACS amplified +15%." },
              { label: "Recovery", color: "#3b82f6", desc: "VIX normalising, curve re-steepening post-inversion. Selective risk-on. RACS amplified +8%." },
              { label: "Rate Shock", color: "#f59e0b", desc: "Fed hiking aggressively, curve flattening/inverting. Duration risk elevated. RACS dampened −12%." },
              { label: "Recession Fear", color: "#ef4444", desc: "Elevated VIX, credit spreads blowing out, OFR stress > 1.5σ. Defensive. RACS dampened −20%." },
            ].map((r) => (
              <div key={r.label} style={{ padding: "0.875rem", borderRadius: 8, backgroundColor: `${r.color}08`, border: `1px solid ${r.color}30` }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 700, color: r.color, marginBottom: "0.35rem" }}>{r.label}</div>
                <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.55, margin: 0 }}>{r.desc}</p>
              </div>
            ))}
          </div>

          <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
            Model trained with hmmlearn using full Baum-Welch EM on 24 quarters (2019–2024) of macro data.
            State transition matrix is estimated jointly with emission Gaussians. Viterbi decoding returns the most probable state sequence; forward algorithm gives per-quarter state probabilities reported in the dashboard.
          </p>
        </GlassCard>
      </RevealContainer>

      {/* Research Validation */}
      <RevealContainer threshold={0.1}>
        <GlassCard hierarchy="primary">
          <SectionHeader
            title="Research Validation: EvaluationGate"
            description="Four institutional publication criteria must all pass before a signal can be deployed. Based on Bailey et al. (2016)."
          />

          {/* DSR */}
          <div style={{ marginBottom: "1.75rem" }}>
            <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#10b981", marginBottom: "0.75rem" }}>1. Deflated Sharpe Ratio (DSR)</div>
            <FormulaBlock>
{`DSR = SR_observed / sqrt(1 + (skew/6)SR - (kurtosis-3)/24 × SR²)
      × sqrt(T) / sqrt(1 + (1-rho)/(2T))

Threshold: DSR > 1.0 (two-tailed, alpha=0.05)
Adjustment: n_trials = number of strategy configurations tested`}
            </FormulaBlock>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.65, marginTop: "0.75rem" }}>
              The DSR penalises the observed Sharpe Ratio for the number of independent trials tested (multiple testing bias), non-normal return distribution (skewness and excess kurtosis), and serial autocorrelation. A DSR &gt; 1.0 at the 5% significance level is required for publication.
            </p>
          </div>

          {/* PBO */}
          <div style={{ marginBottom: "1.75rem" }}>
            <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#10b981", marginBottom: "0.75rem" }}>2. Probability of Backtest Overfitting (PBO)</div>
            <FormulaBlock>
{`CSCV: T periods → n_partitions = 16 sub-periods
Combinations: C(16, 8) = 12,870 train/test splits

For each split: select IS-optimal config, evaluate OOS
PBO = P(rank(OOS_optimal) < 0.5 | IS selection)

Threshold: PBO ≤ 0.40`}
            </FormulaBlock>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.65, marginTop: "0.75rem" }}>
              CSCV (Combinatorially Symmetric Cross-Validation) exhaustively tests all possible train/test splits of n_partitions=16 sub-periods. For each split, the in-sample optimal configuration is selected and its out-of-sample rank recorded. PBO is the fraction of splits where the IS-optimal strategy underperforms the median OOS strategy, a direct measure of selection bias. PBO &gt; 0.40 blocks deployment.
            </p>
          </div>

          {/* Monte Carlo */}
          <div>
            <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#10b981", marginBottom: "0.75rem" }}>3. Monte Carlo Null Hypothesis Tests (N=1,000 each)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[
                {
                  name: "Bootstrap Resampling",
                  detail: "Resample returns with replacement 1,000 times. If observed Sharpe falls in the top 5% of the null distribution (p < 0.05), the signal is not attributable to lucky draws.",
                },
                {
                  name: "Randomised Entry Timing",
                  detail: "Hold the portfolio constant but randomise entry dates uniformly across the sample. Tests whether timing specifically (rather than stock selection) drives performance.",
                },
                {
                  name: "Regime Permutation",
                  detail: "Randomly permute HMM regime labels while keeping return series fixed. Tests whether regime-conditioning adds genuine alpha or is a post-hoc rationalisation.",
                },
              ].map((t) => (
                <div key={t.name} style={{ padding: "0.875rem", borderRadius: 8, backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.35rem" }}>{t.name}</div>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.55, margin: 0 }}>{t.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </RevealContainer>

      {/* Walk-forward */}
      <RevealContainer threshold={0.1}>
        <GlassCard hierarchy="secondary">
          <SectionHeader
            title="Walk-Forward Validation"
            description="Expanding-window out-of-sample evaluation across 10 folds spanning 2010–2024."
          />
          <FormulaBlock>
{`Fold k:
  train = [2004_Q1, ... , T_k]        # expanding window
  test  = [T_k + 1Q, ... , T_k + 4Q]  # 1-year OOS holdout

  No look-ahead: regime model retrained each fold
  Transaction costs applied: 5 bps large-cap, 12 bps small-cap
  Filing lag: 45 days (realistic disclosure delay)
  Hold period: 63 trading days`}
          </FormulaBlock>
          <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.65, margin: "1rem 0 0" }}>
            A stable Sharpe Ratio across folds confirms temporal robustness. The signal generalises beyond the in-sample period. Folds with fewer than 30 trades are flagged; metrics weighted by trade count when aggregating fold-level statistics into the portfolio-level summary.
          </p>
        </GlassCard>
      </RevealContainer>

      {/* Factor attribution */}
      <RevealContainer threshold={0.15}>
        <GlassCard hierarchy="secondary">
          <SectionHeader
            title="Fama-French 5-Factor + Momentum Attribution"
            description="OLS regression of RACS portfolio excess returns on the FF5 + Momentum factor model to isolate unexplained alpha."
          />
          <FormulaBlock>
{`R_p,t - R_f,t = alpha
               + beta_MKT  × (R_m,t - R_f,t)
               + beta_SMB  × SMB_t
               + beta_HML  × HML_t
               + beta_RMW  × RMW_t
               + beta_CMA  × CMA_t
               + beta_MOM  × MOM_t
               + epsilon_t

H0: alpha = 0 (t-stat threshold: |t| > 2.0)`}
          </FormulaBlock>
          <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.65, margin: "1rem 0 0" }}>
            A statistically significant alpha (t-stat &gt; 2.0) with low R² confirms that portfolio returns are not fully explained by common factor exposures The RACS signal captures genuine idiosyncratic alpha rather than disguised factor loading. Factor data sourced from the Kenneth French data library.
          </p>
        </GlassCard>
      </RevealContainer>

      {/* References */}
      <RevealContainer threshold={0.15}>
        <GlassCard hierarchy="secondary">
          <SectionHeader
            title="Academic References"
            description="Peer-reviewed papers underpinning every modelling decision in the Andria Systems pipeline."
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
            <Cite
              authors="Bailey, D. H., Borwein, J., Lopez de Prado, M., & Zhu, Q. J."
              year="2016"
              title="The Probability of Backtest Overfitting"
              venue="Journal of Computational Finance, 20(4)"
            />
            <Cite
              authors="Bailey, D. H., & Lopez de Prado, M."
              year="2014"
              title="The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting and Non-Normality"
              venue="Journal of Portfolio Management, 40(5)"
            />
            <Cite
              authors="Fama, E. F., & French, K. R."
              year="2015"
              title="A Five-Factor Asset Pricing Model"
              venue="Journal of Financial Economics, 116(1)"
            />
            <Cite
              authors="Carhart, M. M."
              year="1997"
              title="On Persistence in Mutual Fund Performance"
              venue="Journal of Finance, 52(1)"
            />
            <Cite
              authors="McInnes, L., Healy, J., & Melville, J."
              year="2018"
              title="UMAP: Uniform Manifold Approximation and Projection for Dimension Reduction"
              venue="arXiv:1802.03426"
            />
            <Cite
              authors="Campello, R. J. G. B., Moulavi, D., & Sander, J."
              year="2013"
              title="Density-Based Clustering Based on Hierarchical Density Estimates"
              venue="PAKDD 2013, Lecture Notes in Computer Science, 7819"
            />
            <Cite
              authors="Baum, L. E., Petrie, T., Soules, G., & Weiss, N."
              year="1970"
              title="A Maximization Technique Occurring in the Statistical Analysis of Probabilistic Functions of Markov Chains"
              venue="Annals of Mathematical Statistics, 41(1)"
            />
            <Cite
              authors="Lopez de Prado, M."
              year="2018"
              title="Advances in Financial Machine Learning"
              venue="Wiley Finance"
            />
          </div>
        </GlassCard>
      </RevealContainer>
    </div>
  );
}
