"""Live-network verification of RiskFactorModel's Fama-French date handling.

Regression test for a real bug found on a live run: pandas_datareader's famafrench
daily reader returns a PeriodIndex, not a DatetimeIndex, so the original
is_datetime64_any_dtype branch was never taken and pl.from_pandas() silently
converted the date column to an Int64 ordinal -- breaking every downstream
join_asof against a real Date-typed trade ledger.

Marked `integration` (requires internet access to Ken French's data library via
pandas_datareader) and excluded from the default CI run.
"""
from __future__ import annotations

from datetime import date, timedelta

import polars as pl
import pytest

from andria.backtest.factors import RiskFactorModel

pytestmark = pytest.mark.integration


def test_fetch_factors_returns_real_date_dtype(tmp_path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    from andria.core.config import get_settings

    cfg = get_settings()
    cfg.market_data.cache_dir = tmp_path

    rfm = RiskFactorModel(start_date="2023-01-01")
    df = rfm.fetch_factors()

    assert df.schema["date"] == pl.Date
    assert df.height > 0


def test_orthogonalize_handles_ledger_with_preexisting_date_column(tmp_path) -> None:  # type: ignore[no-untyped-def]
    """Regression test for a real bug found on a live run: a trade ledger that
    already carries its own "date" column (as ExecutionEngine's T+1 fill-price
    asof join produces) crashed orthogonalize()'s second internal join_asof with
    "column with name 'date_right' already exists"."""
    from andria.core.config import get_settings

    cfg = get_settings()
    cfg.market_data.cache_dir = tmp_path

    d0 = date(2023, 3, 1)
    ledger = pl.DataFrame({
        "exec_date": [d0, d0 + timedelta(days=5)],
        "actual_exit_date": [d0 + timedelta(days=90), d0 + timedelta(days=95)],
        "net_fwd_return": [0.05, -0.02],
        # Simulates the stray "date" column ExecutionEngine's fill-delay join leaves behind.
        "date": [d0 + timedelta(days=1), d0 + timedelta(days=6)],
    })

    rfm = RiskFactorModel(start_date="2023-01-01")
    result = rfm.orthogonalize(ledger)  # must not raise DuplicateError
    assert "idiosyncratic_alpha" in result.columns
