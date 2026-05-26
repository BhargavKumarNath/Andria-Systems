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
  transition_matrix: { labels: string[]; matrix: number[][] };
}

export interface ArchetypeMeta {
  archetype_label: string;
  cluster_id: number;
  count: number;
  pct: number;
  description: string;
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
  min_cluster_size_sweep: number[];
  best_min_cluster_size: number;
  silhouette_score: number;
  archetypes: ArchetypeMeta[];
  umap_sample: UmapPoint[];
}

export interface PortfolioArtifact {
  generated_at: string;
  run_id: string;
  summary: {
    gross_exposure: number;
    net_exposure: number;
    estimated_turnover: number;
    cash_drag: number;
    n_positions: number;
    n_long: number;
    n_short: number;
    top_n_decile: number;
  };
  top_holdings: {
    rank: number;
    ticker: string;
    cusip: string;
    weight: number;
    racs_score: number;
    regime_label: string;
  }[];
  costs: {
    large_cap_bps: number;
    small_cap_bps: number;
    filing_lag_days: number;
    holding_period_days: number;
    fill_delay_days: number;
  };
  factor_risk: {
    market_var: number;
    factor_var: number;
    idiosyncratic_var: number;
    factor_pct: number;
  };
}

export interface ValidationArtifact {
  generated_at: string;
  run_id: string;
  gate_passed: boolean;
  checks: {
    leakage_audit:       { passed: boolean; detail: string };
    provenance_threshold:{ passed: boolean; value: number; threshold: number; detail: string };
    reproducibility:     { passed: boolean; detail: string };
    pbo_validation:      { passed: boolean; value: number; threshold: number; detail: string };
  };
  dsr: {
    observed_sharpe: number;
    deflated_sharpe: number;
    is_significant: boolean;
    n_trials: number;
    skewness: number;
    excess_kurtosis: number;
    serial_correlation: number;
    benchmark_sharpe: number;
    detail: string;
  };
  pbo: {
    score: number;
    n_partitions: number;
    n_combinations: number;
    passed: boolean;
    detail: string;
  };
  monte_carlo: {
    n_simulations: number;
    bootstrap:          { test: string; observed_sharpe: number; p_value: number; sharpe_5pct: number; sharpe_50pct: number; sharpe_95pct: number; significant: boolean };
    randomized_entry:   { test: string; observed_sharpe: number; p_value: number; sharpe_5pct: number; sharpe_50pct: number; sharpe_95pct: number; significant: boolean };
    regime_permutation: { test: string; observed_sharpe: number; p_value: number; sharpe_5pct: number; sharpe_50pct: number; sharpe_95pct: number; significant: boolean };
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
    annualized_return: number;
    max_drawdown: number;
    hit_rate: number;
    total_trades: number;
    holding_period_days: number;
    filing_lag_days: number;
    fill_delay_days: number;
    test_period: string;
  };
  walk_forward_folds: WalkForwardFold[];
  factor_attribution: {
    alpha_annualized: number;
    alpha_t_stat: number;
    market_beta: number;
    smb: number;
    hml: number;
    rmw: number;
    cma: number;
    mom: number;
    r_squared: number;
    detail: string;
  };
  capacity: {
    estimated_capacity_usd: number;
    adv_participation_limit_pct: number;
    adv_cliff_at_aum_usd: number;
    detail: string;
  };
  signal_decay: {
    half_life_days: number;
    peak_ic: number;
    detail: string;
  };
}

export interface MetadataArtifact {
  generated_at: string;
  run_id: string;
  git_commit: string;
  pipeline_version: string;
  data_vintage: {
    edgar_through: string;
    fred_through: string;
    total_filings_processed: number;
    total_managers: number;
    total_cusips: number;
    source: string;
  };
  pipeline_config: {
    hmm_states: number;
    hdbscan_min_cluster_size: number;
    racs_min_activist_buyers: number;
    racs_regime_weight: number;
    backtest_holding_days: number;
    backtest_filing_lag: number;
    cscv_partitions: number;
    monte_carlo_n: number;
    global_seed: number;
  };
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
    summary: {
      gross_exposure: 0, net_exposure: 0, estimated_turnover: 0,
      cash_drag: 0, n_positions: 0, n_long: 0, n_short: 0, top_n_decile: 0,
    },
    top_holdings: [],
    costs: { large_cap_bps: 0, small_cap_bps: 0, filing_lag_days: 0, holding_period_days: 0, fill_delay_days: 0 },
    factor_risk: { market_var: 0, factor_var: 0, idiosyncratic_var: 0, factor_pct: 0 },
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
      pbo_validation:       { passed: false, value: 1, threshold: 0.4, detail: "" },
    },
    dsr: {
      observed_sharpe: 0, deflated_sharpe: 0, is_significant: false,
      n_trials: 0, skewness: 0, excess_kurtosis: 0,
      serial_correlation: 0, benchmark_sharpe: 0, detail: "",
    },
    pbo: { score: 1, n_partitions: 0, n_combinations: 0, passed: false, detail: "" },
    monte_carlo: {
      n_simulations: 0,
      bootstrap:          { test: "", observed_sharpe: 0, p_value: 1, sharpe_5pct: 0, sharpe_50pct: 0, sharpe_95pct: 0, significant: false },
      randomized_entry:   { test: "", observed_sharpe: 0, p_value: 1, sharpe_5pct: 0, sharpe_50pct: 0, sharpe_95pct: 0, significant: false },
      regime_permutation: { test: "", observed_sharpe: 0, p_value: 1, sharpe_5pct: 0, sharpe_50pct: 0, sharpe_95pct: 0, significant: false },
    },
  };
}

export async function getBacktestData(): Promise<BacktestArtifact> {
  const data = await getStaticArtifact<BacktestArtifact>("backtest.json");
  return data ?? {
    generated_at: "", run_id: "NONE",
    summary: {
      annualized_sharpe: 0, annualized_return: 0, max_drawdown: 0,
      hit_rate: 0, total_trades: 0, holding_period_days: 0,
      filing_lag_days: 0, fill_delay_days: 0, test_period: "",
    },
    walk_forward_folds: [],
    factor_attribution: {
      alpha_annualized: 0, alpha_t_stat: 0, market_beta: 0,
      smb: 0, hml: 0, rmw: 0, cma: 0, mom: 0, r_squared: 0, detail: "",
    },
    capacity: { estimated_capacity_usd: 0, adv_participation_limit_pct: 0, adv_cliff_at_aum_usd: 0, detail: "" },
    signal_decay: { half_life_days: 0, peak_ic: 0, detail: "" },
  };
}

export async function getMetadata(): Promise<MetadataArtifact | null> {
  return getStaticArtifact<MetadataArtifact>("metadata.json");
}
