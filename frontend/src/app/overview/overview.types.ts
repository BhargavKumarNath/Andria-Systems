export interface OverviewMetrics {
  totalFilings: number | null;
  currentRegime: string;
  regimeProb: number;
  provenance: number;
  sharpe: number | null;
  walkForwardFolds: number;
}

export interface PipelineHistory {
  id: string;
  status: "success" | "failed";
  timestamp: string;
  duration: string;
  gitCommit?: string;
  stage?: string;
}
