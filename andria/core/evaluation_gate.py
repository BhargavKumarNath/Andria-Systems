import structlog
from pydantic import BaseModel

from andria.core.artifact_registry import ArtifactRegistry

logger = structlog.get_logger(__name__)


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
                passed=provenance_quality >= 0.90,
                reason=f"Provenance {provenance_quality:.2f} below 0.90 threshold" if provenance_quality < 0.90 else "Pass"
            ),
            "reproducibility": GateCheckResult(
                passed=reproducibility_passed,
                reason="Deterministic reproducibility failed" if not reproducibility_passed else "Pass"
            ),
            "pbo_validation": GateCheckResult(
                passed=pbo_score <= 0.40,
                reason=f"PBO score {pbo_score:.2f} exceeds 0.40 limit" if pbo_score > 0.40 else "Pass"
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
