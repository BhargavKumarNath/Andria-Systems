CREATE OR REPLACE VIEW ofr_indicators AS
SELECT
    mnemonic,
    dataset AS subcategory,
    observation_date_parsed AS obs_date,
    CAST(value AS DOUBLE) as value
FROM read_parquet('dataset/raw/ofr_*.parquet')
WHERE observation_date_parsed >= '2011-09-30'
    AND value IS NOT NULL;
