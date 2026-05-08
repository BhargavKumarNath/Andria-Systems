#!/usr/bin/env python3
"""
FRED Preprocessing Script
=========================
Combines all 83 individual JSON indicator files into a single Parquet file.

ZERO DATA LOSS DESIGN:
- Python's json module reads raw file content (no type inference).
- All fields stored as VARCHAR: preserves exact string representations,
  including missing value markers like ".", leading zeros, etc.
- Original metadata (label, group, units, frequency) preserved per row.
- Real-time start/end dates preserved (FRED revision history).
"""

import duckdb
import json
import sys
from pathlib import Path
from datetime import datetime

# CONFIGURATION
RAW_PATH = Path("dataset/raw/fred")
OUTPUT_PATH = Path("dataset/processed")
OUTPUT_FILE = OUTPUT_PATH / "FRED_preprocess.parquet"


def validate_environment():
    if not RAW_PATH.exists():
        print(f"ERROR: Raw data path not found: {RAW_PATH.resolve()}")
        sys.exit(1)
    OUTPUT_PATH.mkdir(parents=True, exist_ok=True)


def main():
    validate_environment()
    
    con = duckdb.connect()
    con.execute("SET enable_progress_bar = true;")
    
    print(f"[{datetime.now()}] === FRED Preprocessing Started ===")
    
    json_files = sorted(RAW_PATH.glob("*.json"))
    print(f"Found {len(json_files)} JSON files")
    
    if not json_files:
        print("ERROR: No JSON files found.")
        sys.exit(1)
    
    # Create target table with explicit VARCHAR types for zero data loss
    con.execute("""
        CREATE OR REPLACE TABLE fred_combined (
            mnemonic VARCHAR,
            label VARCHAR,
            group_name VARCHAR,
            pulled_at VARCHAR,
            start_date VARCHAR,
            series_count VARCHAR,
            units VARCHAR,
            frequency VARCHAR,
            realtime_start VARCHAR,
            realtime_end VARCHAR,
            observation_date VARCHAR,
            value VARCHAR,
            observation_date_parsed DATE,
            source_file VARCHAR
        )
    """)
    
    total_obs = 0
    
    for jfile in json_files:
        print(f"  Processing {jfile.name}...", end=" ", flush=True)
        
        try:
            with open(jfile, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            print(f"ERROR reading {jfile}: {e}")
            continue
        
        mnemonic = str(data.get('mnemonic', ''))
        label = str(data.get('label', ''))
        group_name = str(data.get('group', ''))
        pulled_at = str(data.get('pulled_at', ''))
        start_date = str(data.get('start_date', ''))
        series_count = str(data.get('count', ''))
        units = str(data.get('units', ''))
        frequency = str(data.get('frequency', ''))
        
        observations = data.get('observations', [])
        file_obs = len(observations)
        total_obs += file_obs
        
        # Prepare records
        records = []
        for obs in observations:
            obs_date = str(obs.get('date', ''))
            obs_value = str(obs.get('value', ''))  # Preserves ".", "NA", etc.
            rt_start = str(obs.get('realtime_start', ''))
            rt_end = str(obs.get('realtime_end', ''))
            
            # Parse date safely
            date_parsed = None
            if obs_date:
                try:
                    date_parsed = datetime.strptime(obs_date, '%Y-%m-%d').date()
                except ValueError:
                    pass
            
            records.append((
                mnemonic, label, group_name, pulled_at, start_date,
                series_count, units, frequency,
                rt_start, rt_end, obs_date, obs_value,
                date_parsed, str(jfile)
            ))
        
        if records:
            con.executemany("""
                INSERT INTO fred_combined VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
            """, records)
        
        print(f"({file_obs:,} observations)")
    
    print(f"\nTotal observations loaded: {total_obs:,}")
    
    # Verify count
    db_count = con.execute("SELECT COUNT(*) FROM fred_combined").fetchone()[0]
    print(f"Database count: {db_count:,}")
    
    if db_count != total_obs:
        print(f"WARNING: Count mismatch! Expected {total_obs:,}, got {db_count:,}")
    
    # Export
    print(f"[{datetime.now()}] Exporting to Parquet...")
    con.execute(f"""
        COPY fred_combined TO '{OUTPUT_FILE}'
        (FORMAT PARQUET, COMPRESSION 'ZSTD', ROW_GROUP_SIZE 100000)
    """)
    
    file_size_mb = OUTPUT_FILE.stat().st_size / (1024 * 1024)
    print(f"  -> Exported: {OUTPUT_FILE}")
    print(f"  -> File size: {file_size_mb:.1f} MB")
    
    # Summary
    print(f"\n[{datetime.now()}] === Summary ===")
    print(f"Series:      {con.execute('SELECT COUNT(DISTINCT mnemonic) FROM fred_combined').fetchone()[0]}")
    print(f"Date range:  {con.execute('SELECT MIN(observation_date), MAX(observation_date) FROM fred_combined').fetchone()}")
    print(f"Total rows:  {db_count:,}")
    
    con.close()
    print(f"[{datetime.now()}] === FRED Preprocessing Complete ===")


if __name__ == "__main__":
    main()
