"""Macro Regime Hidden Markov Model — stable semantic mapping via cosine similarity."""

from __future__ import annotations

import numpy as np
import polars as pl
from hmmlearn import hmm
from sklearn.preprocessing import StandardScaler
from sklearn.metrics.pairwise import cosine_similarity

from andria.core.config import Settings
from andria.core.db import DuckDBConnectionFactory, db_factory
from andria.core.exceptions import RegimeError
from andria.core.logging import get_logger
from andria.core.schemas import RegimeContract
from andria.ingestion.registry import DatasetRegistry

logger = get_logger(__name__)


class MacroRegimeDetector:
    """Fits a Gaussian HMM to FRED/OFR macro features with stable semantic labeling.

    Pipeline:
    1. Extract macro time series (VIX, Yield Curve, Credit Spreads, Rates)
    2. Resample to Quarterly frequency (end of quarter) to align with 13F
    3. Fit GaussianHMM
    4. Map abstract states to semantically meaningful regimes using cosine similarity
       against the prototype vectors defined in `configs/base.yaml`.
    """

    def __init__(self, cfg: Settings, factory: DuckDBConnectionFactory | None = None) -> None:
        self._cfg = cfg
        self._factory = factory or db_factory
        self._registry = DatasetRegistry(cfg)

        self._feature_cols = self._cfg.hmm.features
        self._prototypes = self._cfg.hmm.regime_prototypes

    def _extract_macro_features(self) -> pl.DataFrame:
        """Extracts and pivots macro features from FRED into quarterly time series."""
        fred_path = self._registry.require(self._registry.fred_processed)

        query = f"""
        WITH raw_fred AS (
            SELECT 
                observation_date::DATE as date,
                mnemonic,
                TRY_CAST(value AS DOUBLE) as val
            FROM read_parquet('{fred_path}')
            WHERE value IS NOT NULL
        ),
        daily_pivot AS (
            PIVOT raw_fred 
            ON mnemonic 
            USING AVG(val) 
            GROUP BY date
        ),
        -- We map specific mnemonics to our required features. 
        -- If DFF is missing, fallback to 0. If OFR FSI is missing, use NFCI as proxy.
        mapped_daily AS (
            SELECT 
                date,
                COALESCE(VIXCLS, 15.0) as vix_level,
                COALESCE(T10Y2Y, 0.0) as yield_spread_10y2y,
                COALESCE(BAMLH0A0HYM2, 4.0) as credit_spread_hy,
                -- Create fed funds delta
                COALESCE(DFF, 0.0) - LAG(COALESCE(DFF, 0.0), 60) OVER (ORDER BY date) as fed_funds_delta,
                -- Use NFCI or 0 as proxy for OFR stress if not directly available
                COALESCE(NFCIRISK, 0.0) as ofr_stress_index
            FROM daily_pivot
        ),
        -- Downsample to quarterly (last available day in quarter)
        quarterly_base AS (
            SELECT 
                date_trunc('quarter', date) as quarter_start,
                MAX(date) as last_date
            FROM mapped_daily
            GROUP BY 1
        )
        SELECT 
            qb.quarter_start as date,
            md.vix_level,
            md.yield_spread_10y2y,
            md.credit_spread_hy,
            COALESCE(md.fed_funds_delta, 0.0) as fed_funds_delta,
            md.ofr_stress_index
        FROM quarterly_base qb
        JOIN mapped_daily md ON qb.last_date = md.date
        ORDER BY qb.quarter_start
        """

        with self._factory.connect() as conn:
            df = conn.execute(query).pl()

        # Ensure we have the required columns
        for col in self._feature_cols:
            if col not in df.columns:
                df = df.with_columns(pl.lit(0.0).alias(col))

        # Forward fill any remaining nulls from sparse sampling, then fill with 0
        df = df.fill_null(strategy="forward").fill_null(0.0)
        return df

    def _label_states(self, hmm_model: hmm.GaussianHMM, scaler: StandardScaler) -> dict[int, str]:
        """Maps HMM abstract state IDs to regime labels using cosine similarity."""
        # The model means are in standardized space (since we fit on scaled data)
        state_means = hmm_model.means_

        # Build prototype matrix from config
        proto_names = list(self._prototypes.keys())
        proto_matrix = np.array([self._prototypes[name] for name in proto_names])

        label_map = {}
        available_names = set(proto_names)

        for state_id in range(self._cfg.hmm.n_components):
            mean_vec = state_means[state_id].reshape(1, -1)
            sims = cosine_similarity(mean_vec, proto_matrix)[0]

            # Sort by highest similarity
            best_idx_order = np.argsort(sims)[::-1]

            assigned = False
            for idx in best_idx_order:
                name = proto_names[idx]
                if name in available_names:
                    label_map[state_id] = name
                    available_names.remove(name)
                    assigned = True
                    break

            if not assigned:
                best_match = proto_names[best_idx_order[0]]
                label_map[state_id] = f"{best_match} (Variant)"

        logger.info("regime_states_mapped", mapping=label_map)
        return label_map

    def fit_predict(self) -> pl.DataFrame:
        """Fit HMM on FRED/OFR features, return regime time series DataFrame."""
        df = self._extract_macro_features()

        if len(df) < self._cfg.hmm.n_components:
            raise RegimeError("Not enough time series observations to fit HMM.")

        logger.info("fitting_hmm", obs=len(df), features=len(self._feature_cols))

        X = df.select(self._feature_cols).to_numpy()

        # Scale features
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # Fit Gaussian HMM
        model = hmm.GaussianHMM(
            n_components=self._cfg.hmm.n_components,
            covariance_type=self._cfg.hmm.covariance_type,
            n_iter=self._cfg.hmm.n_iter,
            random_state=self._cfg.hmm.random_state,
        )

        try:
            model.fit(X_scaled)
        except Exception as e:
            raise RegimeError(f"HMM fit failed: {e}") from e

        if not model.monitor_.converged:
            logger.warning("hmm_not_converged")

        # Predict state probabilities
        probs = model.predict_proba(X_scaled)
        state_preds = model.predict(X_scaled)

        # Map to semantic labels
        state_to_label = self._label_states(model, scaler)

        # Create output DataFrame
        labels = [state_to_label[s] for s in state_preds]
        max_probs = np.max(probs, axis=1)

        # Build base columns
        res_cols = [
            df["date"].cast(pl.Date),
            pl.Series("regime_id", state_preds, dtype=pl.Int32),
            pl.Series("regime_label", labels, dtype=pl.Utf8),
            pl.Series("regime_prob", max_probs, dtype=pl.Float32),
        ]

        # Add probability columns for each named regime
        prob_dict = {name: np.zeros(len(df), dtype=np.float32) for name in state_to_label.values()}
        for state_id, label in state_to_label.items():
            prob_dict[label] = probs[:, state_id]

        for label, prob_array in prob_dict.items():
            # Format label to be valid column name if necessary, or just use label
            res_cols.append(pl.Series(f"prob_{label}", prob_array, dtype=pl.Float32))

        res_df = pl.DataFrame(res_cols)

        validated = RegimeContract.validate(res_df)
        logger.info("regime_series_built", rows=len(validated))

        return validated
