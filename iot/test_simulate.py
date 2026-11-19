from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from iot.simulate import parse_args, sample


def test_simulator_defaults_match_seeded_vehicle_and_active_trip(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["simulate.py", "--dry-run", "--count", "1"])
    args = parse_args()
    value = sample(1, datetime(2026, 1, 1, tzinfo=timezone.utc), __import__("random").Random(42), args)
    assert value["vehicle_id"] == "SR-021"
    assert value["trip_id"] == "TRP-DEMO-001"
    assert value["source"] == "simulation"
    assert 12 < value["lat"] < 14
    assert 76 < value["lon"] < 79


def test_synthetic_impact_is_reproducible_and_never_claimed_as_device(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["simulate.py", "--dry-run", "--count", "1", "--impact-at", "1"])
    args = parse_args()
    value = sample(1, datetime(2026, 1, 1, tzinfo=timezone.utc), __import__("random").Random(42), args)
    assert value["source"] == "simulation"
    assert value["emergency"] is True
    assert value["speed_kmh"] == 0.0
    assert value["harsh_brake_count"] == 1
    assert json.loads(json.dumps(value))["source"] == "simulation"
