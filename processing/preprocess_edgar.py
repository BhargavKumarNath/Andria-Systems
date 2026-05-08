#!/usr/bin/env python3
"""
EDGAR Preprocessing Script
==========================
Combines all quarterly INFOTABLE.tsv, COVERPAGE.tsv, and _meta.json files
into a single Parquet file using DuckDB.

ZERO DATA LOSS DESIGN:
- All TSV columns read as VARCHAR to preserve exact formatting (leading zeros,
  special characters, inconsistent numeric formatting across quarters).
- LEFT JOIN from INFOTABLE ensures no holding records are lost.
- Original source file paths preserved for full traceability.
- Meta JSON stored as raw text.
- Parsed date columns added alongside originals (NULL if unparseable).
"""

import duckdb
import json
import sys
from pathlib import Path
from datetime import datetime

# CONFIGURATION
RAW_PATH = Path("dataset/raw/edgar")
OUTPUT_PATH = Path("dataset/processed")
OUTPUT_FILE = OUTPUT_PATH / "EDGAR_preprocess.parquet"

# DuckDB settings
MEMORY_LIMIT = "10GB"


def validate_environment():
    """Ensure raw data directory exists."""
    if not RAW_PATH.exists():
        print(f"ERROR: Raw data path not found: {RAW_PATH.resolve()}")
        sys.exit(1)
    OUTPUT_PATH.mkdir(parents=True, exist_ok=True)


