import React from "react";

export default function ArchitectureNotice() {
  return (
    <div style={{
      padding: "1.5rem",
      border: "1px solid rgba(138, 43, 226, 0.4)",
      borderRadius: "12px",
      backgroundColor: "rgba(138, 43, 226, 0.05)",
    }}>
      <div style={{ fontWeight: 600, marginBottom: "0.75rem", color: "var(--text-primary)" }}>
        Pre-Computed Intelligence Layer
      </div>
      <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "0.75rem", fontSize: "0.9rem" }}>
        This dashboard serves synthesised artifacts computed from 116M SEC 13F filings.
        Raw data processing, clustering, HMM fitting, and backtesting run locally via the
        full pipeline engine, following the same architecture separation used by institutional platforms.
      </p>
      <div style={{
        backgroundColor: "rgba(0,0,0,0.4)",
        borderRadius: "8px",
        padding: "0.75rem 1rem",
        fontFamily: "monospace",
        fontSize: "0.85rem",
        color: "#a5f3fc",
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        git clone …/andria-systems &nbsp;&amp;&amp;&nbsp; pip install -e .[dev] &nbsp;&amp;&amp;&nbsp; andria run
      </div>
    </div>
  );
}
