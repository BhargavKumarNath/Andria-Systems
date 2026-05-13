"""Advanced Manager Clustering Engine — HDBSCAN sweep + UMAP + archetype labeling."""

from __future__ import annotations

import numpy as np
import polars as pl
from sklearn.cluster import HDBSCAN
from sklearn.preprocessing import RobustScaler
from sklearn.metrics.pairwise import cosine_similarity
import umap

from andria.core.config import Settings
from andria.core.exceptions import ClusteringError
from andria.core.logging import get_logger
from andria.core.schemas import ClusteredManagerContract
from andria.models.clustering.diagnostics import internal_validation

logger = get_logger(__name__)


class ClusteringEngine:
    """HDBSCAN hyperparameter sweep with UMAP embedding and archetype labeling."""

    def __init__(self, cfg: Settings) -> None:
        self._cfg = cfg

        # We exclude names and non-behavioral info from feature space
        # All columns in ManagerDNAContract except manager_name
        self._feature_cols = [
            "avg_hhi",
            "avg_put_ratio",
            "log_avg_aum",
            "avg_turnover",
            "avg_conviction_delta",
            "new_position_rate",
            "exit_rate",
            "avg_holding_duration_qtrs",
            "top5_concentration",
            "options_notional_ratio",
            "shared_vote_ratio",
            "amendment_rate",
            "quarters_active",
            "aum_volatility",
        ]

        # Prototype cluster vectors in scaled space for mapping semantics
        # Order: [hhi, put_ratio, log_aum, turnover, conviction_delta]
        # Since we have 14 features now, we simplify semantic mapping by focusing on core 5
        self._core_features = [
            "avg_hhi",
            "avg_put_ratio",
            "log_avg_aum",
            "avg_turnover",
            "avg_conviction_delta",
        ]

        self._prototypes = {
            "Conviction Activists": [
                2.0,
                -1.0,
                0.0,
                -0.5,
                1.0,
            ],  # High HHI, Low Put, High Conviction Delta
            "Index Huggers": [
                -1.0,
                -1.0,
                1.5,
                -1.0,
                -0.5,
            ],  # Low HHI, Low Put, High AUM, Low turnover
            "Macro Tourists": [0.0, 2.0, 0.0, 1.5, 0.0],  # High Put, High Turnover
            "Nimble Traders": [-0.5, 0.5, -1.0, 2.0, 0.0],  # Low AUM, High turnover
        }

    def _sweep_hdbscan(self, X_scaled: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
        """Sweep HDBSCAN min_cluster_size and return best labels, probs, and silhouette."""
        sizes = self._cfg.clustering.min_cluster_size_sweep
        ratio = self._cfg.clustering.min_samples_ratio

        best_sil = -2.0
        best_labels = None
        best_probs = None

        for size in sizes:
            min_samples = max(2, int(size * ratio))
            model = HDBSCAN(
                min_cluster_size=size,
                min_samples=min_samples,
                cluster_selection_epsilon=self._cfg.clustering.cluster_selection_epsilon,
            )
            labels = model.fit_predict(X_scaled)
            probs = model.probabilities_

            val = internal_validation(X_scaled, labels)
            sil = val["silhouette"]

            logger.info(
                "hdbscan_sweep_progress",
                iteration=f"{sizes.index(size) + 1}/{len(sizes)}",
                size=size,
                silhouette=round(sil, 4),
                n_clusters=len(set(labels)) - 1,
            )

            if sil > best_sil:
                best_sil = sil
                best_labels = labels
                best_probs = probs

        if best_labels is None:
            raise ClusteringError("HDBSCAN sweep failed to produce any clusters.")

        return best_labels, best_probs, best_sil

    def _label_archetypes(
        self, df: pl.DataFrame, labels: np.ndarray, X_scaled: np.ndarray
    ) -> list[str]:
        """Map abstract cluster IDs to semantic archetypes using Cosine Similarity on core features."""
        # Find indices of core features in X_scaled
        core_idx = [self._feature_cols.index(f) for f in self._core_features]

        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)

        if n_clusters == 0:
            return ["Noise"] * len(labels)

        cluster_means = {}
        for cid in set(labels):
            if cid == -1:
                continue
            mask = labels == cid
            cluster_means[cid] = np.median(X_scaled[mask][:, core_idx], axis=0)

        # Compute cosine similarity between each cluster median and our prototypes
        archetype_map = {-1: "Noise"}

        # Convert prototypes to array
        proto_names = list(self._prototypes.keys())
        proto_matrix = np.array([self._prototypes[n] for n in proto_names])

        # Track used archetypes to avoid duplicates if possible
        available_names = set(proto_names)

        for cid, median_vec in cluster_means.items():
            sims = cosine_similarity(median_vec.reshape(1, -1), proto_matrix)[0]

            # Sort by similarity descending
            best_idx_order = np.argsort(sims)[::-1]

            assigned = False
            for idx in best_idx_order:
                name = proto_names[idx]
                if name in available_names:
                    archetype_map[cid] = name
                    available_names.remove(name)
                    assigned = True
                    break

            if not assigned:
                # If all are taken, just take the absolute best match even if duplicate
                best_match = proto_names[best_idx_order[0]]
                archetype_map[cid] = f"{best_match} (Variant)"

        logger.info("archetypes_mapped", mapping=archetype_map)

        return [archetype_map[cid] for cid in labels]

    def fit_predict(self, dna_df: pl.DataFrame) -> pl.DataFrame:
        """Cluster managers and return DataFrame with cluster_id, archetype_label, umap_1/2."""
        logger.info("clustering_engine_start", shape=dna_df.shape)

        X = dna_df.select(self._feature_cols).to_numpy()

        # 1. Scale
        scaler = RobustScaler()
        X_scaled = scaler.fit_transform(X)

        # 2. HDBSCAN Sweep
        labels, probs, best_sil = self._sweep_hdbscan(X_scaled)
        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        logger.info("clustering_sweep_complete", best_silhouette=best_sil, n_clusters=n_clusters)

        if n_clusters < 2:
            logger.warning("few_clusters_found", n_clusters=n_clusters)

        # 3. UMAP Embedding
        logger.info("running_umap_embedding")
        umap_cfg = self._cfg.clustering.umap
        reducer = umap.UMAP(
            n_components=umap_cfg.n_components,
            n_neighbors=umap_cfg.n_neighbors,
            min_dist=umap_cfg.min_dist,
            metric=umap_cfg.metric,
            random_state=umap_cfg.random_state,
        )
        X_umap = reducer.fit_transform(X_scaled)

        # 4. Archetype Labeling
        archetypes = self._label_archetypes(dna_df, labels, X_scaled)

        # 5. Build Result
        result_df = dna_df.with_columns(
            [
                pl.Series("cluster_id", labels, dtype=pl.Int32),
                pl.Series("cluster_prob", probs, dtype=pl.Float32),
                pl.Series("archetype_label", archetypes, dtype=pl.Utf8),
                pl.Series("umap_1", X_umap[:, 0], dtype=pl.Float32),
                pl.Series("umap_2", X_umap[:, 1], dtype=pl.Float32),
            ]
        )

        # Validate against contract
        validated = ClusteredManagerContract.validate(result_df)
        return validated
