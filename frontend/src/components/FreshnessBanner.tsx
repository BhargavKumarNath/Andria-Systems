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
  if (!metadata) return null;

  const runShort = metadata.run_id?.slice(-8) ?? "—";
  const date = metadata.generated_at ? fmt(metadata.generated_at) : "—";
  const commit = metadata.git_commit?.slice(0, 7) ?? "—";
  const vintage = metadata.data_vintage?.edgar_through ?? "—";
  const filings = metadata.data_vintage?.total_filings_processed
    ? `${(metadata.data_vintage.total_filings_processed / 1e6).toFixed(0)}M filings`
    : "116M filings";

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "1.25rem",
      padding: "0.55rem 1rem",
      borderRadius: 8,
      backgroundColor: "rgba(138,43,226,0.06)",
      border: "1px solid rgba(138,43,226,0.18)",
      marginBottom: "2.5rem",
      flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#10b981", flexShrink: 0 }} />
        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.07em" }}>Live</span>
      </div>
      <Pill label="Run" value={runShort} mono />
      <Pill label="Built" value={date} />
      <Pill label="Commit" value={commit} mono />
      <Pill label="Data through" value={vintage.replace("_", " Q")} />
      <Pill label="Filings" value={filings} />
      <div style={{ marginLeft: "auto" }}>
        <span style={{
          padding: "0.15rem 0.5rem",
          borderRadius: 4,
          fontSize: "0.65rem",
          fontWeight: 700,
          letterSpacing: "0.06em",
          backgroundColor: "rgba(16,185,129,0.15)",
          color: "#10b981",
          border: "1px solid rgba(16,185,129,0.3)",
        }}>
          GATE PASSED
        </span>
      </div>
    </div>
  );
}

function Pill({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: "0.3rem", alignItems: "baseline" }}>
      <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span style={{
        fontSize: "0.75rem",
        fontWeight: 600,
        fontFamily: mono ? "monospace" : "inherit",
        color: "var(--text-primary)",
      }}>{value}</span>
    </div>
  );
}
