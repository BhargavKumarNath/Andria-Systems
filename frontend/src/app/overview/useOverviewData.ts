import { getSignalsData, getRegimeData, getMetadata, getBacktestData } from "@/lib/loaders";
import { transformOverviewMetrics, buildRunHistory } from "./overview.transform";
import { OverviewMetrics, PipelineHistory } from "./overview.types";

export async function useOverviewData(): Promise<{
  metrics: OverviewMetrics;
  history: PipelineHistory[];
}> {
  const [signals, regimes, metadata, backtest] = await Promise.all([
    getSignalsData(),
    getRegimeData(),
    getMetadata(),
    getBacktestData(),
  ]);

  return {
    metrics: transformOverviewMetrics(signals, regimes, metadata, backtest),
    history: buildRunHistory(metadata),
  };
}
