/**
 * Global System Identity & Taxonomy
 * 
 * Enforces a strict unified vocabulary across the "Quant Intelligence OS".
 * Do NOT use alternative terms like "Categories" or "Hedge Funds" in the UI.
 */

export const TAXONOMY = {
  INSTITUTIONS: "Managers", // Not "Hedge Funds"
  CLUSTERS: "Archetypes",   // Not "Categories"
  SCORES: "Conviction Score", // Not "Raw Score"
  ENVIRONMENT: "Macro Regime", // Not "Market State"
  SIGNALS: "Active Signals",
} as const;
