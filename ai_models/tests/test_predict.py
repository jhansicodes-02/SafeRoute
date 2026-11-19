"""Tests exercise real fitted artifacts; scoring claims come only from computed metadata."""
import json

import pytest

pytest.importorskip("sklearn")
pytest.importorskip("joblib")

from ai_models.predict import (LABELS, predict_accident, predict_driving, predict_route,
                               load_models)
from ai_models.train_all import METADATA_PATH


@pytest.fixture(scope="module", autouse=True)
def trained_models():
    load_models()


def test_all_inference_labels_are_from_exact_supported_classes():
    cases = [
        (predict_accident, {"accel_x": 0.1, "accel_y": 0, "accel_z": 1,
                            "gyro_x": 0, "gyro_y": 0, "gyro_z": 0}, "accident"),
        (predict_driving, {"speed_kmh": 120, "acceleration_longitudinal": 0,
                           "brake_intensity": 0, "harsh_brake_count": 0}, "driving"),
        (predict_route, {"distance_from_route_m": 100, "heading_delta_deg": 80,
                         "speed_kmh": 40, "route_progress": 0.5}, "route"),
    ]
    for function, payload, task in cases:
        result = function(payload)
        assert result["prediction"] in LABELS[task]
        assert result["provenance"] == "synthetic_training_data"
        assert 0.0 <= result["probability"] <= 1.0


def test_empty_payload_discloses_every_defaulted_field():
    result = predict_accident({})
    assert result["missing_input_fields"] == ["accel_x", "accel_y", "accel_z", "gyro_x", "gyro_y", "gyro_z"]
    assert len(result["defaults_applied"]) == 6


def test_metrics_are_read_from_training_artifacts_and_have_confusion_matrices():
    metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    assert metadata["provenance"] == "synthetic_training_data"
    assert "not real sensor data" in metadata["data_note"]
    for task, labels in LABELS.items():
        metrics = metadata["models"][task]
        assert set(metrics["labels"]) == set(labels)
        assert 0 <= metrics["accuracy"] <= 1
        assert 0 <= metrics["precision_macro"] <= 1
        assert 0 <= metrics["recall_macro"] <= 1
        assert len(metrics["confusion_matrix"]) == 2
        assert all(len(row) == 2 for row in metrics["confusion_matrix"])
        assert sum(map(sum, metrics["confusion_matrix"])) == metrics["test_rows"]
        assert metrics["test_rows"] > 0


def test_model_loading_returns_all_fitted_models():
    assert set(load_models()) == {"accident", "driving", "route"}
