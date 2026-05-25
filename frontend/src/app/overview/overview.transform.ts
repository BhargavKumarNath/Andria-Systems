import { OverviewMetrics, PipelineHistory } from "./overview.types";
import { OVERVIEW_CONSTANTS } from "./overview.constants";

export function transformOverviewMetrics(signalsData: any, regimeData: any): OverviewMetrics {
  return {
    totalAUM: OVERVIEW_CONSTANTS.PIPELINE_VOLUME,
    activeSignals: signalsData?.signals?.length || 0,
    currentRegime: regimeData?.regime?.current_regime || "Unknown",
  };
}

export function generateMockHistory(): PipelineHistory[] {
  // In a real system, this would come from an MLflow API or DuckDB query.
  // For static demo, we mock recent runs.
  return [
    { id: "run_948a2", status: "success", timestamp: "2026-05-24 18:32:00 UTC", duration: "14m 22s" },
    { id: "run_881b4", status: "success", timestamp: "2026-05-23 18:30:00 UTC", duration: "15m 01s" },
    { id: "run_7a9c1", status: "failed", timestamp: "2026-05-22 18:30:00 UTC", duration: "02m 14s" },
  ];
}
