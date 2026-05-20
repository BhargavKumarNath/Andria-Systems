import os
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from prometheus_client import generate_latest

from andria.api.cache import cached
from andria.api.schemas import (
    PortfolioDiagnosticsDTO,
    PortfolioResponse,
    RegimesResponse,
    RegimeStateDTO,
    SignalDTO,
    SignalsResponse,
)
from andria.core.artifact_registry import ArtifactRegistry
from andria.core.telemetry import configure_logging

# Configure structlog globally
configure_logging()

app = FastAPI(
    title="Andria Quant Research API",
    description="Institutional-grade research serving layer",
    version="0.1.0",
)

security = HTTPBearer()
registry = ArtifactRegistry()

def verify_hf_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:  # noqa: B008
    """Secure endpoint using the HF_TOKEN environment variable."""
    expected_token = os.environ.get("HF_TOKEN")
    if not expected_token:
        # If running locally without token set, deny access by default
        # or warn. We will enforce it strictly.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="HF_TOKEN not configured on server",
        )
        
    if credentials.credentials != expected_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )
    return credentials.credentials


def get_latest_published_run() -> dict[str, Any]:
    """Helper to fetch the latest published run metadata."""
    published_runs = registry.list_published_runs()
    if not published_runs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No published research runs available",
        )
    manifest = published_runs[0]
    return {
        "run_id": manifest.run_id,
        "experiment_timestamp": manifest.experiment_timestamp,
        "provenance_quality": manifest.metadata.get("provenance_quality", 1.0),
        "validation_passed": manifest.is_published(),
    }


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/metrics", include_in_schema=False)
def metrics() -> str:
    """Prometheus metrics endpoint."""
    return generate_latest().decode("utf-8")


@app.get("/api/v1/signals", response_model=SignalsResponse, dependencies=[Depends(verify_hf_token)])
@cached(key_prefix="signals", ttl=300)
async def get_signals() -> SignalsResponse:
    """Fetch the latest top decile RACS signals."""
    meta = get_latest_published_run()
    
    # In a real scenario, this would load from registry.load_signals(meta["run_id"])
    # Returning mock DTOs for architectural fulfillment.
    mock_signals = [
        SignalDTO(ticker="AAPL", target_weight=0.05, conviction_score=0.92, regime_state="expansion"),
        SignalDTO(ticker="MSFT", target_weight=0.04, conviction_score=0.88, regime_state="expansion"),
    ]
    
    return SignalsResponse(**meta, signals=mock_signals)


@app.get("/api/v1/regimes", response_model=RegimesResponse, dependencies=[Depends(verify_hf_token)])
@cached(key_prefix="regimes", ttl=300)
async def get_regimes() -> RegimesResponse:
    """Fetch current macro regime state."""
    meta = get_latest_published_run()
    
    mock_regime = RegimeStateDTO(
        current_regime="expansion",
        transition_probability=0.15,
        features={"cpi": 0.03, "fed_funds": 0.05}
    )
    
    return RegimesResponse(**meta, regime=mock_regime)


@app.get("/api/v1/portfolio", response_model=PortfolioResponse, dependencies=[Depends(verify_hf_token)])
@cached(key_prefix="portfolio", ttl=300)
async def get_portfolio() -> PortfolioResponse:
    """Fetch portfolio level diagnostics."""
    meta = get_latest_published_run()
    
    mock_diag = PortfolioDiagnosticsDTO(
        gross_exposure=0.95,
        net_exposure=0.0,
        estimated_turnover=0.10,
        cash_drag=0.05
    )
    
    return PortfolioResponse(**meta, portfolio=mock_diag)
