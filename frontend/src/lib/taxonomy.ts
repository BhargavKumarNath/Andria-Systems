/**
 * Global System Identity & Taxonomy
 * 
 * Enforces a strict unified vocabulary across the "Quant Intelligence OS".
 * Do NOT use alternative terms like "Categories" or "Hedge Funds" in the UI.
 */

export const TAXONOMY = {
  INSTITUTIONS: "Managers",
  CLUSTERS: "Archetypes",
  SCORES: "Conviction Score",
  ENVIRONMENT: "Macro Regime",
  SIGNALS: "Active Signals",
} as const;

/** HMM regime label → display color */
export const REGIME_COLORS: Record<string, string> = {
  Goldilocks:     "#10b981",
  Recovery:       "#3b82f6",
  Rate_Shock:     "#f59e0b",
  Recession_Fear: "#ef4444",
};

/** HDBSCAN archetype → display color */
export const ARCHETYPE_COLORS: Record<string, string> = {
  "Conviction Activists": "#8a2be2",
  "Index Huggers":        "#3b82f6",
  "Macro Tourists":       "#f59e0b",
  "Nimble Traders":       "#10b981",
  "Noise":                "#4b5563",
};

/** Human-readable regime label */
export const REGIME_LABELS: Record<string, string> = {
  Goldilocks:     "Goldilocks",
  Recovery:       "Recovery",
  Rate_Shock:     "Rate Shock",
  Recession_Fear: "Recession Fear",
};

/** One-line archetype definition, matching the cosine-similarity prototype each
 * archetype is labelled against in andria/models/clustering/engine.py. */
export const ARCHETYPE_SHORT_DESC: Record<string, string> = {
  "Conviction Activists": "High HHI, low put ratio, low turnover, long holding duration.",
  "Index Huggers": "Low HHI, high AUM, low conviction delta, high quarters active.",
  "Macro Tourists": "High put ratio, high turnover, high options notional.",
  "Nimble Traders": "Low AUM, high turnover, high new position rate, high exit rate.",
  "Noise": "No dense neighborhood under HDBSCAN — no stable behavioural profile.",
};
