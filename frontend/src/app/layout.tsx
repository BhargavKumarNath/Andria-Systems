import React from "react";
import Sidebar from "@/components/Sidebar";
import FreshnessBanner from "@/components/FreshnessBanner";
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
          <Sidebar />
          <main className="content-area">
            <FreshnessBanner metadata={meta} />
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
