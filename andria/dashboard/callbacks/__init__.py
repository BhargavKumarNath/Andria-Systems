"""andria.dashboard.callbacks — registers all Dash callbacks."""
from __future__ import annotations

import dash
from andria.core.config import Settings


def register_all(app: dash.Dash, cfg: Settings) -> None:
    """Register all page callbacks. Called once by app factory."""
    # Callbacks implemented in Step 3
    pass
