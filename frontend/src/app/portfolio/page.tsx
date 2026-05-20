import React from "react";
import { getPortfolio } from "@/lib/api";
import PortfolioChart from "@/components/PortfolioChart";

export default async function PortfolioPage() {
  // Fetch data securely on the server
  let portfolioData = null;
  let error = null;

  try {
    portfolioData = await getPortfolio();
  } catch (err: any) {
    error = err.message;
  }

  // Mock historical data for the chart demonstration
  const historicalEquity = [
    { date: "2023-01", equity: 100 },
    { date: "2023-04", equity: 105 },
    { date: "2023-07", equity: 102 },
    { date: "2023-10", equity: 108 },
    { date: "2024-01", equity: 115 },
  ];

  return (
    <div className="panel">
      <h1 className="header">Portfolio Diagnostics</h1>
      
      {error ? (
        <div className="badge badge-danger">Error: {error}</div>
      ) : (
        <>
          <div className="metric-grid" style={{ marginBottom: "2rem" }}>
            <div className="metric-card">
              <div style={{ color: "var(--text-secondary)" }}>Gross Exposure</div>
              <div className="metric-value">{portfolioData?.portfolio?.gross_exposure?.toFixed(2) || "0.00"}</div>
            </div>
            <div className="metric-card">
              <div style={{ color: "var(--text-secondary)" }}>Net Exposure</div>
              <div className="metric-value">{portfolioData?.portfolio?.net_exposure?.toFixed(2) || "0.00"}</div>
            </div>
            <div className="metric-card">
              <div style={{ color: "var(--text-secondary)" }}>Turnover</div>
              <div className="metric-value">{portfolioData?.portfolio?.estimated_turnover?.toFixed(2) || "0.00"}</div>
            </div>
            <div className="metric-card">
              <div style={{ color: "var(--text-secondary)" }}>Cash Drag</div>
              <div className="metric-value">{portfolioData?.portfolio?.cash_drag?.toFixed(2) || "0.00"}</div>
            </div>
          </div>

          <h2 className="header" style={{ fontSize: "1.2rem" }}>Historical Equity Curve</h2>
          <PortfolioChart data={historicalEquity} />
          
          <div style={{ marginTop: "2rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            Run ID: {portfolioData?.run_id} | Timestamp: {portfolioData?.experiment_timestamp}
          </div>
        </>
      )}
    </div>
  );
}
