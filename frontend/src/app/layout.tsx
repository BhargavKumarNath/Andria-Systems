import React from "react";
import Sidebar from "@/components/Sidebar";
import { getMetadata } from "@/lib/loaders";
import "./globals.css";

export const metadata = {
  title: { default: "Andria Systems", template: "%s | Andria Systems" },
  description: "Quantitative research platform — 116M SEC 13F filings, RACS signal generation, HMM regime detection, and institutional-grade research validation.",
};

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
