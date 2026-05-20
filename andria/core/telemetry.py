import logging
import sys

import structlog
from prometheus_client import Counter, Gauge, Histogram

# Prometheus Metrics
PIPELINE_LATENCY = Histogram(
    "andria_pipeline_latency_seconds",
    "Time taken to execute the full pipeline",
)

DATA_FRESHNESS = Gauge(
    "andria_data_freshness_days",
    "Days since the last data update",
)

VALIDATION_FAILURES = Counter(
    "andria_validation_failures_total",
    "Total number of evaluation gate failures",
)

MODEL_DRIFT_PSI = Gauge(
    "andria_model_drift_psi",
    "Population Stability Index of the latest signals",
)


def configure_logging() -> None:
    """
    Configures standard library logging to route through structlog,
    and sets up structlog for JSON formatting in production.
    """
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=logging.INFO,
    )
    
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
