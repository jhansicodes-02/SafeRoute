"""Backend-friendly inference over locally trained synthetic-demo models."""
from __future__ import annotations

import json
from pathlib import Path
from threading import RLock

import joblib
import pandas as pd

from .train_all import METADATA_PATH, MODEL_DIR, TASKS, train_all
from .synthetic_data import ACCIDENT_FEATURES, DRIVING_FEATURES, ROUTE_FEATURES

_LOCK = RLock()
_CACHE = {}
FEATURES = {"accident": ACCIDENT_FEATURES, "driving": DRIVING_FEATURES, "route": ROUTE_FEATURES}
LABELS = {
    "accident": ("Normal movement", "Possible accident"),
    "driving": ("Safe", "Risky driving"),
    "route": ("Normal route", "Route deviation"),
}


def load_models():
    """Load every artifact; train them on deterministic synthetic data if absent."""
    with _LOCK:
        expected = [MODEL_DIR / f"{name}_model.joblib" for name in TASKS]
        if not METADATA_PATH.exists() or not all(path.exists() for path in expected):
            train_all()
        metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
        loaded = {name: joblib.load(MODEL_DIR / f"{name}_model.joblib") for name in TASKS}
        _CACHE.clear()
        _CACHE.update(loaded)
        return dict(_CACHE)


def _predict(task, payload):
    if not isinstance(payload, dict):
        raise TypeError("payload must be a dictionary")
    with _LOCK:
        if len(_CACHE) != len(TASKS):
            load_models()
        model = _CACHE[task]
        features = FEATURES[task]
        missing = [feature for feature in features if feature not in payload or payload[feature] is None]
        row = {feature: (0.0 if feature in missing else float(payload[feature])) for feature in features}
        X = pd.DataFrame([row], columns=features)
        prediction = str(model.predict(X)[0])
        probability = None
        risk_probability = None
        if hasattr(model, "predict_proba"):
            probabilities = model.predict_proba(X)[0]
            probability = float(probabilities[list(model.classes_).index(prediction)])
            adverse_label = LABELS[task][1]
            risk_probability = float(probabilities[list(model.classes_).index(adverse_label)])
        if prediction not in LABELS[task]:
            raise RuntimeError(f"Unexpected model label for {task}: {prediction}")
        metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
        metrics = metadata.get("models", {}).get(task)
        result = {
            "prediction": prediction,
            "risk": risk_probability,
            "probability": probability,
            "model": metrics.get("model") if metrics else "sklearn Pipeline (local model)",
            "provenance": "synthetic_training_data",
            "training_metrics": metrics,
            "missing_input_fields": missing,
            "defaults_applied": {field: 0 for field in missing},
        }
        return result


def predict_accident(payload):
    return _predict("accident", payload)


def predict_driving(payload):
    return _predict("driving", payload)


def predict_route(payload):
    return _predict("route", payload)
