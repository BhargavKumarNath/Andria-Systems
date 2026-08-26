import "server-only";
import fs from "fs";
import path from "path";

// ── types ─────────────────────────────────────────────────────────────────────

export interface RacsSignal {
  rank: number;
  quarter: string;
  cusip: string;
  ticker: string;
  activist_buyers: number;
  strong_buys: number;
  total_activist_value: number;
  total_funds: number;
  conviction_raw: number;
  crowding_penalty: number;
  racs_score: number;
  regime_label: string;
  regime_adjusted_racs: number;
}

export interface SignalsArtifact {
  generated_at: string;
  run_id: string;
  provenance_quality: number;
  validation_passed: boolean;
  total_signals: number;
  data_quarters: string[];
  signals: RacsSignal[];
}

export interface RegimePoint {
  date: string;
  regime_id: number;
  regime_label: string;
  regime_prob: number;
}

export interface RegimesArtifact {
  generated_at: string;
  run_id: string;
  total_observations: number;
  current: RegimePoint;
  history: RegimePoint[];
  distribution: { regime_label: string; count: number; pct: number }[];
  transition_matrix?: { labels: string[]; matrix: number[][] };
}

export interface ArchetypeMeta {
  archetype_label: string;
  count: number;
  pct: number;
}

export interface UmapPoint {
  umap_x: number;
  umap_y: number;
  archetype_label: string;
  cluster_id: number;
}

export interface ClustersArtifact {
  generated_at: string;
  run_id: string;
  total_managers: number;
  n_archetypes: number;
  algorithm: string;
  embedding: string;
  min_cluster_size_sweep?: number[];
  best_min_cluster_size?: number;
  silhouette_score?: number;
  archetypes: ArchetypeMeta[];
  umap_sample: UmapPoint[];
}

export interface PortfolioArtifact {
  generated_at: string;
  run_id: string;
  summary: {
    n_positions: number;
  };
  top_holdings: {
    rank: number;
    cusip: string;
    mean_return: number;
  }[];
}

export interface RegimeMetric {
  n_obs: number;
  mean_return: number;
  sharpe: number;
  max_dd: number;
  raw_p_value: number;
  fdr_significant: boolean;
}

export interface CapacityPoint {
  aum_usd: number;
  aum_label: string;
  n_positions: number;
  n_excluded: number;
  exclusion_pct: number;
  sharpe: number | null;
  mean_return: number | null;
}

export interface SignalDecayPoint {
  horizon_days: number;
  regime: string;
  ic: number;
  ic_tstat: number;
  ic_pvalue: number;
  n_obs: number;
}

export interface ValidationArtifact {
  generated_at: string;
  run_id: string;
  gate_passed: boolean;
  checks: {
    leakage_audit:        { passed: boolean; detail: string };
    provenance_threshold: { passed: boolean; value: number; threshold: number; detail: string };
    reproducibility:      { passed: boolean; detail: string };
    pbo_validation:       { passed: boolean; value: number | null; threshold: number };
  };
  dsr: {
    sharpe_observed: number | null;
    sharpe_benchmark?: number;
    dsr: number | null;
    is_significant: boolean;
    skewness?: number;
    excess_kurtosis?: number;
    serial_corr_lag1?: number;
    n_effective?: number;
    n_trials_adjusted_for?: number;
  };
  pbo: {
    score: number | null;
    n_partitions: number;
    n_combinations: number;
    passed: boolean;
  };
  monte_carlo: {
    n_simulations: number;
    results: {
      test: string;
      observed: number;
      p_value: number;
      sharpe_5pct: number;
      sharpe_50pct: number;
      sharpe_95pct: number;
      significant: boolean;
    }[];
  };
}

export interface WalkForwardFold {
  fold: number;
  train_start: number;
  train_end: number;
  test_start: number;
  test_end: number;
  n_trades: number;
  sharpe: number;
  mean_return: number;
  max_drawdown: number;
  hit_rate: number;
}

export interface BacktestArtifact {
  generated_at: string;
  run_id: string;
  summary: {
    annualized_sharpe: number;
    total_trades: number;
    holding_period_days: number;
    filing_lag_days: number;
    fill_delay_days: number;
    survivorship_flags: number;
    portfolio_turnover_annualized: number;
  };
  metrics_by_regime: Record<string, RegimeMetric>;
  walk_forward_folds: WalkForwardFold[];
  factor_attribution: {
    status: string;
    reason?: string;
    trades_survived?: number;
    total_ledger?: number;
    r_squared: number | null;
    annualized_alpha_bps: number | null;
  };
  capacity: CapacityPoint[];
  signal_decay: {
    half_life_days: number;
    curve: SignalDecayPoint[];
  };
}

