CREATE OR REPLACE VIEW fred_macro AS
SELECT
    mnemonic,
    group_name,
    observation_date_parsed AS obs_date,
    CAST(value AS DOUBLE) as value
FROM read_parquet('dataset/raw/fred_*.parquet')
WHERE observation_date_parsed >= '2010-01-01';
