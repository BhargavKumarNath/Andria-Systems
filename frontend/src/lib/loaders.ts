import "server-only";
import fs from "fs";
import path from "path";

/**
 * Core Data Loader Layer
 * Strictly encapsulates all direct file system access for static artifacts.
 * No components should bypass this file to fetch data.
 */

async function getStaticArtifact<T>(filename: string): Promise<T | null> {
  const filePath = path.join(process.cwd(), "public", "data", filename);
  try {
    const fileContents = fs.readFileSync(filePath, "utf8");
    return JSON.parse(fileContents) as T;
  } catch (error) {
    console.warn(`[Data Loader] Missing artifact: ${filename}. Using fallback.`);
    return null;
  }
}

export async function getSignalsData() {
  const data = await getStaticArtifact<any>("signals.json");
  return data || { signals: [], run_id: "NONE", provenance_quality: 0, validation_passed: false };
}

export async function getRegimeData() {
  const data = await getStaticArtifact<any>("regimes.json");
  return data || { regime: { current_regime: "Static Precompute Missing", transition_probability: 0 } };
}

export async function getPortfolioMetrics() {
  const data = await getStaticArtifact<any>("portfolio.json");
  return data || { 
    portfolio: { gross_exposure: 0, net_exposure: 0, estimated_turnover: 0, cash_drag: 0 },
    run_id: "NONE", 
    experiment_timestamp: "Never" 
  };
}

export async function getDNAClusters() {
  const data = await getStaticArtifact<any>("clusters.json");
  return data || { archetypes: [] };
}
