import { formatInt, formatQuarter, getDashboardFacts } from "@/lib/facts";
import ArchitectureView, { type ArchitectureFacts } from "./ArchitectureView";

const pct = (v: number | null, digits = 1) => (v === null ? "n/a" : `${(v * 100).toFixed(digits)}%`);

export default async function ArchitecturePage() {
  const f = await getDashboardFacts();
  const firstYear = f.firstQuarter?.slice(0, 4) ?? "?";
  const lastYear = f.lastQuarter?.slice(0, 4) ?? "?";

  const facts: ArchitectureFacts = {
    filingsRowsShort: f.filingsRowsShort,
    firstQuarter: formatQuarter(f.firstQuarter),
    period: `${firstYear}–${lastYear}`,
    totalQuarters: formatInt(f.totalQuarters),
    totalManagers: formatInt(f.totalManagers),
    clusteredManagers: formatInt(f.clusteredManagers),
    namedArchetypes: f.namedArchetypeCount,
    noisePct: pct(f.noisePct, 0),
    regimeObservations: f.regimeObservations,
    totalSignals: formatInt(f.totalSignals),
    signalQuarters: f.signalQuarters,
    provenancePct: pct(f.provenanceValue),
    gatePassed: f.gatePassed,
    failedGateChecks: f.failedGateChecks,
    dsr: f.dsr === null ? "Not estimable" : f.dsr.toFixed(3),
    pbo: f.pbo === null ? "Not estimable" : pct(f.pbo),
    monteCarlo: `${f.monteCarloSignificant} of ${f.monteCarloTotal}`,
    sharpe: f.annualizedSharpe === null ? "n/a" : f.annualizedSharpe.toFixed(2),
    trades: formatInt(f.totalTrades),
    holdingDays: formatInt(f.holdingPeriodDays),
  };

  return <ArchitectureView facts={facts} />;
}
