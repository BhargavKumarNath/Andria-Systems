# Phase 0: Foundation

## Infrastructure Overview
The project is built on a high-performance Python stack utilizing **DuckDB** for out-of-core SQL execution and **Polars** for vectorized data manipulation. This allows the system to process over 116 million raw EDGAR rows on a standard 16GB RAM laptop.

## Data Sources
- **EDGAR (13F filings):** Institutional holdings from over 14,000 managers. Preprocessed into a unified Parquet format.
- **FRED:** Macroeconomic indicators (VIX, Yield Spreads, Fed Funds).
- **OFR:** Financial Stress Index data.

## Quality & Verification
- **Sampling Strategy:** Time-based and value-based filters are applied to prevent temporal leakage and ensure focus on institutional-grade assets.
- **Verification Layer:** A dedicated summary verification step detects drift and cross-checks aggregate statistics against raw computations to prevent silent preprocessing errors.