def main():
    validate_environment()
    
    con = duckdb.connect()
    con.execute(f"SET memory_limit = '{MEMORY_LIMIT}';")
    con.execute("SET enable_progress_bar = true;")
    
    print(f"[{datetime.now()}] === EDGAR Preprocessing Started ===")
    
    # 1. Discover files
    infotable_files = sorted(RAW_PATH.rglob("INFOTABLE.tsv"))
    coverpage_files = sorted(RAW_PATH.rglob("COVERPAGE.tsv"))
    meta_files = sorted(RAW_PATH.rglob("_meta.json"))
    
    print(f"Found {len(infotable_files)} INFOTABLE files")
    print(f"Found {len(coverpage_files)} COVERPAGE files")
    print(f"Found {len(meta_files)} meta files")
    
    if not infotable_files:
        print("ERROR: No INFOTABLE.tsv files found.")
        sys.exit(1)
    
    # 2. Load INFOTABLE (the core holdings data)
    print(f"[{datetime.now()}] Loading INFOTABLE files...")
    
    infotable_pattern = str(RAW_PATH / "*" / "INFOTABLE.tsv")
    
    con.execute(f"""
        CREATE OR REPLACE TABLE infotable_all AS
        SELECT 
            *,
            -- Extract quarter folder name OS-agnostically
            split_part(replace(filename, '\\', '/'), '/', -2) AS quarter,
            filename AS source_file_infotable
        FROM read_csv_auto('{infotable_pattern}',
            sep = '\t',
            header = true,
            all_varchar = true,
            filename = true,
            ignore_errors = false
        )
    """)
    
    infotable_count = con.execute("SELECT COUNT(*) FROM infotable_all").fetchone()[0]
    infotable_cols = con.execute("SELECT * FROM infotable_all LIMIT 0").description
    print(f"  -> Loaded {infotable_count:,} rows from INFOTABLE ({len(infotable_cols)} columns)")
    
    # 3. Load COVERPAGE (filing metadata)
    print(f"[{datetime.now()}] Loading COVERPAGE files...")
    
    coverpage_pattern = str(RAW_PATH / "*" / "COVERPAGE.tsv")
    
    con.execute(f"""
        CREATE OR REPLACE TABLE coverpage_all AS
        SELECT 
            *,
            split_part(replace(filename, '\\', '/'), '/', -2) AS quarter,
            filename AS source_file_coverpage
        FROM read_csv_auto('{coverpage_pattern}',
            sep = '\t',
            header = true,
            all_varchar = true,
            filename = true,
            ignore_errors = false
        )
    """)
    
    coverpage_count = con.execute("SELECT COUNT(*) FROM coverpage_all").fetchone()[0]
    coverpage_cols = con.execute("SELECT * FROM coverpage_all LIMIT 0").description
    print(f"  -> Loaded {coverpage_count:,} rows from COVERPAGE ({len(coverpage_cols)} columns)")
    
    # Validate: COVERPAGE should have unique ACCESSION_NUMBER per quarter
    dup_check = con.execute("""
        SELECT COUNT(*) FROM (
            SELECT ACCESSION_NUMBER, quarter
            FROM coverpage_all
            GROUP BY ACCESSION_NUMBER, quarter
            HAVING COUNT(*) > 1
        )
    """).fetchone()[0]
    
    if dup_check > 0:
        print(f"WARNING: {dup_check} duplicate ACCESSION_NUMBER+quarter combos in COVERPAGE!")
        print("         Review source data before proceeding.")
    
    # 4. Load _meta.json files
    print(f"[{datetime.now()}] Loading meta files...")
    
    con.execute("""
        CREATE OR REPLACE TABLE meta_all (
            quarter VARCHAR,
            meta_json VARCHAR,
            meta_file VARCHAR
        )
    """)
    
    meta_records = []
    for meta_file in meta_files:
        try:
            with open(meta_file, 'r', encoding='utf-8') as f:
                content = json.load(f)
            quarter = meta_file.parent.name
            meta_records.append((quarter, json.dumps(content), str(meta_file)))
        except Exception as e:
            print(f"  WARNING: Could not read {meta_file}: {e}")
    
    if meta_records:
        con.executemany("INSERT INTO meta_all VALUES (?, ?, ?)", meta_records)
    
    meta_count = con.execute("SELECT COUNT(*) FROM meta_all").fetchone()[0]
    print(f"  -> Loaded {meta_count} meta records")
    
    # 5. Join and create final dataset
    print(f"[{datetime.now()}] Joining and building final dataset...")
    
    con.execute("""
        CREATE OR REPLACE TABLE edgar_combined AS
        SELECT
            -- All original INFOTABLE columns (exact names, exact values)
            i.ACCESSION_NUMBER,
            i.INFOTABLE_SK,
            i.NAMEOFISSUER,
            i.TITLEOFCLASS,
            i.CUSIP,
            i.FIGI,
            i.VALUE,
            i.SSHPRNAMT,
            i.SSHPRNAMTTYPE,
            i.PUTCALL,
            i.INVESTMENTDISCRETION,
            i.OTHERMANAGER,
            i.VOTING_AUTH_SOLE,
            i.VOTING_AUTH_SHARED,
            i.VOTING_AUTH_NONE,
            
            -- INFOTABLE provenance
            i.quarter AS source_quarter,
            i.source_file_infotable,
            
            -- COVERPAGE metadata (all columns preserved)
            c.REPORTCALENDARORQUARTER,
            c.ISAMENDMENT,
            c.AMENDMENTNO,
            c.AMENDMENTTYPE,
            c.CONFDENIEDEXPIRED,
            c.DATEDENIEDEXPIRED,
            c.DATEREPORTED,
            c.REASONFORNONCONFIDENTIALITY,
            c.FILINGMANAGER_NAME,
            c.FILINGMANAGER_STREET1,
            c.FILINGMANAGER_STREET2,
            c.FILINGMANAGER_CITY,
            c.FILINGMANAGER_STATEORCOUNTRY,
            c.FILINGMANAGER_ZIPCODE,
            c.REPORTTYPE,
            c.FORM13FFILENUMBER,
            c.CRDNUMBER,
            c.SECFILENUMBER,
            c.PROVIDEINFOFORINSTRUCTION5,
            c.ADDITIONALINFORMATION,
            c.source_file_coverpage,
            
            -- Parsed date (NULL if unparseable; original kept intact)
            TRY_STRPTIME(c.REPORTCALENDARORQUARTER, '%d-%b-%Y')::DATE 
                AS filing_date_parsed,
            
            -- Meta JSON
            m.meta_json,
            m.meta_file
            
        FROM infotable_all i
        LEFT JOIN coverpage_all c
            ON i.ACCESSION_NUMBER = c.ACCESSION_NUMBER
            AND i.quarter = c.quarter
        LEFT JOIN meta_all m
            ON i.quarter = m.quarter
    """)
    
    final_count = con.execute("SELECT COUNT(*) FROM edgar_combined").fetchone()[0]
    print(f"  -> Final dataset: {final_count:,} rows")
    
    # Sanity check: final row count should equal infotable_count (LEFT JOIN)
    if final_count != infotable_count:
        print("  WARNING: Row count changed after join!")
        print(f"           INFOTABLE: {infotable_count:,}")
        print(f"           FINAL:     {final_count:,}")
        print("           Difference indicates duplicates in COVERPAGE.")
    
    # 6. Export to Parquet
    print(f"[{datetime.now()}] Exporting to Parquet...")
    
    con.execute(f"""
        COPY edgar_combined TO '{OUTPUT_FILE}'
        (FORMAT PARQUET,
         COMPRESSION 'ZSTD',
         ROW_GROUP_SIZE 100000)
    """)
    
    file_size_mb = OUTPUT_FILE.stat().st_size / (1024 * 1024)
    print(f"  -> Exported: {OUTPUT_FILE}")
    print(f"  -> File size: {file_size_mb:.1f} MB")
    
    # 7. Summary statistics
    print(f"\n[{datetime.now()}] === Summary ===")
    print(f"Quarters processed: {con.execute('SELECT COUNT(DISTINCT quarter) FROM infotable_all').fetchone()[0]}")
    print(f"Unique filings:     {con.execute('SELECT COUNT(DISTINCT ACCESSION_NUMBER) FROM infotable_all').fetchone()[0]:,}")
    print(f"Unique issuers:     {con.execute('SELECT COUNT(DISTINCT NAMEOFISSUER) FROM infotable_all').fetchone()[0]:,}")
    print(f"Total holdings:     {final_count:,}")
    
    con.close()
    print(f"[{datetime.now()}] === EDGAR Preprocessing Complete ===")


if __name__ == "__main__":
    main()
