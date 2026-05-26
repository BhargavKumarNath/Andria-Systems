import React, { Suspense } from "react";
import { getDNAClusters } from "@/lib/loaders";
import SectionHeader from "@/components/SectionHeader";
import GlassCard from "@/components/GlassCard";
import RevealContainer from "@/components/RevealContainer";
import MetricTile from "@/components/MetricTile";
import UmapScatter from "./UmapScatter";
import { ARCHETYPE_COLORS } from "@/lib/taxonomy";

function Skeleton() {
  return <div className="skeleton-shimmer" style={{ width: "100%", height: 500 }} />;
}

async function DnaContent() {
  const data = await getDNAClusters();
  const { total_managers, archetypes, umap_sample, silhouette_score, best_min_cluster_size, min_cluster_size_sweep } = data;

  const realArchetypes = archetypes.filter((a) => a.cluster_id !== -1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>
      {/* KPI row */}
      <RevealContainer threshold={0.1}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1.5rem" }}>
          <GlassCard hierarchy="secondary">
            <MetricTile label="Managers Profiled" value={total_managers.toLocaleString()} />
          </GlassCard>
          <GlassCard hierarchy="secondary">
            <MetricTile label="Stable Archetypes" value={data.n_archetypes} />
          </GlassCard>
          <GlassCard hierarchy="secondary">
            <MetricTile label="Silhouette Score" value={silhouette_score.toFixed(3)} />
          </GlassCard>
          <GlassCard hierarchy="secondary">
            <MetricTile label="Algorithm" value="HDBSCAN" />
          </GlassCard>
        </div>
      </RevealContainer>

      {/* UMAP scatter */}
      <RevealContainer threshold={0.1}>
        <GlassCard hierarchy="primary">
          <SectionHeader
            title="Manager Behavioral Embedding"
            description={`UMAP 2D projection of 14 behavioural features across ${total_managers.toLocaleString()} institutional managers. Clusters identified by HDBSCAN sweep over min_cluster_size ∈ {${min_cluster_size_sweep?.join(", ")}}; best = ${best_min_cluster_size}.`}
          />
          <UmapScatter points={umap_sample} archetypes={realArchetypes} />
        </GlassCard>
      </RevealContainer>

      {/* Archetype cards */}
      <RevealContainer threshold={0.1}>
        <SectionHeader
          title="Behavioural Archetypes"
          description="Semantic labels assigned via cosine similarity of HDBSCAN cluster centroids against prototype vectors in feature space"
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1.25rem" }}>
          {realArchetypes.map((a, i) => {
            const color = ARCHETYPE_COLORS[a.archetype_label] ?? "#a1a1aa";
            return (
              <GlassCard key={a.archetype_label} hierarchy="secondary" delayIndex={i}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                  <div>
                    <div style={{
                      display: "inline-block",
                      padding: "0.2rem 0.65rem",
                      borderRadius: 4,
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      backgroundColor: `${color}20`,
                      color,
                      border: `1px solid ${color}40`,
                      marginBottom: "0.5rem",
                    }}>
                      Archetype {a.cluster_id}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{a.archetype_label}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color }}>{a.count.toLocaleString()}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{(a.pct * 100).toFixed(1)}% of universe</div>
                  </div>
                </div>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                  {a.description}
                </p>
                {/* Share bar */}
                <div style={{ marginTop: "1rem", height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.06)" }}>
                  <div style={{ height: "100%", borderRadius: 2, background: color, width: `${a.pct * 100}%` }} />
                </div>
              </GlassCard>
            );
          })}
        </div>
      </RevealContainer>

      {/* Feature space note */}
      <RevealContainer threshold={0.15}>
        <GlassCard hierarchy="secondary">
          <SectionHeader title="Feature Space (14 Dimensions)" description="Behavioural features extracted per manager across all available 13F quarters" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {[
              "avg_hhi", "avg_put_ratio", "log_avg_aum", "avg_turnover",
              "avg_conviction_delta", "new_position_rate", "exit_rate",
              "avg_holding_duration_qtrs", "top5_concentration",
              "options_notional_ratio", "shared_vote_ratio", "amendment_rate",
              "quarters_active", "aum_volatility",
            ].map((f) => (
              <span key={f} style={{
                padding: "0.25rem 0.65rem",
                borderRadius: 4,
                fontSize: "0.75rem",
                fontFamily: "monospace",
                backgroundColor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--text-secondary)",
              }}>
                {f}
              </span>
            ))}
          </div>
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
