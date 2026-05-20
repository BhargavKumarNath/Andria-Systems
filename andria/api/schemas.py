from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class APIResponseBase(BaseModel):
    """
    Base contract for all API responses ensuring metadata is always present.
    """
    run_id: str = Field(..., description="Unique identifier for the research run")
    experiment_timestamp: str = Field(..., description="ISO 8601 timestamp of the run")
    provenance_quality: float = Field(..., description="Coverage percentage of validated market data")
    validation_passed: bool = Field(..., description="True if the run passed all institutional gates")
    
    model_config = ConfigDict(frozen=True)


class SignalDTO(BaseModel):
    """View-model for a single trade signal."""
    ticker: str
    target_weight: float
    conviction_score: float
    regime_state: str
    
    model_config = ConfigDict(frozen=True)


class SignalsResponse(APIResponseBase):
    """API contract for delivering the latest valid signals."""
    signals: List[SignalDTO]


class RegimeStateDTO(BaseModel):
    """View-model for macro regime conditions."""
    current_regime: str
    transition_probability: float
    features: Dict[str, float]
    
    model_config = ConfigDict(frozen=True)


class RegimesResponse(APIResponseBase):
    """API contract for macro regimes."""
    regime: RegimeStateDTO


class PortfolioDiagnosticsDTO(BaseModel):
    """View-model for portfolio-level diagnostics."""
    gross_exposure: float
    net_exposure: float
    estimated_turnover: float
    cash_drag: float
    
    model_config = ConfigDict(frozen=True)


class PortfolioResponse(APIResponseBase):
    """API contract for portfolio diagnostics."""
    portfolio: PortfolioDiagnosticsDTO
