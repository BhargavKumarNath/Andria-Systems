import type { SignalsArtifact, RegimesArtifact, MetadataArtifact, BacktestArtifact } from "@/lib/loaders";
import { OverviewMetrics, PipelineHistory } from "./overview.types";

export function transformOverviewMetrics(
  signals: SignalsArtifact,
  regimes: RegimesArtifact,
  metadata: MetadataArtifact | null,
  backtest: BacktestArtifact,
): OverviewMetrics {
  return {
    totalFilings: metadata?.data_vintage?.total_filings_processed ?? null,
    currentRegime: regimes.current?.regime_label ?? "Unknown",
    regimeProb: regimes.current?.regime_prob ?? 0,
    provenance: signals.provenance_quality ?? 0,
    sharpe: backtest.summary.total_trades > 0 ? backtest.summary.annualized_sharpe : null,
    walkForwardFolds: backtest.walk_forward_folds.length,
  };
}

function _duration(startedAt: string, completedAt: string): string {
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "--";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export function buildRunHistory(metadata: MetadataArtifact | null): PipelineHistory[] {
  const runs = metadata?.recent_runs ?? [];
  return runs.map((r) => ({
    id: r.run_id,
    status: r.status === "success" ? "success" : "failed",
    timestamp: r.started_at
      ? new Date(r.started_at).toLocaleString("en-US", { timeZone: "UTC", hour12: false }) + " UTC"
      : "Unknown",
    duration: r.started_at && r.completed_at ? _duration(r.started_at, r.completed_at) : "--",
    gitCommit: r.git_sha,
    stage: r.stage,
  }));
}
