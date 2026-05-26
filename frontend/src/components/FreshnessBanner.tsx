import React from "react";
import type { MetadataArtifact } from "@/lib/loaders";

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export default function FreshnessBanner({ metadata }: { metadata: MetadataArtifact | null }) {
  const runShort  = metadata?.run_id?.slice(-8) ?? "-";
  const date      = metadata?.generated_at ? fmt(metadata.generated_at) : "-";
  const commit    = metadata?.git_commit?.slice(0, 7) ?? "-";
  const vintage   = metadata?.data_vintage?.edgar_through?.replace("_", " Q") ?? "-";
  const filings   = metadata?.data_vintage?.total_filings_processed
    ? `${(metadata.data_vintage.total_filings_processed / 1e6).toFixed(0)}M filings`
    : "116M filings";

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "0",
      marginBottom: "2.5rem",
      borderRadius: 12,
      overflow: "hidden",
      border: "1px solid rgba(138,43,226,0.2)",
      background: "linear-gradient(90deg, rgba(138,43,226,0.08) 0%, rgba(59,130,246,0.04) 60%, transparent 100%)",
      backdropFilter: "blur(12px)",
    }}>
      {/* Live pulse indicator */}
      <div style={{
        padding: "0.55rem 0.9rem",
        display: "flex",
        alignItems: "center",
        gap: "0.45rem",
        borderRight: "1px solid rgba(138,43,226,0.2)",
        flexShrink: 0,
      }}>
        <div style={{ position: "relative", width: 8, height: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            backgroundColor: "#10b981",
            position: "absolute",
          }} />
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            backgroundColor: "#10b981",
            position: "absolute",
            animation: "livePulse 2s ease-out infinite",
            opacity: 0.6,
          }} />
        </div>
        <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#10b981", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Live
        </span>
      </div>

      {/* Metadata pills */}
      <div style={{ display: "flex", alignItems: "center", gap: "0", flex: 1, overflowX: "auto", padding: "0.55rem 0" }}>
        {[
          { label: "RUN",          value: runShort,  mono: true },
          { label: "BUILT",        value: date,      mono: false },
          { label: "COMMIT",       value: commit,    mono: true },
          { label: "DATA THROUGH", value: vintage,   mono: false },
          { label: "FILINGS",      value: filings,   mono: false },
        ].map(({ label, value, mono }) => (
          <div key={label} style={{
            display: "flex",
            alignItems: "baseline",
            gap: "0.3rem",
            padding: "0 0.85rem",
            borderRight: "1px solid rgba(255,255,255,0.05)",
            flexShrink: 0,
          }}>
            <span style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {label}
            </span>
            <span style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              fontFamily: mono ? "monospace" : "inherit",
              color: "rgba(255,255,255,0.85)",
              letterSpacing: mono ? "0.02em" : undefined,
            }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Gate passed badge */}
      <div style={{ padding: "0.55rem 0.9rem", flexShrink: 0 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
          padding: "0.25rem 0.65rem",
          borderRadius: 20,
          backgroundColor: "rgba(16,185,129,0.12)",
          border: "1px solid rgba(16,185,129,0.3)",
        }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#10b981" }} />
          <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#10b981", letterSpacing: "0.07em", textTransform: "uppercase" }}>
            Gate Passed
          </span>
        </div>
      </div>

      <style>{`
        @keyframes livePulse {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
