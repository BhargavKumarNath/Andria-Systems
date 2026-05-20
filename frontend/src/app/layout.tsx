import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Andria Systems | Institutional Dashboard",
  description: "Quantitative Research Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <nav className="nav-bar">
          <Link href="/" className="nav-link">Signals & Regimes</Link>
          <Link href="/portfolio" className="nav-link">Portfolio</Link>
          <Link href="/validation" className="nav-link">Validation Gate</Link>
        </nav>
        <main className="container">
          {children}
        </main>
      </body>
    </html>
  );
}
