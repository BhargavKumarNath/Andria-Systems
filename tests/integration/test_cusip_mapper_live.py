"""Live-network verification of CUSIPMapper's OpenFIGI resolution path.

Marked `integration` (requires internet access to api.openfigi.com) and excluded
from the default CI run — see tests/README / pyproject.toml pytest markers.
"""
from __future__ import annotations

import pytest

from andria.data.cusip_mapper import CUSIPMapper

pytestmark = pytest.mark.integration


def test_resolves_real_cusips_not_in_static_overrides(tmp_path) -> None:  # type: ignore[no-untyped-def]
    from andria.core.config import get_settings

    cfg = get_settings()
    cfg.market_data.cusip_map_path = tmp_path / "cusip_map.parquet"

    mapper = CUSIPMapper()
    # Berkshire Hathaway B and JPMorgan — real CUSIPs, deliberately NOT in
    # CUSIPMapper._STATIC_OVERRIDES, to prove the OpenFIGI path actually resolves them.
    resolved = mapper.resolve(["084670702", "46625H100"])

    assert resolved["084670702"] == "BRK/B"
    assert resolved["46625H100"] == "JPM"


def test_unmapped_cusip_returns_none_not_synthetic(tmp_path) -> None:  # type: ignore[no-untyped-def]
    from andria.core.config import get_settings

    cfg = get_settings()
    cfg.market_data.cusip_map_path = tmp_path / "cusip_map.parquet"

    mapper = CUSIPMapper()
    resolved = mapper.resolve(["000000000"])
    assert resolved["000000000"] is None
