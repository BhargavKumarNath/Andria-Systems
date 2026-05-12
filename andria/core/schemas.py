"""DataFrame schema contracts for Andria Systems.

Every domain boundary validates its DataFrame against a contract.
This catches data drift, wrong column names, and type mismatches at the
boundary — not buried inside downstream logic.

Usage:
    from andria.core.schemas import ManagerDNAContract
    df = ManagerDNAContract.validate(df)   # raises DataContractError on failure
"""
from __future__ import annotations

import polars as pl

from andria.core.exceptions import DataContractError


class _SchemaContract:
    """Base class for DataFrame schema contracts."""

    name: str = "BaseContract"
    required: dict[str, pl.DataType] = {}
    nullable: set[str] = set()

    @classmethod
    def validate(cls, df: pl.DataFrame) -> pl.DataFrame:
        missing = set(cls.required) - set(df.columns)
        if missing:
            raise DataContractError(cls.name, f"Missing columns: {sorted(missing)}")

        for col, dtype in cls.required.items():
            actual = df[col].dtype
            if actual == dtype:
                continue
            # Attempt safe cast
            try:
                df = df.with_columns(pl.col(col).cast(dtype))
            except Exception as exc:
                raise DataContractError(
                    cls.name,
                    f"Column '{col}': expected {dtype}, got {actual}. Cast failed: {exc}",
                ) from exc
        return df


# ── EDGAR Raw ─────────────────────────────────────────────────────────────────

class EDGARRawContract(_SchemaContract):
    name = "EDGARRaw"
    required = {
        "ACCESSION_NUMBER": pl.Utf8,
        "FILINGMANAGER_NAME": pl.Utf8,
        "CUSIP": pl.Utf8,
        "VALUE": pl.Utf8,
        "SSHPRNAMT": pl.Utf8,
        "PUTCALL": pl.Utf8,
        "REPORTCALENDARORQUARTER": pl.Utf8,
    }
    nullable = {"PUTCALL", "SSHPRNAMT"}


# ── Manager DNA Features ──────────────────────────────────────────────────────

class ManagerDNAContract(_SchemaContract):
    name = "ManagerDNA"
    required = {
        "manager_name": pl.Utf8,
        "avg_hhi": pl.Float64,
        "avg_put_ratio": pl.Float64,
        "log_avg_aum": pl.Float64,
        "avg_turnover": pl.Float64,
        "avg_conviction_delta": pl.Float64,
        "new_position_rate": pl.Float64,
        "exit_rate": pl.Float64,
        "avg_holding_duration_qtrs": pl.Float64,
        "top5_concentration": pl.Float64,
        "options_notional_ratio": pl.Float64,
        "shared_vote_ratio": pl.Float64,
        "amendment_rate": pl.Float64,
        "quarters_active": pl.Int32,
        "aum_volatility": pl.Float64,
    }


# ── Clustered Managers ────────────────────────────────────────────────────────

class ClusteredManagerContract(_SchemaContract):
    name = "ClusteredManager"
    required = {
        **ManagerDNAContract.required,
        "cluster_id": pl.Int32,
        "cluster_prob": pl.Float32,
        "archetype_label": pl.Utf8,
        "umap_1": pl.Float32,
        "umap_2": pl.Float32,
    }


# ── RACS Signals ──────────────────────────────────────────────────────────────

class RACSContract(_SchemaContract):
    name = "RACS"
    required = {
        "quarter": pl.Utf8,
        "cusip": pl.Utf8,
        "activist_buyers": pl.Int32,
        "strong_buys": pl.Int32,
        "total_activist_value": pl.Float64,
        "total_funds": pl.Int32,
        "conviction_raw": pl.Float64,
        "crowding_penalty": pl.Float64,
        "racs_score": pl.Float64,
        "regime_label": pl.Utf8,
        "regime_adjusted_racs": pl.Float64,
    }


# ── Regime Time Series ────────────────────────────────────────────────────────

class RegimeContract(_SchemaContract):
    name = "Regime"
    required = {
        "date": pl.Date,
        "regime_id": pl.Int32,
        "regime_label": pl.Utf8,
        "regime_prob": pl.Float32,
    }
