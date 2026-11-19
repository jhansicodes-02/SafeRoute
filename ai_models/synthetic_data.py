"""Deterministic synthetic engineering-demo datasets; never real sensor observations."""
from __future__ import annotations

from pathlib import Path
import numpy as np
import pandas as pd

PROVENANCE = "synthetic_training_data"
DATA_DIR = Path(__file__).resolve().parents[1] / "datasets"

ACCIDENT_FEATURES = ["accel_x", "accel_y", "accel_z", "gyro_x", "gyro_y", "gyro_z"]
DRIVING_FEATURES = ["speed_kmh", "acceleration_longitudinal", "brake_intensity", "harsh_brake_count"]
ROUTE_FEATURES = ["distance_from_route_m", "heading_delta_deg", "speed_kmh", "route_progress"]


def _frame(features, labels):
    frame = pd.DataFrame(features, columns=features.columns if isinstance(features, pd.DataFrame) else None)
    frame["label"] = labels
    frame["provenance"] = PROVENANCE
    frame["data_note"] = "Generated synthetic engineering demo data; not real sensor data"
    return frame


def generate_accident_data(n=2400, seed=1101):
    rng = np.random.default_rng(seed)
    X = rng.normal(0, 1, (n, 6))
    y = np.full(n, "Normal movement", dtype=object)
    anomaly = rng.random(n) < 0.22
    # Sudden multi-axis shocks and rotation are deliberately represented in the labels.
    X[anomaly, :3] *= rng.uniform(3.0, 6.0, (anomaly.sum(), 3))
    X[anomaly, 3:] *= rng.uniform(2.5, 5.0, (anomaly.sum(), 3))
    y[anomaly] = "Possible accident"
    return _frame(pd.DataFrame(X, columns=ACCIDENT_FEATURES), y)


def generate_driving_data(n=2400, seed=2202):
    rng = np.random.default_rng(seed)
    speed = rng.uniform(0, 145, n)
    acceleration = rng.normal(0.1, 1.8, n)
    brake = np.clip(rng.beta(1.4, 3.5, n), 0, 1)
    harsh_count = rng.poisson(0.45, n).astype(float)
    # Overspeed and repeated/forceful braking explicitly determine risky labels.
    risky = (speed > 100) | (harsh_count >= 2) | ((brake > 0.82) & (acceleration < -1.2)) | (acceleration > 4.0)
    # Small deterministic-label boundary variation retains meaningful learnable overlap.
    y = np.where(risky, "Risky driving", "Safe")
    return _frame(pd.DataFrame({"speed_kmh": speed, "acceleration_longitudinal": acceleration,
                                "brake_intensity": brake, "harsh_brake_count": harsh_count}), y)


def generate_route_data(n=2400, seed=3303):
    rng = np.random.default_rng(seed)
    distance = np.clip(rng.gamma(2.0, 16.0, n), 0, 220)
    heading = np.clip(np.abs(rng.normal(10, 17, n)), 0, 180)
    speed = rng.uniform(0, 120, n)
    progress = rng.uniform(0, 1, n)
    deviation = (distance > 45) | ((heading > 55) & (distance > 20))
    labels = np.where(deviation, "Route deviation", "Normal route")
    return _frame(pd.DataFrame({"distance_from_route_m": distance, "heading_delta_deg": heading,
                                "speed_kmh": speed, "route_progress": progress}), labels)


def generate_all(output_dir=DATA_DIR):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    generated = {
        "accident_detection.csv": generate_accident_data(),
        "driver_behavior.csv": generate_driving_data(),
        "route_anomaly.csv": generate_route_data(),
    }
    for filename, frame in generated.items():
        frame.to_csv(output_dir / filename, index=False)
    return generated
