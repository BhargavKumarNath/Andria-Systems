# Phase 1: Manager DNA Engine

## Overview
The Manager DNA Engine processes 116M+ rows of 13F EDGAR holdings to distill the behavioral traits of 14,900 institutional managers into distinct archetypes. 

## Features & Clustering
We use a 14-dimensional feature space covering metrics like concentration (HHI), turnover, herding behavior, put/call asymmetry, and macro sensitivity. We map this 14D space down using UMAP and cluster managers using **HDBSCAN**.

## Identified Archetypes

1. **Conviction Activists (High HHI, Mid AUM):**
   - *Profile:* Highly concentrated portfolios (top 5 holdings > 60%). e.g., Pershing Square, Elliott.
   - *Alpha:* High idiosyncratic risk, strong signal generators. This is our primary target for the RACS signal.

2. **Index Huggers (Low HHI, Massive AUM):**
   - *Profile:* Highly diversified, mimics the S&P 500 or Russell 2000. e.g., Vanguard, BlackRock.
   - *Alpha:* Zero signal. We filter these out completely.

3. **Macro Tourists (High Put Ratio, High Turnover):**
   - *Profile:* Heavy derivatives use, tail-risk hedgers. e.g., Universa.
   - *Alpha:* Signal valuable only during 'Recession Fear' regimes.

4. **Quant Clones (Mid HHI, High Turnover):**
   - *Profile:* Statistical arbitrage, factor followers. e.g., Renaissance, Two Sigma.
   - *Alpha:* High crowding risk. Strong fade signals.

5. **Defensive Allocators (Mid HHI, Low Put):**
   - *Profile:* Long-only, buy-and-hold sector specialists (Utilities, Staples).

## Manager Distribution
| Archetype | Manager Count |
| :--- | :--- |
| Index Huggers | 7,980 |
| Noise | 4,146 |
| Conviction Activists | 211 |

![Manager DNA Archetypes UMAP](file:///c:/Project/hedge%20funds/reports/phase1/archetypes_umap.png)

## Visualizations
- Interactive 3D Cluster Map:  
  [Open 3D Viewer](reports/phase1/01_manager_clusters_3d.html)

- Interactive HHI Distribution:  
  [Open 3D Viewer](reports/phase1/02_cluster_hhi_distribution.html)

