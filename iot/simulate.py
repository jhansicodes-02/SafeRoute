#!/usr/bin/env python3
"""Deterministic synthetic SafeRoute sensor-data simulator (not physical readings)."""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import requests


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--url", default="http://127.0.0.1:5000/api/sensor-data", help="Flask sensor endpoint")
    p.add_argument("--vehicle-id", default="SR-021", help="Defaults to the seeded simulation vehicle")
    p.add_argument("--trip-id", default="TRP-DEMO-001", help="Defaults to the seeded active trip; use --no-trip-id for JSON null")
    p.add_argument("--no-trip-id", action="store_true")
    p.add_argument("--interval", type=float, default=1.0, help="Seconds between posts (must be > 0)")
    p.add_argument("--count", type=int, default=0, help="Number of samples; 0 runs until Ctrl-C")
    p.add_argument("--seed", type=int, default=42, help="Seed for reproducible synthetic sensor values")
    p.add_argument("--start-time", help="Optional ISO-8601 timestamp; defaults to current UTC")
    p.add_argument("--impact-at", type=int, metavar="N", help="Inject one synthetic impact/emergency at sample N (1-based)")
    p.add_argument("--emergency-at", type=int, metavar="N", help="Inject one synthetic emergency at sample N (1-based)")
    p.add_argument("--dry-run", action="store_true", help="Print JSON without making network requests")
    p.add_argument("--timeout", type=float, default=5.0, help="HTTP timeout in seconds")
    p.add_argument("--device-token", default=os.getenv("SAFEROUTE_DEVICE_TOKEN", ""), help="Optional X-Device-Token (or set SAFEROUTE_DEVICE_TOKEN)")
    a = p.parse_args()
    if not a.vehicle_id.strip():
        p.error("--vehicle-id cannot be empty")
    if a.interval <= 0 or a.timeout <= 0:
        p.error("--interval and --timeout must be greater than zero")
    if a.count < 0:
        p.error("--count cannot be negative")
    for name in ("impact_at", "emergency_at"):
        value = getattr(a, name)
        if value is not None and value < 1:
            p.error(f"--{name.replace('_', '-')} must be >= 1")
    if a.start_time:
        try:
            dt = datetime.fromisoformat(a.start_time.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                p.error("--start-time must include a timezone (prefer UTC Z)")
            a.start_time_parsed = dt.astimezone(timezone.utc)
        except ValueError as exc:
            p.error(f"invalid --start-time: {exc}")
    else:
        a.start_time_parsed = datetime.now(timezone.utc)
    return a


def sample(n: int, at: datetime, rng: random.Random, args: argparse.Namespace) -> dict[str, Any]:
    # Entirely fabricated, bounded road-like trace around a fixed demo location.
    t = n * args.interval
    impact = args.impact_at == n
    emergency = impact or args.emergency_at == n
    speed = max(0.0, 38.0 + 4.5 * math.sin(t / 12.0) + rng.uniform(-0.7, 0.7))
    brake = 0.92 if impact else (0.75 if args.emergency_at == n else 0.0)
    return {
        "vehicle_id": args.vehicle_id,
        "trip_id": None if args.no_trip_id else args.trip_id,
        "timestamp": at.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "lat": 12.9715 + t * 0.000006 + rng.uniform(-0.000002, 0.000002),
        "lon": 77.5940 + t * 0.000008 + rng.uniform(-0.000002, 0.000002),
        "speed_kmh": round(0.0 if impact else speed, 2),
        "accel_x": round(-9.0 if impact else rng.uniform(-0.35, 0.35), 3),
        "accel_y": round(rng.uniform(-0.25, 0.25), 3),
        "accel_z": round(9.80665 + (7.5 if impact else 0) + rng.uniform(-0.15, 0.15), 3),
        "gyro_x": round(rng.uniform(-0.04, 0.04), 4),
        "gyro_y": round(rng.uniform(-0.04, 0.04), 4),
        "gyro_z": round(rng.uniform(-0.08, 0.08), 4),
        "acceleration_longitudinal": round(-8.5 if impact else (-4.2 if args.emergency_at == n else rng.uniform(-0.6, 0.4)), 3),
        "brake_intensity": brake,
        "harsh_brake_count": int(impact or args.emergency_at == n),
        "distance_from_route_m": round(abs(rng.gauss(3.0, 1.4)), 2),
        "heading_delta_deg": round(rng.uniform(-4.0, 4.0), 2),
        "route_progress": round(min(1.0, (n - 1) * args.interval / 600.0), 4),
        "emergency": bool(emergency),
        "source": "simulation",
    }


def main() -> int:
    args = parse_args()
    rng = random.Random(args.seed)
    print("SYNTHETIC DEMO ONLY: values are fabricated and do not represent any physical device.", file=sys.stderr)
    if args.impact_at:
        print(f"A one-shot synthetic impact/emergency will be injected at sample {args.impact_at}.", file=sys.stderr)
    if args.emergency_at:
        print(f"A one-shot synthetic emergency will be injected at sample {args.emergency_at}.", file=sys.stderr)
    n = 0
    try:
        while args.count == 0 or n < args.count:
            n += 1
            payload = sample(n, args.start_time_parsed + timedelta(seconds=(n - 1) * args.interval), rng, args)
            if args.dry_run:
                print(json.dumps(payload, separators=(",", ":")), flush=True)
            else:
                try:
                    headers = {"X-Device-Token": args.device_token} if args.device_token else None
                    response = requests.post(args.url, json=payload, headers=headers, timeout=args.timeout)
                    print(f"sample {n}: HTTP {response.status_code}" + (f" {response.text[:300]}" if not response.ok else ""), flush=True)
                except requests.RequestException as exc:
                    print(f"sample {n}: network/API error: {exc}", file=sys.stderr, flush=True)
            if args.count == 0 or n < args.count:
                time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nStopped by user.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
