import structlog
from pydantic import BaseModel

from andria.core.artifact_registry import ArtifactRegistry

logger = structlog.get_logger(__name__)

# Publication thresholds. The exported validation.json reports pass/fail with
# these same constants, so the dashboard can never disagree with the gate.
PROVENANCE_THRESHOLD = 0.90
PBO_THRESHOLD = 0.40


def provenance_passes(provenance_quality: float) -> bool:
    return provenance_quality >= PROVENANCE_THRESHOLD


def pbo_passes(pbo_score: float) -> bool:
    # NaN compares False, so an unestimable PBO fails closed.
    return pbo_score <= PBO_THRESHOLD


class GateCheckResult(BaseModel):
    passed: bool
    reason: str


class EvaluationGate:
    """
    Formal evaluation gate blocking signal publication unless rigorous standards are met.
    """
    
    def __init__(self, registry: ArtifactRegistry):
        self.registry = registry
        
    def evaluate_run(
        self,
        run_id: str,
        leakage_passed: bool,
        provenance_quality: float,
        reproducibility_passed: bool,
        pbo_score: float,
    ) -> bool:
        """
        Evaluate a research run against the institutional criteria.
        If successful, updates the manifest to 'published'.
        """
        manifest = self.registry.get_run(run_id)
        if not manifest:
            logger.error("evaluation_gate_failed", run_id=run_id, reason="Run manifest not found")
            return False
            
        checks = {
            "leakage_audit": GateCheckResult(
                passed=leakage_passed,
                reason="Leakage audit failed" if not leakage_passed else "Pass"
            ),
            "provenance_threshold": GateCheckResult(
                passed=provenance_passes(provenance_quality),
                reason=(
                    f"Provenance {provenance_quality:.2f} below {PROVENANCE_THRESHOLD:.2f} threshold"
                    if not provenance_passes(provenance_quality)
                    else "Pass"
                ),
            ),
            "reproducibility": GateCheckResult(
                passed=reproducibility_passed,
                reason="Deterministic reproducibility failed" if not reproducibility_passed else "Pass"
            ),
            "pbo_validation": GateCheckResult(
                passed=pbo_passes(pbo_score),
                reason=(
                    f"PBO score {pbo_score:.2f} exceeds {PBO_THRESHOLD:.2f} limit"
                    if not pbo_passes(pbo_score)
                    else "Pass"
                ),
            )
        }
        
        manifest.validation_status = {k: v.passed for k, v in checks.items()}
        
        all_passed = all(check.passed for check in checks.values())
        if all_passed:
            manifest.status = "published"
            logger.info("evaluation_gate_passed", run_id=run_id)
        else:
            manifest.status = "rejected"
            failed_reasons = [check.reason for check in checks.values() if not check.passed]
            logger.warning("evaluation_gate_rejected", run_id=run_id, reasons=failed_reasons)
            
        self.registry.update_run(manifest)
        return all_passed
