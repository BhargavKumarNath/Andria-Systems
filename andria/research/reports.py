"""Research reports generator stub."""

from __future__ import annotations
from andria.core.config import Settings
from andria.core.logging import get_logger

logger = get_logger(__name__)


class ReportGenerator:
    def __init__(self, cfg: Settings) -> None:
        self._cfg = cfg

    def generate(self, run_id: str | None = None) -> None:
        raise NotImplementedError("Implemented in Step 3")
