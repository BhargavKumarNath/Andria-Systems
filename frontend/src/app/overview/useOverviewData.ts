import { getSignalsData, getRegimeData } from "@/lib/loaders";
import { transformOverviewMetrics, generateMockHistory } from "./overview.transform";
import { OverviewMetrics, PipelineHistory } from "./overview.types";

export async function useOverviewData(): Promise<{ metrics: OverviewMetrics; history: PipelineHistory[] }> {
  // Parallel fetch using the unified data loader
  const [signals, regimes] = await Promise.all([
    getSignalsData(),
    getRegimeData()
  ]);

  const metrics = transformOverviewMetrics(signals, regimes);
  const history = generateMockHistory();

  return { metrics, history };
}
