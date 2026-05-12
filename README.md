# Andria Systems

**Institutional Investor Intelligence Platform**

**In progress**

A quantitative research platform for analyzing SEC 13F institutional investor filings. Transforms 116M+ raw holdings records into behavioral archetypes, smart money signals, and regime-aware investment intelligence.

## Quick Start

```bash
# Install
pip install -e ".[dev]"

# Ingest data
andria ingest all

# Run pipeline
andria run phase1
andria run phase2

# Launch dashboard
andria serve

# Validate data
andria validate
```

## Architecture

See `andria/` for the full domain-driven package structure.
