"use client";

import React from "react";
import "./ChartContainer.css";

interface ChartContainerProps {
  title?: string;
  children: React.ReactNode;
  height?: number;
}

export default function ChartContainer({ title, children, height = 300 }: ChartContainerProps) {
  return (
    <div className="chart-container">
      {title && <h3 className="chart-title">{title}</h3>}
      <div className="chart-wrapper" style={{ height }}>
        {children}
      </div>
    </div>
  );
}
