"""Train and evaluate synthetic-data demo classifiers.

Run from the repository root: python3 -m ai_models.train_all
All scores in metadata are computed from the held-out synthetic test split.
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .synthetic_data import (ACCIDENT_FEATURES, DATA_DIR, DRIVING_FEATURES, PROVENANCE,
                             ROUTE_FEATURES, generate_all)

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models"
METADATA_PATH = MODEL_DIR / "metrics.json"
SEED = 20261118
TASKS = {
    "accident": ("accident_detection.csv", ACCIDENT_FEATURES, ["Normal movement", "Possible accident"]),
    "driving": ("driver_behavior.csv", DRIVING_FEATURES, ["Safe", "Risky driving"]),
    "route": ("route_anomaly.csv", ROUTE_FEATURES, ["Normal route", "Route deviation"]),
}


def _evaluate(y_true, y_pred, labels):
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=labels, zero_division=0)
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision_macro": float(np.mean(precision)),
        "recall_macro": float(np.mean(recall)),
        "f1_macro": float(np.mean(f1)),
        "labels": list(labels),
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=labels).tolist(),
        "confusion_matrix_label_order": list(labels),
        "test_support_by_label": {label: int(count) for label, count in zip(labels, support)},
    }


def train_all():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    generated = generate_all(DATA_DIR)
    metadata = {
        "provenance": PROVENANCE,
        "data_note": "All training/evaluation rows are generated synthetic engineering demo data, not real sensor data.",
        "random_seed": SEED,
        "test_size": 0.25,
        "split": "stratified train_test_split",
        "preprocessing": "median SimpleImputer then StandardScaler in a fitted sklearn Pipeline",
        "models": {},
    }
    for name, (filename, features, labels) in TASKS.items():
        frame = generated[filename]
        X, y = frame[features], frame["label"]
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.25, random_state=SEED, stratify=y)
        model = Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            ("classifier", RandomForestClassifier(n_estimators=160, min_samples_leaf=2,
                                                   class_weight="balanced", random_state=SEED,
                                                   n_jobs=1)),
        ])
        model.fit(X_train, y_train)
        result = _evaluate(y_test, model.predict(X_test), labels)
        model_path = MODEL_DIR / f"{name}_model.joblib"
        joblib.dump(model, model_path)
        metadata["models"][name] = {
            **result,
            "model": "sklearn Pipeline(SimpleImputer, StandardScaler, RandomForestClassifier)",
            "model_file": model_path.name,
            "dataset_file": filename,
            "feature_names": features,
            "dataset_rows": int(len(frame)),
            "train_rows": int(len(X_train)),
            "test_rows": int(len(X_test)),
            "class_counts": {label: int((y == label).sum()) for label in labels},
        }
    temp = METADATA_PATH.with_suffix(".json.tmp")
    temp.write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temp.replace(METADATA_PATH)
    return metadata


def main():
    metadata = train_all()
    print(f"Trained {len(metadata['models'])} models on generated synthetic data.")
    for name, values in metadata["models"].items():
        print(f"{name}: accuracy={values['accuracy']:.4f}, precision_macro={values['precision_macro']:.4f}, "
              f"recall_macro={values['recall_macro']:.4f}; confusion_matrix={values['confusion_matrix']}")


if __name__ == "__main__":
    main()
