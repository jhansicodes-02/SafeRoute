from __future__ import annotations

import json
import secrets
from pathlib import Path

import pytest

from backend import create_app


@pytest.fixture()
def app(tmp_path: Path):
    admin_password = secrets.token_urlsafe(32)
    operator_password = secrets.token_urlsafe(32)
    device_token = secrets.token_urlsafe(32)
    app = create_app({
        "TESTING": True,
        "DATABASE": str(tmp_path / "saferoute.sqlite"),
        "EVIDENCE_DIR": str(tmp_path / "evidence"),
        "RPC_URL": "http://127.0.0.1:18545",
        "DEPLOYMENT_FILE": str(tmp_path / "missing-deployment.json"),
        "JWT_SECRET": secrets.token_urlsafe(32),
        "DEVICE_TOKEN": device_token,
        "DEMO_ADMIN_PASSWORD": admin_password,
        "DEMO_OPERATOR_PASSWORD": operator_password,
        "DEMO_MODE": True,
        "SEED_DEMO_DATA": True,
    })
    app.config["TEST_ADMIN_PASSWORD"] = admin_password
    app.config["TEST_OPERATOR_PASSWORD"] = operator_password
    return app


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def auth_headers(client, app):
    response = client.post("/api/auth/login", json={"email": app.config["DEMO_ADMIN_EMAIL"], "password": app.config["TEST_ADMIN_PASSWORD"]})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json['token']}"}


def test_health_and_role_protected_admin_views(client, auth_headers, app):
    health = client.get("/api/health")
    assert health.status_code == 200
    assert "chain" in health.json
    assert client.get("/api/admin/summary").status_code == 401
    assert client.get("/api/admin/summary", headers=auth_headers).status_code == 200

    operator_login = client.post("/api/auth/login", json={"email": app.config["DEMO_OPERATOR_EMAIL"], "password": app.config["TEST_OPERATOR_PASSWORD"]})
    operator_headers = {"Authorization": f"Bearer {operator_login.json['token']}"}
    assert client.get("/api/admin/users", headers=operator_headers).status_code == 403


def test_overview_labels_device_source_as_reported_not_confirmed(client, auth_headers):
    summary = client.get("/api/overview", headers=auth_headers)
    assert summary.status_code == 200
    assert "device_reported_records" in summary.json["stats"]
    assert "device_confirmed" not in summary.json["stats"]


def test_vehicle_trip_simulation_incident_hash_and_completion(client, auth_headers, app):
    created = client.post("/api/vehicles", headers=auth_headers, json={
        "name": "Test Transit 7", "plate": "QA-07-SR-1007", "driver": "Test Driver", "route": "Quality Loop",
    })
    assert created.status_code == 201
    vehicle = created.json["vehicle"]
    assert vehicle["chain_status"] == "unavailable"
    assert created.json["transaction"] is None

    started = client.post("/api/trips", headers=auth_headers, json={"vehicle_id": vehicle["id"], "route_id": "Quality Loop"})
    assert started.status_code == 201
    trip = started.json["trip"]
    assert trip["status"] == "active"
    assert started.json["transactions"]["trip_started"] is None

    tick = client.post("/api/simulation/tick", headers=auth_headers, json={
        "vehicle_id": vehicle["id"], "simulate_impact": True, "emergency": False,
    })
    assert tick.status_code == 201
    assert tick.json["telemetry"]["source"] == "simulation"
    assert tick.json["telemetry"]["trip_id"] == trip["id"]
    assert tick.json["telemetry"]["emergency"] is False
    assert tick.json["ai"]["accident"]["prediction"] == "Possible accident"
    assert tick.json["telemetry"]["checkpoint_id"]
    assert tick.json["incident"]["id"].startswith("INC-")
    assert tick.json["incident"]["classification"] == "Possible accident"
    incident_id = tick.json["incident"]["id"]
    assert tick.json["incident"]["source"] == "simulation"
    assert tick.json["incident"]["evidence_hash"].startswith("0x")

    verified = client.post(f"/api/incidents/{incident_id}/verify", headers=auth_headers, json={})
    assert verified.status_code == 200
    assert verified.json["integrity_match"] is True
    assert verified.json["status"] == "not_anchored"
    assert verified.json["on_chain_match"] is None

    record = tick.json["incident"]
    evidence_path = Path(record["evidence_path"])
    evidence_path.write_text('{"tampered":true}', encoding="utf-8")
    modified = client.post(f"/api/incidents/{incident_id}/verify", headers=auth_headers, json={})
    assert modified.json["integrity_match"] is False
    assert modified.json["status"] == "modified"

    complete = client.post(f"/api/trips/{trip['id']}/complete", headers=auth_headers, json={})
    assert complete.status_code == 200
    assert complete.json["trip"]["status"] == "completed"
    assert complete.json["transaction"] is None

    transactions = client.get("/api/transactions", headers=auth_headers)
    assert transactions.status_code == 200
    assert transactions.json["transactions"] == []


def test_device_token_provenance_and_invalid_sensor_payload(client, app):
    missing = client.post("/api/sensor-data", json={"vehicle_id": "SR-021"})
    assert missing.status_code == 401
    accepted = client.post("/api/sensor-data", headers={"X-Device-Token": app.config["DEVICE_TOKEN"]}, json={
        "vehicle_id": "SR-021", "trip_id": "TRP-DEMO-001", "lat": 12.972, "lon": 77.595,
        "speed_kmh": 31, "source": "device", "accel_x": 0.2, "accel_y": -0.1, "accel_z": 9.7,
    })
    assert accepted.status_code == 201
    assert accepted.json["telemetry"]["source"] == "device"
    assert accepted.json["checkpoint"]["transaction"] is None
    rejected = client.post("/api/sensor-data", headers={"X-Device-Token": app.config["DEVICE_TOKEN"]}, json={
        "vehicle_id": "SR-021", "lat": 91, "lon": 0, "source": "device",
    })
    assert rejected.status_code == 400
    assert "lat" in rejected.json["error"]


def test_signup_is_operator_and_models_report_real_metrics_metadata(client, auth_headers):
    response = client.post("/api/auth/register", json={"name": "New Operator", "email": "new@example.test", "password": secrets.token_urlsafe(24)})
    assert response.status_code == 201
    assert response.json["user"]["role"] == "operator"
    summary = client.get("/api/ai/summary", headers=auth_headers)
    assert summary.status_code == 200
    assert set(summary.json["model_metrics"]) == {"accident", "driving", "route"}
    assert summary.json["model_metrics"]["accident"]["accuracy"] == pytest.approx(0.9866666666666667)
    assert "not validated real-world" in summary.json["provenance"]
