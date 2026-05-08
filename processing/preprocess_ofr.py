#!/usr/bin/env python3
"""
OFR Preprocessing Script
========================
Combines all 502 JSON files from 4 subcategories (FICC, FPF, SCOOS, TFF)
into a single Parquet file.

ZERO DATA LOSS DESIGN:
- DuckDB reads JSON natively, then casts all values to VARCHAR before export.
- This preserves exact textual representation of dates and numbers.
- Dataset subcategory, series metadata, and source file paths preserved.
- Observations unnested from [date, value] arrays to rows.
"""

import duckdb
import sys
from pathlib import Path
from datetime import datetime

# CONFIGURATION
RAW_PATH = Path("data/raw/ofr")
OUTPUT_PATH = Path("data/processed")
OUTPUT_FILE = OUTPUT_PATH / "OFR_preprocess.parquet"


def validate_environment():
    if not RAW_PATH.exists():
        print(f"ERROR: Raw data path not found: {RAW_PATH.resolve()}")
        sys.exit(1)
    OUTPUT_PATH.mkdir(parents=True, exist_ok=True)


def main():
    validate_environment()
    
    con = duckdb.connect()
    con.execute("SET enable_progress_bar = true;")
    
    print(f"[{datetime.now()}] === OFR Preprocessing Started ===")
    
    # Discover all JSON files recursively
    json_files = list(RAW_PATH.rglob("*.json"))
    print(f"Found {len(json_files)} JSON files")
    
    if not json_files:
        print("ERROR: No JSON files found.")
        sys.exit(1)
    
    # Count by subcategory for logging
    for subdir in sorted(set(f.parent.name for f in json_files)):
        count = sum(1 for f in json_files if f.parent.name == subdir)
        print(f"  -> {subdir}: {count} files")
    
    # 1. Read all JSON files into DuckDB
    print(f"[{datetime.now()}] Reading JSON files with DuckDB...")
    
    # Use recursive glob: data/raw/ofr/**/*.json
    pattern = str(RAW_PATH / "**" / "*.json")
    
    con.execute(f"""
        CREATE OR REPLACE TABLE ofr_raw AS
        SELECT 
            *,
            split_part(replace(filename, '\\', '/'), '/', -2) AS subcategory,
            split_part(replace(filename, '\\', '/'), '/', -1) AS source_filename,
            filename AS source_file
        FROM read_json_auto('{pattern}',
            format = 'auto',
            maximum_object_size = 16777216,
            filename = true
        )
    """)
    
    series_count = con.execute("SELECT COUNT(*) FROM ofr_raw").fetchone()[0]
    print(f"  -> Loaded {series_count} series records")
    
    # 2. Unnest observations and cast to VARCHAR for zero data loss
    print(f"[{datetime.now()}] Unnesting observations...")
    
    con.execute("""
        CREATE OR REPLACE TABLE ofr_combined AS
        SELECT
            -- Metadata (preserve all fields from JSON)
            mnemonic,
            series_name,
            dataset,
            pulled_at,
            CAST(n_obs AS VARCHAR) AS n_obs,
            
            -- Observation data
            CAST(obs[1] AS VARCHAR) AS observation_date,
            CAST(obs[2] AS VARCHAR) AS value,
            
            -- Parsed date (NULL if unparseable)
            TRY_STRPTIME(CAST(obs[1] AS VARCHAR), '%Y-%m-%d')::DATE 
                AS observation_date_parsed,
            
            -- Provenance
            subcategory,
            source_filename,
            source_file
            
        FROM ofr_raw,
        LATERAL unnest(observations) AS t(obs)
    """)
    
    obs_count = con.execute("SELECT COUNT(*) FROM ofr_combined").fetchone()[0]
    print(f"  -> Unnested {obs_count:,} observations")
    
    # 3. Validation
    # Ensure no observations were lost during unnest
    expected_obs = con.execute("""
        SELECT COALESCE(SUM(n_obs::BIGINT), 0) FROM ofr_raw
    """).fetchone()[0]
    
    print(f"\nValidation:")
    print(f"  Expected observations (sum of n_obs): {expected_obs:,}")
    print(f"  Actual observations in output:        {obs_count:,}")
    
    if obs_count != expected_obs:
        print(f"  WARNING: Observation count mismatch!")
    
    # 4. Export to Parquet
    print(f"[{datetime.now()}] Exporting to Parquet...")
    
    con.execute(f"""
        COPY ofr_combined TO '{OUTPUT_FILE}'
        (FORMAT PARQUET, COMPRESSION 'ZSTD', ROW_GROUP_SIZE 100000)
    """)
    
    file_size_mb = OUTPUT_FILE.stat().st_size / (1024 * 1024)
    print(f"  -> Exported: {OUTPUT_FILE}")
    print(f"  -> File size: {file_size_mb:.1f} MB")
    
    # 5. Summary
    print(f"\n[{datetime.now()}] === Summary ===")
    print(f"Subcategories: {con.execute('SELECT COUNT(DISTINCT subcategory) FROM ofr_combined').fetchone()[0]}")
    print(f"Series:        {con.execute('SELECT COUNT(DISTINCT mnemonic) FROM ofr_combined').fetchone()[0]}")
    print(f"Date range:    {con.execute('SELECT MIN(observation_date), MAX(observation_date) FROM ofr_combined').fetchone()}")
    print(f"Total rows:    {obs_count:,}")
    
    con.close()
    print(f"[{datetime.now()}] === OFR Preprocessing Complete ===")


if __name__ == "__main__":
    main()