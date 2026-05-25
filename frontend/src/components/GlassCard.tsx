import React from "react";
import "./GlassCard.css";

interface GlassCardProps {
  hierarchy: "primary" | "secondary" | "tertiary";
  children: React.ReactNode;
  delayIndex?: number;
  className?: string;
}

export default function GlassCard({ hierarchy, children, delayIndex = 0, className = "" }: GlassCardProps) {
  const style = {
    "--stagger-index": delayIndex,
  } as React.CSSProperties;

  return (
    <div className={`glass-card hierarchy-${hierarchy} stagger-entry ${className}`} style={style}>
      {children}
    </div>
  );
}
