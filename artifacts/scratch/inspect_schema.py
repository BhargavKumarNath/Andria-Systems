import duckdb

conn = duckdb.connect()
print("OFR FSI:")
print(conn.execute("SELECT DISTINCT mnemonic, series_name FROM 'dataset/processed/OFR_preprocess.parquet' WHERE mnemonic LIKE '%FSI%' OR series_name LIKE '%Stress%'").df())
print("\nFRED VIX/Yield/Credit:")
print(conn.execute("SELECT DISTINCT mnemonic, label FROM 'dataset/processed/FRED_preprocess.parquet' WHERE mnemonic IN ('VIXCLS', 'T10Y2Y', 'BAMLH0A0HYM2', 'FEDFUNDS')").df())
