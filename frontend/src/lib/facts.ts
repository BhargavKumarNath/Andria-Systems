// Headline facts shown across the dashboard, derived from the exported
// artifacts in public/data at build time. Pages must read figures from here
// instead of hardcoding them: hardcoded copy is how the site came to show
// demo-era numbers (116M filings, 8,934 managers, Sharpe 1.847) after the
// real run replaced them.

import {
  getBacktestData,
  getDNAClusters,
  getMetadata,
  getRegimeData,
  getSignalsData,
  getValidationData,
} from "./loaders";

export interface GateCheckFact {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface DashboardFacts {
  runId: string | null;
  filingsRows: number | null;
  filingsRowsShort: string;
  firstQuarter: string | null;
  lastQuarter: string | null;
  totalQuarters: number | null;
  totalManagers: number | null;
  totalCusips: number | null;
  clusteredManagers: number;
  archetypes: { label: string; count: number; pct: number }[];
  namedArchetypeCount: number;
  noisePct: number | null;
  regimeObservations: number;
  regimeFirstDate: string | null;
  regimeLastDate: string | null;
  totalSignals: number;
  signalQuarters: number;
  signalFirstQuarter: string | null;
  signalLastQuarter: string | null;
  provenanceValue: number | null;
  provenanceThreshold: number | null;
  provenanceDetail: string;
  gatePassed: boolean;
  gateChecks: GateCheckFact[];
  failedGateChecks: string[];
  dsr: number | null;
  pbo: number | null;
  monteCarloSignificant: number;
  monteCarloTotal: number;
  annualizedSharpe: number | null;
  totalTrades: number | null;
  holdingPeriodDays: number | null;
}

const GATE_LABELS: Record<string, string> = {
  leakage_audit: "Leakage audit",
  provenance_threshold: "Provenance",
  reproducibility: "Reproducibility",
  pbo_validation: "PBO",
};

export function formatQuarter(q: string | null): string {
  if (!q) return "n/a";
  const m = /^(\d{4})_?Q([1-4])$/.exec(q);
  return m ? `${m[1]} Q${m[2]}` : q;
}

export function formatMillions(n: number | null): string {
  if (n == null) return "n/a";
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatInt(n: number | null): string {
  return n == null ? "n/a" : n.toLocaleString("en-US");
}

export async function getDashboardFacts(): Promise<DashboardFacts> {
  const [metadata, clusters, regimes, signals, validation, backtest] = await Promise.all([
    getMetadata(),
    getDNAClusters(),
    getRegimeData(),
    getSignalsData(),
    getValidationData(),
    getBacktestData(),
  ]);

  const vintage = metadata?.data_vintage;
  const archetypes = (clusters.archetypes ?? []).map((a) => ({
    label: a.archetype_label,
    count: a.count,
    pct: a.pct,
  }));
  const noise = archetypes.find((a) => a.label === "Noise");

  const gateChecks: GateCheckFact[] = Object.entries(validation.checks ?? {}).map(
    ([key, check]) => ({
      key,
      label: GATE_LABELS[key] ?? key,
      passed: Boolean(check.passed),
      detail: "detail" in check && typeof check.detail === "string" ? check.detail : "",
    }),
  );

  const quarters = signals.data_quarters ?? [];
  const history = regimes.history ?? [];
  const mc = validation.monte_carlo?.results ?? [];
  const provenance = validation.checks?.provenance_threshold;

  return {
    runId: metadata?.run_id ?? null,
    filingsRows: vintage?.total_filings_processed ?? null,
    filingsRowsShort: formatMillions(vintage?.total_filings_processed ?? null),
    firstQuarter: vintage?.edgar_from ?? null,
    lastQuarter: vintage?.edgar_through ?? null,
    totalQuarters: vintage?.total_quarters ?? null,
    totalManagers: vintage?.total_managers ?? null,
    totalCusips: vintage?.total_cusips ?? null,
    clusteredManagers: clusters.total_managers ?? 0,
    archetypes,
    namedArchetypeCount: archetypes.filter((a) => a.label !== "Noise").length,
    noisePct: noise ? noise.pct : null,
    regimeObservations: regimes.total_observations ?? history.length,
    regimeFirstDate: history.length ? String(history[0].date) : null,
    regimeLastDate: history.length ? String(history[history.length - 1].date) : null,
    totalSignals: signals.total_signals ?? 0,
    signalQuarters: quarters.length,
    signalFirstQuarter: quarters[0] ?? null,
    signalLastQuarter: quarters[quarters.length - 1] ?? null,
    provenanceValue: provenance?.value ?? null,
    provenanceThreshold: provenance?.threshold ?? null,
    provenanceDetail: provenance?.detail ?? "",
    gatePassed: Boolean(validation.gate_passed),
    gateChecks,
    failedGateChecks: gateChecks.filter((c) => !c.passed).map((c) => c.label),
    dsr: validation.dsr?.dsr ?? null,
    pbo: validation.pbo?.score ?? null,
    monteCarloSignificant: mc.filter((r) => r.significant).length,
    monteCarloTotal: mc.length,
    annualizedSharpe: backtest.summary?.annualized_sharpe ?? null,
    totalTrades: backtest.summary?.total_trades ?? null,
    holdingPeriodDays: backtest.summary?.holding_period_days ?? null,
  };
}
