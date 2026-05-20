import duckdb
import numpy as np
import polars as pl
from src.features.signal_features import compute_smart_money_signals
from src.models.regime_hmm import MacroRegimeDetector


def test_hmm_semantic_mapping():
    np.random.seed(42)
    detector = MacroRegimeDetector(n_components=4)
    
    state1 = np.random.normal([0.0, 10.0], 0.5, (50, 2))
    state2 = np.random.normal([10.0, -5.0], 0.5, (50, 2))
    state3 = np.random.normal([5.0, 5.0], 0.5, (50, 2))
    state4 = np.random.normal([2.0, 0.0], 0.5, (50, 2))
    
    X = np.vstack([state1, state2, state3, state4])
    df = pl.DataFrame(X, schema=["Stress", "Growth"])

    # 1. Fit the scaler on the full dataset first
    detector.scaler.fit(df.to_numpy())
    
    # 2. Set the means and tell the model NOT to overwrite them
    expected_centers = np.array([[0, 10], [10, -5], [5, 5], [2, 0]])
    detector.model.means_ = detector.scaler.transform(expected_centers)
    
    # CRITICAL: Remove 'm' from init_params so your means are preserved
    detector.model.init_params = "stc" 
    
    res = detector.fit_predict(df, ["Stress", "Growth"])
    
    unique_labels = res["regime_label"].unique().to_list()
    assert len(unique_labels) == 4, f"Expected 4 regimes, but found: {unique_labels}"
    
def test_racs_calculation():
    conn = duckdb.connect(':memory:')
    conn.execute("""
        CREATE TABLE manager_features_clustered AS 
        SELECT 'MGR_A' AS FILINGMANAGER_NAME, 2 AS cluster_id UNION ALL
        SELECT 'MGR_B', 2 UNION ALL SELECT 'MGR_C', 1;
        
        CREATE TABLE edgar_core_sample AS
        SELECT 'MGR_A' AS FILINGMANAGER_NAME, '2023Q1' AS REPORTCALENDARORQUARTER, 'AAPL' AS CUSIP, 100 AS SSHPRNAMT, 1000 AS VALUE UNION ALL
        SELECT 'MGR_A', '2023Q2', 'AAPL', 200, 2000 UNION ALL -- 100% increase (Signal)
        SELECT 'MGR_B', '2023Q2', 'AAPL', 500, 5000;         -- New initiation (Signal)
    """)
    
    df = compute_smart_money_signals(conn)
    # Both MGR_A and MGR_B bought > 50% in 2023Q2 -> strong_buys = 2
    assert df.filter(pl.col("CUSIP") == "AAPL").select("strong_buys").item() == 2
    assert "racs_score" in df.columns
    assert "crowding_penalty" in df.columns