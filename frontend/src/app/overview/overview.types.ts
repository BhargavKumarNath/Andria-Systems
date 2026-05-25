export interface OverviewMetrics {
  totalAUM: string;
  activeSignals: number;
  currentRegime: string;
}

export interface PipelineHistory {
  id: string;
  status: "success" | "failed";
  timestamp: string;
  duration: string;
}
