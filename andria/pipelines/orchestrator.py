import time
from typing import Any

import structlog
from prefect import flow, task

from andria.core.artifact_registry import ArtifactRegistry
from andria.core.evaluation_gate import EvaluationGate
from andria.core.telemetry import PIPELINE_LATENCY

logger = structlog.get_logger(__name__)


@task(retries=2, retry_delay_seconds=10)
def ingest_data() -> dict[str, Any]:
    """Ingest EDGAR, FRED, and OFR data."""
    logger.info("ingestion_started")
    # Simulation of ingestion
    time.sleep(1.0)
    logger.info("ingestion_complete", rows_processed=15000)
    return {"provenance_quality": 0.95}


@task
def extract_manager_dna(ingestion_meta: dict[str, Any]) -> dict[str, Any]:
    """Extract manager DNA and cluster."""
    logger.info("clustering_started")
    time.sleep(1.0)
    logger.info("clustering_complete")
    return {"clusters_found": 12}


@task
def generate_signals(dna_meta: dict[str, Any]) -> None:
    """Generate RACS signals."""
    logger.info("signal_generation_started")
    time.sleep(1.0)
    logger.info("signal_generation_complete")


@task
def validate_run(registry: ArtifactRegistry, run_id: str, prov_quality: float) -> bool:
    """Run the evaluation gate checks."""
    gate = EvaluationGate(registry)
    
    # Simulate execution of structural checks
    leakage_passed = True
    reproducibility_passed = True
    pbo_score = 0.25  # Passes < 0.40
    
    passed = gate.evaluate_run(
        run_id=run_id,
        leakage_passed=leakage_passed,
        provenance_quality=prov_quality,
        reproducibility_passed=reproducibility_passed,
        pbo_score=pbo_score,
    )
    return passed


@flow(name="Andria Core Pipeline")
def run_pipeline() -> None:
    """
    Main execution pipeline. Local-first execution compatible.
    """
    start_time = time.time()
    logger.info("pipeline_started")
    
    registry = ArtifactRegistry()
    manifest = registry.start_run()
    
    try:
        # Ingestion
        ingest_meta = ingest_data()
        
        # Manager DNA & Clustering
        dna_meta = extract_manager_dna(ingest_meta)
        
        # Signal Generation
        generate_signals(dna_meta)
        
        # Evaluation Gate
        passed = validate_run(
            registry=registry,
            run_id=manifest.run_id,
            prov_quality=ingest_meta["provenance_quality"]
        )
        
        if passed:
            logger.info("pipeline_success", run_id=manifest.run_id)
        else:
            logger.error("pipeline_rejected_at_gate", run_id=manifest.run_id)
            
    except Exception as e:
        logger.exception("pipeline_failed", run_id=manifest.run_id, error=str(e))
        manifest.status = "failed"
        registry.update_run(manifest)
        raise e
    finally:
        latency = time.time() - start_time
        PIPELINE_LATENCY.observe(latency)


if __name__ == "__main__":
    # Allows pure local execution without a central Prefect server
    run_pipeline()
