Create a view of the raw parquet files
CREATE OR REPLACE VIEW raw_edgar AS 
SELECT * FROM read_parquet('dataset/raw/edgar_*.parquet');

-- Identify Top 10,000 Assets by total institutional value post-2010
CREATE OR REPLACE TABLE top_assets AS 
SELECT CUSIP, SUM(CAST(VALUE AS BIGINT)) as total_value
FROM raw_edgar
WHERE filing_date_parsed >= '2010-01-01'
GROUP BY CUSIP
ORDER BY total_value DESC
LIMIT 10000;

-- Create the dense, sampled analytical dataset
CREATE OR REPLACE TABLE edgar_core_sample AS
SELECT 
    e.ACCESSION_NUMBER,
    e.FILINGMANAGER_NAME,
    e.CUSIP,
    COALESCE(e.PUTCALL, 'SH') AS exposure_type,
    e.VALUE,
    e.SSHPRNAMT AS shares,
    e.filing_date_parsed,
    e.REPORTCALENDARORQUARTER
FROM raw_edgar e
INNER JOIN top_assets t ON e.CUSIP = t.CUSIP
WHERE e.filing_date_parsed >= '2010-01-01'
  AND e.ISAMENDMENT != 'Y'; -- keep only primary filings for base sample
