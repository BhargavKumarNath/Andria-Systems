"""WSGI entrypoint for Render (Gunicorn)."""
import os
from andria.core.config import get_settings
from andria.dashboard.app import create_app
from andria.core.logging import configure_logging

# We are in production UI context
configure_logging(level="INFO", json_logs=True)

cfg = get_settings()
app = create_app(cfg)
server = app.server

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8050))
    app.run_server(host="0.0.0.0", port=port, debug=False)
