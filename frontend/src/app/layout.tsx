import React from "react";
import Sidebar from "@/components/Sidebar";
import { getMetadata } from "@/lib/loaders";
import { getDashboardFacts } from "@/lib/facts";
import "./globals.css";

export async function generateMetadata() {
  const facts = await getDashboardFacts();
  return {
    title: { default: "Andria Systems", template: "%s | Andria Systems" },
    description: `Quantitative research platform: ${facts.filingsRowsShort} SEC 13F filing rows, RACS signal generation, HMM regime detection, and an evaluation gate that ${facts.gatePassed ? "passed" : "rejected"} the latest real run.`,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const meta = await getMetadata();

  return (
    <html lang="en">
      <body>
        <div className="main-layout">
          <Sidebar
            runId={meta?.run_id?.slice(-8)}
            gitCommit={meta?.git_commit?.slice(0, 7)}
            builtAt={meta?.generated_at ?? undefined}
          />
          <main className="content-area">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
