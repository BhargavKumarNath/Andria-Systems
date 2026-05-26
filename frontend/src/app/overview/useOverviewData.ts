import { getSignalsData, getRegimeData, getMetadata } from "@/lib/loaders";
import { transformOverviewMetrics, buildRunHistory } from "./overview.transform";
import { OverviewMetrics, PipelineHistory } from "./overview.types";

export async function useOverviewData(): Promise<{
  metrics: OverviewMetrics;
  history: PipelineHistory[];
}> {
  const [signals, regimes, metadata] = await Promise.all([
    getSignalsData(),
    getRegimeData(),
    getMetadata(),
  ]);

  return {
    metrics: transformOverviewMetrics(signals, regimes),
    history: buildRunHistory(metadata),
  };
}
