"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES } from "@/lib/constants";
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  return (
    <html lang="en">
      <body>
        <div className="main-layout">
          <nav className="sidebar">
            <div className="sidebar-title">Andria Systems</div>
            {ROUTES.map((route) => (
              <Link 
                key={route.path}
                href={route.path}
                className={`nav-link ${pathname === route.path ? "active" : ""}`}
              >
                {route.label}
              </Link>
            ))}
          </nav>
          <main className="content-area">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
