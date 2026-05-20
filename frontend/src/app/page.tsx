import React from "react";
import { getSignals, getRegimes } from "@/lib/api";

export default async function SignalsPage() {
  let signalsData = null;
  let regimesData = null;
  let error = null;

  try {
    [signalsData, regimesData] = await Promise.all([
      getSignals(),
      getRegimes()
    ]);
  } catch (err: any) {
    error = err.message;
  }

  return (
    <>
      {error && <div className="badge badge-danger" style={{ marginBottom: "1rem" }}>Error: {error}</div>}
      
      <div className="panel">
        <h1 className="header">Macro Regime State</h1>
        <div className="metric-grid">
          <div className="metric-card">
            <div style={{ color: "var(--text-secondary)" }}>Current Regime</div>
            <div className="metric-value" style={{ textTransform: "capitalize" }}>
              {regimesData?.regime?.current_regime || "Unknown"}
            </div>
          </div>
          <div className="metric-card">
            <div style={{ color: "var(--text-secondary)" }}>Transition Probability</div>
            <div className="metric-value">
              {(regimesData?.regime?.transition_probability * 100)?.toFixed(1) || "0.0"}%
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h1 className="header">Active Alpha Signals</h1>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>
                <th style={{ padding: "0.5rem" }}>Ticker</th>
                <th style={{ padding: "0.5rem" }}>Conviction Score</th>
                <th style={{ padding: "0.5rem" }}>Target Weight</th>
              </tr>
            </thead>
            <tbody>
              {signalsData?.signals?.map((signal: any) => (
                <tr key={signal.ticker} style={{ borderBottom: "1px solid #222" }}>
                  <td style={{ padding: "0.5rem", fontWeight: "600" }}>{signal.ticker}</td>
                  <td style={{ padding: "0.5rem" }}>{signal.conviction_score.toFixed(3)}</td>
                  <td style={{ padding: "0.5rem", color: "var(--accent-color)" }}>
                    {(signal.target_weight * 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
              {!signalsData?.signals?.length && (
                <tr>
                  <td colSpan={3} style={{ padding: "1rem", color: "var(--text-secondary)", textAlign: "center" }}>
                    No active signals found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div style={{ marginTop: "1.5rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            Run ID: {signalsData?.run_id} | Provenance Quality: {(signalsData?.provenance_quality * 100)?.toFixed(1)}%
        </div>
      </div>
    </>
  );
}
