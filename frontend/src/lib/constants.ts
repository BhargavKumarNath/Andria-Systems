/**
 * Global System Constants & Animation Tokens
 */

export const ANIMATION_DURATIONS = {
  FAST: 200,   // Micro-interactions, hovers
  MEDIUM: 400, // Page transitions
  SLOW: 700,   // Hero entries, layout shifts
} as const;

export const ANIMATION_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

export const Z_INDEX = {
  BASE: 1,
  CARD: 10,
  NAVBAR: 50,
  MODAL: 100,
} as const;

export const ROUTES = [
  { path: "/overview", label: "Overview" },
  { path: "/dna", label: "Manager DNA" },
  { path: "/regime", label: "Macro Regime" },
  { path: "/signals", label: "Alpha Signals" },
  { path: "/portfolio", label: "Portfolio" },
  { path: "/validation", label: "Validation Gate" },
  { path: "/architecture", label: "Architecture" },
  { path: "/methodology", label: "Methodology" },
] as const;
