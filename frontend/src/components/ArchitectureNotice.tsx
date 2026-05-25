import React from 'react';

export default function ArchitectureNotice() {
  return (
    <div style={{
      marginBottom: "2rem",
      padding: "1.5rem",
      border: "1px solid var(--accent-color, #ffb300)",
      borderRadius: "8px",
      backgroundColor: "rgba(255, 179, 0, 0.05)"
    }}>
      <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem", color: "var(--accent-color, #ffb300)" }}>
        ⚠️ System & Data Architecture Notice
      </h2>
      <div style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
        <p style={{ marginBottom: "0.75rem" }}>
          The online dashboard is a <strong>compressed, precomputed representation</strong> of the full research system.
        </p>
        <ul style={{ paddingLeft: "1.5rem", marginBottom: "1rem" }}>
          <li>It does NOT process raw 116M record datasets in real time.</li>
          <li>It does NOT execute clustering, backtesting, or regime modeling live in the browser.</li>
        </ul>
        <p style={{ marginBottom: "0.5rem" }}>
          <strong>Users who want full dataset-level analysis and complete pipeline execution must clone the repository and run the local CLI engine.</strong>
        </p>
        <p style={{ fontSize: "0.9rem" }}>
          Full dataset access, full pipeline execution (ETL, clustering, HMM, backtesting), and complete artifact regeneration must be performed locally via:
          <br/>
          <code style={{ 
            display: "block", 
            padding: "0.5rem", 
            marginTop: "0.5rem", 
            backgroundColor: "rgba(0,0,0,0.3)", 
            borderRadius: "4px",
            fontFamily: "monospace"
          }}>python run_pipeline.py</code>
        </p>
      </div>
    </div>
  );
}
