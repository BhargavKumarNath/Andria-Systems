import React, { Suspense } from "react";
import { getDNAClusters } from "@/lib/loaders";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";
import MetricTile from "@/components/MetricTile";
import UmapScatter from "./UmapScatter";
import ArchetypeCards from "./ArchetypeCards";

function Skeleton() {
  return <div className="skeleton-shimmer" style={{ width: "100%", height: 500 }} />;
}

/* ─── UMAP reading guide ─────────────────────────────────────────────────────── */
function UmapReadingGuide({ color }: { color?: string }) {
  const accent = color ?? "#8a2be2";
  const guides = [
    {
      icon: "⟷",
      label: "X-axis (UMAP 1)",
      text: "The horizontal dimension captures the primary axis of behavioural variation — primarily trading frequency. Managers on the left tend to hold positions for years; managers on the right churn portfolios within a quarter.",
    },
    {
      icon: "↕",
      label: "Y-axis (UMAP 2)",
      text: "The vertical dimension captures portfolio concentration and conviction. Managers near the top run highly concentrated books (few large bets); managers near the bottom hold hundreds of positions at low individual weight.",
    },
    {
      icon: "◉",
      label: "Proximity = similarity",
      text: "Two dots close together behave similarly across all 14 features. Tight clusters represent coherent strategies; a manager appearing between two clusters exhibits mixed behavioural traits from both groups.",
    },
    {
      icon: "◈",
      label: "Cluster colours",
      text: "Each colour corresponds to one of the four HDBSCAN archetypes. The algorithm assigns colours by cosine similarity of cluster centroids to prototype vectors -- not by manual labelling.",
    },
    {
      icon: "◌",
      label: "Grey dots (Noise)",
      text: "Grey points are HDBSCAN \"noise\" -- managers with no statistically dense neighbourhood. They are not assigned to any archetype. Typically 5-15% of the universe; they often represent multi-strategy funds or short-lived filers.",
    },
  ];

  return (
    <div style={{
      borderRadius: 12,
      border: `1px solid ${accent}20`,
      backgroundColor: `${accent}06`,
      overflow: "hidden",
    }}>
      <div style={{
        padding: "0.75rem 1.2rem",
        borderBottom: `1px solid ${accent}14`,
        backgroundColor: `${accent}08`,
        display: "flex", alignItems: "center", gap: "0.5rem",
      }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: accent, boxShadow: `0 0 6px ${accent}80` }} />
        <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: accent }}>
          How to read this chart
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", borderBottom: "none" }}>
        {guides.map(({ icon, label, text }, i) => (
          <div key={label} style={{
            padding: "0.9rem 1rem",
            borderRight: i < 4 ? `1px solid ${accent}10` : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginBottom: "0.4rem" }}>
              <span style={{ fontSize: "0.75rem", color: accent }}>{icon}</span>
              <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: accent }}>
                {label}
              </span>
            </div>
            <p style={{ fontSize: "0.73rem", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
              {text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

async function DnaContent() {
  const data = await getDNAClusters();
  const { total_managers, archetypes, umap_sample, silhouette_score, best_min_cluster_size, min_cluster_size_sweep } = data;

  const realArchetypes = archetypes.filter((a) => a.cluster_id !== -1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>

      {/* ── 1. Hero intro ─────────────────────────────────────────────────────── */}
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
                  Manager DNA · Behavioural Clustering
                </span>
              </div>

              <h1 style={{
                fontSize: "clamp(1.6rem, 2.4vw, 2.2rem)",
                fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.15,
                margin: "0 0 0.85rem",
                background: "linear-gradient(135deg, #ffffff 0%, rgba(196,181,253,0.85) 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>
                How Institutional Managers<br />Actually Behave
              </h1>

              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: "54ch", margin: 0 }}>
                Not all institutional investors are equal. A passive index giant buying 10,000 stocks and an activist hedge fund
                taking a concentrated 8% stake in one company both file a 13F -- but the signal value of their disclosures is
                fundamentally different. This page uses unsupervised machine learning to identify those differences at scale.
              </p>
            </div>

            <div style={{
              padding: "1.2rem 1.5rem", borderRadius: 14, flexShrink: 0,
              backgroundColor: "rgba(138,43,226,0.07)", border: "1px solid rgba(138,43,226,0.2)",
              minWidth: 200,
            }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.6rem" }}>
                What the algorithm does
              </div>
              {[
                ["Step 1", "Extract 14 behavioural features per manager-quarter from 13F data"],
                ["Step 2", "UMAP compresses 14 dimensions into a 2D map preserving local structure"],
                ["Step 3", "HDBSCAN finds density-connected clusters without a fixed number of groups"],
                ["Step 4", "Cosine similarity assigns each cluster a semantic archetype label"],
              ].map(([step, desc]) => (
                <div key={step} style={{ display: "flex", gap: "0.6rem", marginBottom: "0.55rem", alignItems: "flex-start" }}>
                  <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#8a2be2", fontFamily: "monospace", flexShrink: 0, paddingTop: "0.1rem" }}>{step}</span>
                  <span style={{ fontSize: "0.73rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </RevealContainer>

      {/* ── 2. KPI row ────────────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1.5rem" }}>
          <GlassCard hierarchy="secondary">
            <MetricTile
              label="Managers Profiled"
              value={total_managers.toLocaleString()}
              sub="Unique institutional filers with 4+ active quarters"
            />
          </GlassCard>
          <GlassCard hierarchy="secondary">
            <MetricTile
              label="Stable Archetypes"
              value={data.n_archetypes}
              sub="Density-connected groups found by HDBSCAN"
            />
          </GlassCard>
          <GlassCard hierarchy="secondary">
            <MetricTile
              label="Silhouette Score"
              value={silhouette_score != null ? silhouette_score.toFixed(3) : "--"}
              sub="Cluster separation quality: >0.5 = strong structure"
            />
          </GlassCard>
          <GlassCard hierarchy="secondary">
            <MetricTile
              label="Best min_cluster_size"
              value={best_min_cluster_size ?? "HDBSCAN"}
              sub={`Tuned via sweep over ${min_cluster_size_sweep?.length ?? "N"} values`}
            />
          </GlassCard>
        </div>
      </RevealContainer>

      {/* ── 3. UMAP scatter + reading guide ───────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="Manager Behavioral Embedding"
          description={`UMAP 2D projection of 14 behavioural features across ${total_managers.toLocaleString()} institutional managers. Each dot is one manager. Proximity indicates behavioural similarity.`}
        />
        <GlassCard hierarchy="primary">
          <UmapScatter points={umap_sample} archetypes={realArchetypes} />
        </GlassCard>
        <div style={{ marginTop: "0.85rem" }}>
          <UmapReadingGuide color="#8a2be2" />
        </div>
      </RevealContainer>

      {/* ── 4. Archetype cards ────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="Behavioural Archetypes"
          description="Four distinct investor phenotypes emerge from unsupervised clustering. Click any card to understand who these managers are, how they trade, and what their 13F filings actually signal."
        />
        <ArchetypeCards archetypes={realArchetypes} />
      </RevealContainer>

      {/* ── 5. Feature space ──────────────────────────────────────────────────── */}
      <RevealContainer threshold={0.15}>
        <GlassCard hierarchy="secondary">
          <SectionHeader
            title="Feature Space: 14 Dimensions"
            description="Each of these behavioural metrics is computed per manager across all available 13F quarters before being passed to UMAP and HDBSCAN. No label information is used -- the clusters emerge purely from the data."
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {[
              { f: "avg_hhi", note: "Portfolio concentration (Herfindahl index)" },
              { f: "avg_put_ratio", note: "Options hedging activity" },
              { f: "log_avg_aum", note: "Scale of assets under management" },
              { f: "avg_turnover", note: "Quarterly portfolio churn rate" },
              { f: "avg_conviction_delta", note: "Avg position size change on entry" },
              { f: "new_position_rate", note: "New names added per quarter" },
              { f: "exit_rate", note: "Positions fully liquidated per quarter" },
              { f: "avg_holding_duration_qtrs", note: "How long positions are kept" },
              { f: "top5_concentration", note: "% AUM in top 5 holdings" },
              { f: "options_notional_ratio", note: "Options vs equity notional value" },
              { f: "shared_vote_ratio", note: "Proxy voting participation rate" },
              { f: "amendment_rate", note: "Rate of 13F/A amendment filings" },
              { f: "quarters_active", note: "Filing history length" },
              { f: "aum_volatility", note: "Quarter-to-quarter AUM fluctuation" },
            ].map(({ f, note }) => (
              <div
                key={f}
                title={note}
                style={{
                  padding: "0.25rem 0.65rem",
                  borderRadius: 4,
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  backgroundColor: "rgba(138,43,226,0.08)",
                  border: "1px solid rgba(138,43,226,0.18)",
                  color: "#c4b5fd",
                  cursor: "default",
                }}
              >
                {f}
              </div>
            ))}
          </div>
          <p style={{ marginTop: "0.9rem", fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6, margin: "0.9rem 0 0" }}>
            Hover any feature chip for a plain-English description. Features are z-score normalised before being passed to UMAP.
          </p>
        </GlassCard>
      </RevealContainer>
    </div>
  );
}

export default function DnaPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <DnaContent />
    </Suspense>
  );
}
