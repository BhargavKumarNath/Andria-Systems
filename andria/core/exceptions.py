"""Domain exceptions for Andria Systems.

All exceptions are typed and carry structured context.
Never raise bare Exception — always raise a domain-specific subclass.
"""
from __future__ import annotations


class AndriaError(Exception):
    """Base exception for all Andria domain errors."""


class ConfigurationError(AndriaError):
    """Raised when configuration is invalid or missing."""


class DataContractError(AndriaError):
    """Raised when a DataFrame violates its expected schema contract."""

    def __init__(self, contract: str, detail: str) -> None:
        self.contract = contract
        self.detail = detail
        super().__init__(f"[{contract}] {detail}")


class DataNotFoundError(AndriaError):
    """Raised when a required dataset or artifact is missing."""

    def __init__(self, path: str) -> None:
        self.path = path
        super().__init__(f"Dataset not found: {path}")


class IngestionError(AndriaError):
    """Raised when a data ingestion step fails."""


class PipelineError(AndriaError):
    """Raised when an orchestration pipeline step fails."""

    def __init__(self, stage: str, cause: Exception) -> None:
        self.stage = stage
        self.cause = cause
        super().__init__(f"Pipeline failed at stage '{stage}': {cause}")


class ClusteringError(AndriaError):
    """Raised when clustering produces invalid or degenerate results."""


class SignalError(AndriaError):
    """Raised when signal generation encounters invalid state."""


class ArtifactError(AndriaError):
    """Raised when an artifact cannot be read or written."""
