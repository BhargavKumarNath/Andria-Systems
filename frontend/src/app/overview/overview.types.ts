export interface OverviewMetrics {
  totalAUM: string;
  activeSignals: number;
  currentRegime: string;
  regimeProb: number;
  provenance: number;
  managersProfiled: number;
}

export interface PipelineHistory {
  id: string;
  status: "success" | "failed";
  timestamp: string;
  duration: string;
  gitCommit?: string;
}