export interface RecentRun {
  run_id: string;
  stage: string;
  status: string;
  started_at: string;
  completed_at: string;
  git_sha: string;
}

export interface MetadataArtifact {
  generated_at: string;
  run_id: string;
  git_commit: string;
  pipeline_version: string;
  data_vintage: {
    edgar_through: string | null;
    fred_through: string | null;
    total_filings_processed: number | null;
    total_managers?: number;
    total_cusips?: number;
    source: string;
  };
  recent_runs?: RecentRun[];
  artifact_hashes: Record<string, string>;
}

// ── core loader ───────────────────────────────────────────────────────────────

async function getStaticArtifact<T>(filename: string): Promise<T | null> {
  const filePath = path.join(process.cwd(), "public", "data", filename);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    console.warn(`[Loader] Missing artifact: ${filename}`);
    return null;
  }
}

// ── public loaders ────────────────────────────────────────────────────────────

export async function getSignalsData(): Promise<SignalsArtifact> {
  const data = await getStaticArtifact<SignalsArtifact>("signals.json");
  return data ?? {
    generated_at: "", run_id: "NONE",
    provenance_quality: 0, validation_passed: false,
    total_signals: 0, data_quarters: [], signals: [],
  };
}

export async function getRegimeData(): Promise<RegimesArtifact> {
  const data = await getStaticArtifact<RegimesArtifact>("regimes.json");
  return data ?? {
    generated_at: "", run_id: "NONE",
    total_observations: 0,
    current: { date: "", regime_id: 0, regime_label: "Unknown", regime_prob: 0 },
    history: [], distribution: [],
    transition_matrix: { labels: [], matrix: [] },
  };
}

export async function getDNAClusters(): Promise<ClustersArtifact> {
  const data = await getStaticArtifact<ClustersArtifact>("clusters.json");
  return data ?? {
    generated_at: "", run_id: "NONE",
    total_managers: 0, n_archetypes: 0,
    algorithm: "HDBSCAN", embedding: "UMAP",
    min_cluster_size_sweep: [], best_min_cluster_size: 0,
    silhouette_score: 0, archetypes: [], umap_sample: [],
  };
}

export async function getPortfolioData(): Promise<PortfolioArtifact> {
  const data = await getStaticArtifact<PortfolioArtifact>("portfolio.json");
  return data ?? {
    generated_at: "", run_id: "NONE",
    summary: { n_positions: 0 },
    top_holdings: [],
  };
}

export async function getValidationData(): Promise<ValidationArtifact> {
  const data = await getStaticArtifact<ValidationArtifact>("validation.json");
  return data ?? {
    generated_at: "", run_id: "NONE",
    gate_passed: false,
    checks: {
      leakage_audit:        { passed: false, detail: "" },
      provenance_threshold: { passed: false, value: 0, threshold: 0.9, detail: "" },
      reproducibility:      { passed: false, detail: "" },
      pbo_validation:       { passed: false, value: null, threshold: 0.4 },
    },
    dsr: { sharpe_observed: null, dsr: null, is_significant: false },
    pbo: { score: null, n_partitions: 0, n_combinations: 0, passed: false },
    monte_carlo: { n_simulations: 0, results: [] },
  };
}

export async function getBacktestData(): Promise<BacktestArtifact> {
  const data = await getStaticArtifact<BacktestArtifact>("backtest.json");
  return data ?? {
    generated_at: "", run_id: "NONE",
    summary: {
      annualized_sharpe: 0, total_trades: 0, holding_period_days: 0,
      filing_lag_days: 0, fill_delay_days: 0, survivorship_flags: 0,
      portfolio_turnover_annualized: 0,
    },
    metrics_by_regime: {},
    walk_forward_folds: [],
    factor_attribution: {
      status: "skipped", reason: "no_data", r_squared: null, annualized_alpha_bps: null,
    },
    capacity: [],
    signal_decay: { half_life_days: 0, curve: [] },
  };
}

export async function getMetadata(): Promise<MetadataArtifact | null> {
  return getStaticArtifact<MetadataArtifact>("metadata.json");
}
