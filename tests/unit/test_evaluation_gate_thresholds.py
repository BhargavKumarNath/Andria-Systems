"""The exported validation.json and EvaluationGate must apply the same thresholds.

Regression: pipeline.py once marked provenance as passed at >=70% coverage while
EvaluationGate (and the threshold printed beside it) required 90%, so the
dashboard showed 82.1% provenance as a pass on a run the gate had rejected.
"""

import json
import math
from pathlib import Path

import pytest

from andria.core.evaluation_gate import (
    PBO_THRESHOLD,
    PROVENANCE_THRESHOLD,
    pbo_passes,
    provenance_passes,
)

VALIDATION_JSON = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "validation.json"


@pytest.mark.parametrize(
    ("quality", "expected"),
    [(0.821, False), (0.70, False), (0.8999, False), (0.90, True), (1.0, True)],
)
def test_provenance_threshold(quality: float, expected: bool) -> None:
    assert provenance_passes(quality) is expected


@pytest.mark.parametrize(("score", "expected"), [(0.39, True), (0.40, True), (0.41, False), (math.nan, False)])
def test_pbo_threshold_fails_closed_on_nan(score: float, expected: bool) -> None:
    assert pbo_passes(score) is expected


def test_exported_validation_agrees_with_gate_thresholds() -> None:
    data = json.loads(VALIDATION_JSON.read_text())
    prov = data["checks"]["provenance_threshold"]
    assert prov["threshold"] == PROVENANCE_THRESHOLD
    assert prov["passed"] is provenance_passes(prov["value"])

    pbo = data["checks"]["pbo_validation"]
    assert pbo["threshold"] == PBO_THRESHOLD
    if pbo["value"] is None:
        assert pbo["passed"] is False

    # The headline flag must be the conjunction of the individual checks.
    assert data["gate_passed"] is all(c["passed"] for c in data["checks"].values())
