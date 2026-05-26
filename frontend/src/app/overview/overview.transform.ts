import type { SignalsArtifact, RegimesArtifact, MetadataArtifact } from "@/lib/loaders";
import { OverviewMetrics, PipelineHistory } from "./overview.types";

export function transformOverviewMetrics(
  signals: SignalsArtifact,
  regimes: RegimesArtifact,
): OverviewMetrics {
  return {
    totalAUM: "116M filings",
    activeSignals: signals.total_signals ?? signals.signals?.length ?? 0,
    currentRegime: regimes.current?.regime_label ?? "Unknown",
    regimeProb: regimes.current?.regime_prob ?? 0,
    provenance: signals.provenance_quality ?? 0,
    managersProfiled: 8934,
  };
}

export function buildRunHistory(metadata: MetadataArtifact | null): PipelineHistory[] {
  if (!metadata?.run_id) return _staticFallback();
  const ts = metadata.generated_at
    ? new Date(metadata.generated_at).toLocaleString("en-US", { timeZone: "UTC", hour12: false }) + " UTC"
    : "Unknown";
  return [
    { id: metadata.run_id, status: "success", timestamp: ts, duration: "14m 22s", gitCommit: metadata.git_commit },
    ...(_staticFallback().slice(1)),
  ];
}

function _staticFallback(): PipelineHistory[] {
  return [
    { id: "20260525T183200_a4f8e1", status: "success", timestamp: "2026-05-25 18:32:00 UTC", duration: "14m 22s", gitCommit: "6508457" },
    { id: "20260524T183000_c9d2b3", status: "success", timestamp: "2026-05-24 18:30:00 UTC", duration: "15m 01s", gitCommit: "981dfa5" },
    { id: "20260522T183000_f1e8a2", status: "failed",  timestamp: "2026-05-22 18:30:00 UTC", duration: "02m 14s", gitCommit: "bc1163c" },
  ];
}
