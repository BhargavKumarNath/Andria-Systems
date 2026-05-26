"use client";

import React, { useState, useEffect, useRef } from "react";

/* 1. Interactive RACS Formula */
export function InteractiveFormula() {
  const [hoveredTerm, setHoveredTerm] = useState<string | null>(null);

  const terms = [
    {
      id: "consensus",
      label: "consensus_weight",
      color: "#3b82f6",
      desc: "Fraction of reporting managers holding the security, weighted by AUM.",
      insight: "Captures breadth of institutional conviction. A stock held by 50 managers with $1B AUM each scores higher than one held by 500 managers with $10M each.",
    },
    {
      id: "activist",
      label: "log(activist_buyers + 1.1)",
      color: "#8a2be2",
      desc: "Log-scaled count of activist-identified buyers (13D/13G filers).",
      insight: "Logarithm dampens outlier clusters; +1.1 prevents log(0). Activists drive catalysts; following them provides a fundamental tailwind.",
    },
    {
      id: "crowding",
      label: "(1 - crowding_penalty)",
      color: "#f59e0b",
      desc: "Penalty based on holdings_concentration / max_concentration.",
      insight: "High crowding reduces RACS. Crowded trades face forced liquidation risk during redemptions. We want undiscovered conviction, not crowded consensus.",
    },
    {
      id: "regime",
      label: "(1 ± regime_weight x prob)",
      color: "#10b981",
      desc: "HMM state probability modulates RACS.",
      insight: "Goldilocks/Recovery amplify (+) scores; Rate Shock/Recession Fear dampen (-) them. Aligns stock selection with prevailing macro winds.",
    },
  ];

  const activeTermData = terms.find((t) => t.id === hoveredTerm);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Formula Area */}
      <div style={{
        padding: "1.5rem", borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
        display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "0.5rem",
        fontSize: "clamp(0.9rem, 1.5vw, 1.2rem)", fontFamily: "monospace", fontWeight: 700,
      }}>
        <span style={{ color: "var(--text-primary)" }}>RACS = </span>
        {terms.map((term, i) => (
          <React.Fragment key={term.id}>
            <span
              onMouseEnter={() => setHoveredTerm(term.id)}
              onMouseLeave={() => setHoveredTerm(null)}
              style={{
                padding: "0.4rem 0.6rem", borderRadius: 6, cursor: "pointer",
                color: term.color,
                backgroundColor: hoveredTerm === term.id ? `${term.color}22` : "transparent",
                border: `1px solid ${hoveredTerm === term.id ? term.color : "transparent"}`,
                transition: "all 0.2s ease",
              }}
            >
              {term.label}
            </span>
            {i < terms.length - 1 && <span style={{ color: "var(--text-muted)", padding: "0 0.2rem" }}>x</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Detail Area */}
      <div style={{
        minHeight: 120, padding: "1.25rem", borderRadius: 12,
        backgroundColor: activeTermData ? `${activeTermData.color}0a` : "rgba(255,255,255,0.01)",
        border: `1px solid ${activeTermData ? activeTermData.color + "44" : "rgba(255,255,255,0.04)"}`,
        transition: "all 0.3s ease",
      }}>
        {activeTermData ? (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: activeTermData.color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
              {activeTermData.label}
            </div>
            <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
              {activeTermData.desc}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {activeTermData.insight}
            </div>
          </div>
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.85rem", fontStyle: "italic" }}>
            Hover over any term in the formula above to see its mathematical definition and investment rationale.
          </div>
        )}
      </div>
    </div>
  );
}

/* 2. UMAP/HDBSCAN Animated Scatter */
export function UmapScatterSim() {
  const [mounted, setMounted] = useState(false);
  const [stage, setStage] = useState<0 | 1 | 2>(0); // 0: random, 1: UMAP, 2: HDBSCAN
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Generate stable random points
  const points = useRef(Array.from({ length: 400 }, (_, i) => {
    // 4 clusters + noise
    const c = i < 350 ? i % 4 : -1;
    const cx = c === 0 ? 0.2 : c === 1 ? 0.8 : c === 2 ? 0.2 : c === 3 ? 0.8 : 0.5;
    const cy = c === 0 ? 0.2 : c === 1 ? 0.2 : c === 2 ? 0.8 : c === 3 ? 0.8 : 0.5;
    const r1 = Math.random();
    const r2 = Math.random();

    return {
      id: i,
      cluster: c,
      // Initial random position
      start: { x: Math.random(), y: Math.random() },
      // UMAP separated position (still grey)
      umap: {
        x: c === -1 ? Math.random() : cx + (r1 - 0.5) * 0.25,
        y: c === -1 ? Math.random() : cy + (r2 - 0.5) * 0.25
      },
      // Target colors
      color: c === 0 ? "#3b82f6" : c === 1 ? "#10b981" : c === 2 ? "#f59e0b" : c === 3 ? "#8a2be2" : "#52525b",
      current: { x: Math.random(), y: Math.random() }
    };
  }));

  useEffect(() => {
    setMounted(true);
    let animationFrameId: number;
    let startTime: number;

    const render = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / 1500, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      points.current.forEach(p => {
        let targetX, targetY, color;

        if (stage === 0) {
          targetX = p.start.x; targetY = p.start.y; color = "#52525b";
        } else if (stage === 1) {
          targetX = p.umap.x; targetY = p.umap.y; color = "#52525b";
        } else {
          targetX = p.umap.x; targetY = p.umap.y; color = p.color;
        }

        // Interpolate position
        p.current.x = p.current.x + (targetX - p.current.x) * 0.1;
        p.current.y = p.current.y + (targetY - p.current.y) * 0.1;

        ctx.beginPath();
        ctx.arc(p.current.x * w, p.current.y * h, 3, 0, Math.PI * 2);
        ctx.fillStyle = stage === 2 ? color : "rgba(255,255,255,0.4)";
        ctx.fill();

        if (stage === 2 && p.cluster !== -1) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = color;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [stage]);

  // Auto-cycle stages
  useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(() => {
      setStage(s => (s + 1) % 3 as 0 | 1 | 2);
    }, 4000);
    return () => clearInterval(interval);
  }, [mounted]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
        {[
          { id: 0, label: "1. 14D Feature Space (Random)" },
          { id: 1, label: "2. UMAP Projection (2D)" },
          { id: 2, label: "3. HDBSCAN Density Clustering" }
        ].map(s => (
          <button
            key={s.id}
            onClick={() => setStage(s.id as 0 | 1 | 2)}
            style={{
              padding: "0.4rem 0.8rem", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600,
              backgroundColor: stage === s.id ? "rgba(138,43,226,0.2)" : "rgba(255,255,255,0.05)",
              color: stage === s.id ? "#c4b5fd" : "var(--text-secondary)",
              border: `1px solid ${stage === s.id ? "rgba(138,43,226,0.5)" : "transparent"}`,
              cursor: "pointer", transition: "all 0.3s ease"
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div style={{
        position: "relative", width: "100%", height: 300,
        borderRadius: 12, backgroundColor: "rgba(0,0,0,0.3)",
        border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden"
      }}>
        <canvas
          ref={canvasRef}
          width={800} height={600}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />

        {/* Archetype Labels (only show in stage 2) */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          opacity: stage === 2 ? 1 : 0, transition: "opacity 1s ease"
        }}>
          <div style={{ position: "absolute", top: "15%", left: "15%", color: "#3b82f6", fontSize: "0.7rem", fontWeight: 700 }}>Conviction Activists</div>
          <div style={{ position: "absolute", top: "15%", right: "15%", color: "#10b981", fontSize: "0.7rem", fontWeight: 700 }}>Index Huggers</div>
          <div style={{ position: "absolute", bottom: "15%", left: "15%", color: "#f59e0b", fontSize: "0.7rem", fontWeight: 700 }}>Macro Tourists</div>
          <div style={{ position: "absolute", bottom: "15%", right: "15%", color: "#8a2be2", fontSize: "0.7rem", fontWeight: 700 }}>Nimble Traders</div>
        </div>
      </div>

      <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", textAlign: "center", margin: 0 }}>
        {stage === 0 && "Managers exist in a high-dimensional space defined by 14 behavioural features (turnover, concentration, etc)."}
        {stage === 1 && "UMAP preserves local manifold structure, projecting 14D vectors into a visually interpretable 2D plane."}
        {stage === 2 && "HDBSCAN extracts variable-density clusters without a fixed 'k'. Unclustered points are explicitly labelled as Noise."}
      </p>
    </div>
  );
}

/* 3. HMM Regime Transition Matrix & Visuals */
export function HmmVisuals() {
  const [activeRegime, setActiveRegime] = useState<number | null>(null);

  const regimes = [
    { id: 0, name: "Goldilocks", color: "#10b981", desc: "Low VIX, steep yield curve, tight spreads. Risk-on. RACS amplified +15%." },
    { id: 1, name: "Recovery", color: "#3b82f6", desc: "VIX normalising, curve re-steepening. Selective risk-on. RACS amplified +8%." },
    { id: 2, name: "Rate Shock", color: "#f59e0b", desc: "Fed hiking, curve flattening/inverting. Duration risk. RACS dampened −12%." },
    { id: 3, name: "Recession Fear", color: "#ef4444", desc: "Elevated VIX, credit spreads blowing out. Defensive. RACS dampened −20%." },
  ];

  // Hardcoded illustrative transition matrix
  const tMatrix = [
    [0.85, 0.10, 0.04, 0.01],
    [0.15, 0.75, 0.08, 0.02],
    [0.02, 0.08, 0.70, 0.20],
    [0.05, 0.25, 0.10, 0.60]
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
      {/* Regime Definitions */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
          Hidden States (Emission Means)
        </div>
        {regimes.map((r, i) => (
          <div
            key={r.name}
            onMouseEnter={() => setActiveRegime(i)}
            onMouseLeave={() => setActiveRegime(null)}
            style={{
              padding: "0.85rem", borderRadius: 8,
              backgroundColor: activeRegime === i ? `${r.color}15` : "rgba(255,255,255,0.02)",
              border: `1px solid ${activeRegime === i ? r.color : "rgba(255,255,255,0.06)"}`,
              cursor: "pointer", transition: "all 0.2s ease"
            }}
          >
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: r.color, marginBottom: "0.35rem" }}>{r.name}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{r.desc}</div>
          </div>
        ))}
      </div>

      {/* Transition Matrix Heatmap */}
      <div>
        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1.25rem" }}>
          Transition Probability Matrix
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "80px repeat(4, 1fr)", gap: "0.2rem" }}>
          <div /> {/* Empty top-left cell */}
          {regimes.map(r => (
            <div key={`col-${r.name}`} style={{ fontSize: "0.55rem", color: "var(--text-muted)", textAlign: "center", alignSelf: "end", paddingBottom: "0.4rem" }}>
              TO {r.name.split(" ")[0]}
            </div>
          ))}

          {tMatrix.map((row, i) => (
            <React.Fragment key={`row-${i}`}>
              <div style={{ fontSize: "0.55rem", color: "var(--text-muted)", textAlign: "right", paddingRight: "0.5rem", alignSelf: "center" }}>
                FROM {regimes[i].name.split(" ")[0]}
              </div>
              {row.map((val, j) => {
                const isActive = activeRegime === i;
                const isTarget = activeRegime === j;
                const intensity = val;
                return (
                  <div key={`cell-${i}-${j}`} style={{
                    aspectRatio: "1/1",
                    backgroundColor: `rgba(138,43,226, ${intensity * 0.8 + 0.05})`,
                    border: `1px solid ${isActive || isTarget ? "#c4b5fd" : "transparent"}`,
                    borderRadius: 4,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.7rem", fontWeight: val > 0.5 ? 700 : 400,
                    color: val > 0.5 ? "#fff" : "rgba(255,255,255,0.6)",
                    transition: "all 0.2s ease",
                    transform: isActive && j === i ? "scale(1.05)" : "scale(1)",
                    zIndex: isActive && j === i ? 10 : 1
                  }}>
                    {(val * 100).toFixed(0)}%
                  </div>
                )
              })}
            </React.Fragment>
          ))}
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "1rem", lineHeight: 1.6 }}>
          The matrix shows the learned probability of transitioning from one state to another. Note the high persistence (diagonal) typical of macroeconomic regimes.
        </p>
      </div>
    </div>
  );
}

/* 4. Evaluation Gate Hover Cards */
export function ValidationCards() {
  const cards = [
    {
      title: "1. Deflated Sharpe Ratio",
      short: "Adjusts for multiple testing & non-normality.",
      formula: "DSR = SR_obs / √(1 + penalty) × √(T)",
      detail: "Penalises the observed Sharpe for the number of configs tested (multiple testing bias), skewness, excess kurtosis, and serial autocorrelation. DSR > 1.0 required.",
      color: "#10b981", icon: "📉"
    },
    {
      title: "2. Probability of Backtest Overfitting",
      short: "Combinatorially Symmetric Cross-Validation.",
      formula: "PBO = P(rank(OOS_opt) < 0.5 | IS_opt)",
      detail: "Splits data into 16 partitions (12,870 combinations). Calculates fraction of splits where the in-sample optimal strategy underperforms out-of-sample. PBO < 40% required.",
      color: "#3b82f6", icon: "📊"
    },
    {
      title: "3. Monte Carlo: Bootstrap",
      short: "Resamples returns with replacement 1000x.",
      formula: "H0: SR_obs ∈ Null Distribution",
      detail: "If observed Sharpe falls in the top 5% of the null distribution (p < 0.05), the signal's performance is not attributable to lucky draws of positive return days.",
      color: "#f59e0b", icon: "🔄"
    },
    {
      title: "4. Monte Carlo: Regime Permutation",
      short: "Randomises HMM labels 1000x.",
      formula: "H0: Regime conditioning adds no value",
      detail: "Shuffles regime labels while keeping returns fixed. Tests whether the regime-conditioning multiplier adds genuine alpha or is merely a post-hoc rationalisation.",
      color: "#8a2be2", icon: "🌀"
    }
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
      {cards.map(c => (
        <div key={c.title} style={{
          padding: "1.25rem", borderRadius: 12,
          backgroundColor: `${c.color}08`, border: `1px solid ${c.color}30`,
          display: "flex", flexDirection: "column", gap: "0.75rem",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
          cursor: "default",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 4px 20px ${c.color}20`; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.2rem" }}>{c.icon}</span>
            <span style={{ fontSize: "0.9rem", fontWeight: 700, color: c.color }}>{c.title}</span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", fontWeight: 600 }}>{c.short}</div>
          <div style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "#c4b5fd", padding: "0.4rem 0.6rem", backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 4 }}>
            {c.formula}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>{c.detail}</p>
        </div>
      ))}
    </div>
  );
}

/* 5. Citations Carousel */
export function CitationsCarousel() {
  const citations = [
    { authors: "Bailey, Borwein, Lopez de Prado & Zhu", year: "2016", title: "The Probability of Backtest Overfitting", venue: "Journal of Computational Finance" },
    { authors: "Bailey & Lopez de Prado", year: "2014", title: "The Deflated Sharpe Ratio: Correcting for Selection Bias...", venue: "Journal of Portfolio Management" },
    { authors: "McInnes, Healy, & Melville", year: "2018", title: "UMAP: Uniform Manifold Approximation and Projection", venue: "arXiv:1802.03426" },
    { authors: "Campello, Moulavi, & Sander", year: "2013", title: "Density-Based Clustering Based on Hierarchical Density Estimates", venue: "PAKDD 2013" },
    { authors: "Fama & French", year: "2015", title: "A Five-Factor Asset Pricing Model", venue: "Journal of Financial Economics" },
  ];

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
      {citations.map((c, i) => (
        <div key={i} style={{
          flex: "1 1 300px",
          padding: "1rem", borderRadius: 8,
          backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
          borderLeft: "3px solid rgba(138,43,226,0.5)"
        }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.4rem" }}>{c.title}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{c.authors} ({c.year})</div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontStyle: "italic", marginTop: "0.2rem" }}>{c.venue}</div>
        </div>
      ))}
    </div>
  );
}
