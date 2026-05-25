"use client";

import React, { useEffect, useRef, useState } from "react";
import "./RevealContainer.css";

interface RevealContainerProps {
  children: React.ReactNode;
  threshold?: number;
}

export default function RevealContainer({ children, threshold = 0.15 }: RevealContainerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div ref={ref} className={`reveal-container ${isVisible ? "is-visible" : ""}`}>
      {children}
    </div>
  );
}
