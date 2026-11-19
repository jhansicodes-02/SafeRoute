from __future__ import annotations

import json
import math
import random
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone
from flask import Blueprint, current_app, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from backend.chain import ChainClient
from backend.database import get_db, row_to_dict, utc_now
from backend.evidence import hash_evidence_file, write_evidence
from backend.security import auth_required, issue_token, sensor_ingest_required

api = Blueprint("api", __name__)


def _client() -> ChainClient:
    return ChainClient(current_app.config["RPC_URL"], current_app.config["DEPLOYMENT_FILE"])


def _body() -> dict:
    value = request.get_json(silent=True)
    return value if isinstance(value, dict) else {}


def _bad(message: str, status: int = 400):
    return jsonify({"error": message}), status


def _chain_state(client: ChainClient) -> str:
    return "available" if client.status()["available"] else "unavailable"


def _record_tx(db: sqlite3.Connection, receipt: dict | None, record_id: str, event_type: str, details: dict) -> None:
    if not receipt or not receipt.get("tx_hash"):
        return
    db.execute(
        "INSERT OR IGNORE INTO transactions(record_id,event_type,tx_hash,block_number,chain_id,timestamp,details_json) VALUES (?,?,?,?,?,?,?)",
        (record_id, event_type, receipt["tx_hash"], receipt["block_number"], receipt["chain_id"], receipt["timestamp"], json.dumps(details, sort_keys=True)),
    )


def _ai(payload: dict) -> dict:
    try:
        from ai_models.predict import predict_accident, predict_driving, predict_route
        return {
            "accident": predict_accident(payload),
            "driving": predict_driving(payload),
            "route": predict_route(payload),
        }
    except Exception as exc:
        return {
            "accident": {"prediction": "Unavailable", "error": str(exc)[:160], "provenance": "unavailable"},
            "driving": {"prediction": "Unavailable", "error": str(exc)[:160], "provenance": "unavailable"},
            "route": {"prediction": "Unavailable", "error": str(exc)[:160], "provenance": "unavailable"},
        }


def _make_incident(db: sqlite3.Connection, client: ChainClient, *, vehicle_id: str, trip_id: str | None, classification: str, severity: str, source: str, occurred_at: str, evidence: dict, ai_output: dict) -> dict:
    incident_id = f"INC-{datetime.now(timezone.utc).strftime('%y%m%d')}-{secrets.token_hex(3).upper()}"
    report = {
        "incident_id": incident_id,
        "vehicle_id": vehicle_id,
        "trip_id": trip_id,
        "classification": classification,
        "severity": severity,
        "source": source,
        "occurred_at": occurred_at,
        "ai_output": ai_output,
        "sensor_evidence": evidence,
    }
    path, digest = write_evidence(current_app.config["EVIDENCE_DIR"], incident_id, report)
    receipt = client.register_incident(incident_id, trip_id, digest, severity, occurred_at)
    chain_status = "anchored" if receipt else ("unavailable" if not client.status()["available"] else "not_anchored")
    db.execute(
        """INSERT INTO incidents(id,vehicle_id,trip_id,classification,severity,source,status,occurred_at,evidence_hash,evidence_path,chain_status,tx_hash,block_number,ai_output_json,details_json)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (incident_id, vehicle_id, trip_id, classification, severity, source, "open", occurred_at, digest, path, chain_status,
         receipt.get("tx_hash") if receipt else None, receipt.get("block_number") if receipt else None,
         json.dumps(ai_output, sort_keys=True), json.dumps(report, sort_keys=True)),
    )
    _record_tx(db, receipt, incident_id, "incident_registered", {"vehicle_id": vehicle_id, "trip_id": trip_id, "evidence_hash": digest, "severity": severity})
    return _incident_row(db.execute("SELECT * FROM incidents WHERE id=?", (incident_id,)).fetchone())


def _incident_row(row) -> dict | None:
    value = row_to_dict(row)
    if value:
        value["ai_output"] = json.loads(value.pop("ai_output_json"))
        value["details"] = json.loads(value.pop("details_json"))
    return value


def _sensor_number(data: dict, key: str, default: float, low: float, high: float) -> float:
    value = data.get(key, default)
    try:
        value = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{key} must be numeric")
    if not math.isfinite(value) or value < low or value > high:
        raise ValueError(f"{key} is outside its accepted range")
    return value


def _telemetry_row(row) -> dict:
    item = dict(row)
    item["payload"] = json.loads(item.pop("payload_json"))
    item["emergency"] = bool(item["emergency"])
    return item


@api.post("/auth/register")
def register():
    data = _body()
    name, email, password = str(data.get("name", "")).strip(), str(data.get("email", "")).strip().lower(), str(data.get("password", ""))
    if len(name) < 2 or "@" not in email or len(password) < 10:
        return _bad("Enter a name, valid email, and password of at least 10 characters.")
    user_id = f"usr-{uuid.uuid4().hex[:12]}"
    db = get_db()
    try:
        db.execute("INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)", (user_id, email, name, generate_password_hash(password), "operator", utc_now()))
        db.commit()
    except sqlite3.IntegrityError:
        return _bad("An account with that email already exists.", 409)
    user = db.execute("SELECT id,email,name,role,created_at FROM users WHERE id=?", (user_id,)).fetchone()
    return jsonify({"token": issue_token(user_id), "user": dict(user)}), 201


@api.post("/auth/login")
def login():
    data = _body()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    user = get_db().execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return _bad("Email or password is incorrect.", 401)
    return jsonify({"token": issue_token(user["id"]), "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}})


@api.get("/auth/me")
@auth_required()
def me():
    return jsonify({"user": g.user})


@api.get("/health")
def api_health():
    chain = _client().status()
    return jsonify({"status": "ok", "service": "saferoute-api", "chain": chain})


@api.get("/overview")
@auth_required()
def overview():
    db = get_db()
    chain = _client().status()
    stats = {
        "total_vehicles": db.execute("SELECT COUNT(*) FROM vehicles").fetchone()[0],
        "active_trips": db.execute("SELECT COUNT(*) FROM trips WHERE status='active'").fetchone()[0],
        "completed_trips": db.execute("SELECT COUNT(*) FROM trips WHERE status='completed'").fetchone()[0],
        "detected_incidents": db.execute("SELECT COUNT(*) FROM incidents").fetchone()[0],
        "unsafe_driving_alerts": db.execute("SELECT COUNT(*) FROM telemetry WHERE driving_prediction='Risky driving'").fetchone()[0],
        "route_deviations": db.execute("SELECT COUNT(*) FROM telemetry WHERE route_prediction='Route deviation'").fetchone()[0],
        "verified_records": db.execute("SELECT COUNT(*) FROM transactions").fetchone()[0],
        "device_reported_records": db.execute("SELECT COUNT(*) FROM telemetry WHERE source='device'").fetchone()[0],
        "simulation_records": db.execute("SELECT COUNT(*) FROM telemetry WHERE source='simulation'").fetchone()[0],
    }
    alerts = [_incident_row(r) for r in db.execute("SELECT * FROM incidents ORDER BY occurred_at DESC LIMIT 5").fetchall()]
    vehicles = db.execute("SELECT * FROM vehicles ORDER BY id").fetchall()
    return jsonify({"stats": stats, "chain": chain, "alerts": alerts, "vehicles": [dict(v) for v in vehicles], "demo_mode": current_app.config["DEMO_MODE"]})


@api.get("/vehicles")
@auth_required()
def vehicles():
    rows = get_db().execute("SELECT * FROM vehicles ORDER BY id").fetchall()
    return jsonify({"vehicles": [dict(row) for row in rows]})


@api.post("/vehicles")
@auth_required("admin", "operator")
def create_vehicle():
    data = _body()
    name = str(data.get("name", "")).strip()
    plate = str(data.get("plate", "")).strip().upper()
    driver = str(data.get("driver", "Unassigned")).strip() or "Unassigned"
    route = str(data.get("route", "Unassigned route")).strip() or "Unassigned route"
    if len(name) < 2 or len(plate) < 4:
        return _bad("Vehicle name and registration plate are required.")
    vehicle_id = f"SR-{secrets.token_hex(2).upper()}"
    blockchain_id = "0x" + ChainClient.identifier(vehicle_id).hex()
    db = get_db()
    client = _client()
    receipt = client.register_vehicle(vehicle_id, vehicle_id, "")
    state = "anchored" if receipt else ("not_anchored" if client.status()["contract_deployed"] else "unavailable")
    try:
        db.execute(
            "INSERT INTO vehicles(id,name,plate,driver,route,blockchain_id,chain_status,source,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (vehicle_id, name, plate, driver, route, blockchain_id, state, "simulation", utc_now()),
        )
        _record_tx(db, receipt, vehicle_id, "vehicle_registered", {"vehicle_id": vehicle_id, "blockchain_id": blockchain_id})
        db.commit()
    except sqlite3.IntegrityError:
        return _bad("That plate is already registered. Please check it and try again.", 409)
    row = db.execute("SELECT * FROM vehicles WHERE id=?", (vehicle_id,)).fetchone()
    return jsonify({"vehicle": dict(row), "transaction": receipt, "chain": client.status(), "notice": None if receipt else "Vehicle saved locally; no on-chain transaction was created."}), 201


@api.get("/vehicles/<vehicle_id>")
@auth_required()
def vehicle_detail(vehicle_id: str):
    db = get_db()
    row = db.execute("SELECT * FROM vehicles WHERE id=?", (vehicle_id,)).fetchone()
    if row is None:
        return _bad("Vehicle was not found.", 404)
    trips = db.execute("SELECT * FROM trips WHERE vehicle_id=? ORDER BY started_at DESC", (vehicle_id,)).fetchall()
    latest = db.execute("SELECT * FROM telemetry WHERE vehicle_id=? ORDER BY timestamp DESC LIMIT 1", (vehicle_id,)).fetchone()
    return jsonify({"vehicle": dict(row), "trips": [dict(v) for v in trips], "latest": _telemetry_row(latest) if latest else None})


@api.get("/trips")
@auth_required()
def trips():
    rows = get_db().execute("""SELECT t.*,v.name AS vehicle_name,v.plate AS vehicle_plate,v.driver AS driver_name,
      v.blockchain_id AS vehicle_blockchain_id FROM trips t JOIN vehicles v ON v.id=t.vehicle_id ORDER BY t.started_at DESC""").fetchall()
    return jsonify({"trips": [dict(row) for row in rows]})


@api.post("/trips")
@auth_required("admin", "operator")
def create_trip():
    data = _body()
    vehicle_id = str(data.get("vehicle_id", "")).strip()
    route_id = str(data.get("route_id", "")).strip()
    if not vehicle_id or len(route_id) < 2:
        return _bad("Select a vehicle and enter a route.")
    db = get_db()
    vehicle = db.execute("SELECT * FROM vehicles WHERE id=?", (vehicle_id,)).fetchone()
    if vehicle is None:
        return _bad("Vehicle was not found.", 404)
    active = db.execute("SELECT id FROM trips WHERE vehicle_id=? AND status='active'", (vehicle_id,)).fetchone()
    if active:
        return _bad(f"Vehicle {vehicle_id} already has active trip {active['id']}.", 409)
    trip_id = f"TRP-{datetime.now(timezone.utc).strftime('%y%m%d')}-{secrets.token_hex(3).upper()}"
    started = utc_now()
    client = _client()
    vehicle_receipt = None
    trip_registration_receipt = None
    start_receipt = None
    if client.status()["available"]:
        if not client.vehicle_exists(vehicle_id):
            vehicle_receipt = client.register_vehicle(vehicle_id, vehicle["plate"], "")
            if vehicle_receipt:
                db.execute("UPDATE vehicles SET blockchain_id=?,chain_status='anchored' WHERE id=?", ("0x" + client.identifier(vehicle_id).hex(), vehicle_id))
                _record_tx(db, vehicle_receipt, vehicle_id, "vehicle_registered", {"vehicle_id": vehicle_id, "blockchain_id": "0x" + client.identifier(vehicle_id).hex()})
        if client.vehicle_exists(vehicle_id):
            trip_registration_receipt = client.register_trip(trip_id, vehicle_id, route_id)
            if trip_registration_receipt:
                _record_tx(db, trip_registration_receipt, trip_id, "trip_registered", {"vehicle_id": vehicle_id, "route_id": route_id})
                start_receipt = client.start_trip(trip_id)
                _record_tx(db, start_receipt, trip_id, "trip_started", {"vehicle_id": vehicle_id, "route_id": route_id})
    chain_state = "anchored" if start_receipt else ("partially_anchored" if trip_registration_receipt else ("not_anchored" if client.status()["available"] else "unavailable"))
    db.execute("INSERT INTO trips(id,vehicle_id,route_id,status,source,chain_status,started_at,start_tx_hash) VALUES(?,?,?,?,?,?,?,?)", (trip_id, vehicle_id, route_id, "active", "simulation", chain_state, started, start_receipt.get("tx_hash") if start_receipt else None))
    db.commit()
    return jsonify({"trip": dict(db.execute("SELECT * FROM trips WHERE id=?", (trip_id,)).fetchone()), "transactions": {"vehicle_registration": vehicle_receipt, "trip_registration": trip_registration_receipt, "trip_started": start_receipt}, "notice": None if start_receipt else "Trip is active in the application store; review the transaction list to see which chain lifecycle writes, if any, succeeded."}), 201


@api.post("/trips/<trip_id>/complete")
@auth_required("admin", "operator")
def complete_trip(trip_id: str):
    db = get_db()
    trip = db.execute("SELECT * FROM trips WHERE id=?", (trip_id,)).fetchone()
    if trip is None:
        return _bad("Trip was not found.", 404)
    if trip["status"] != "active":
        return _bad("This trip is already completed.", 409)
    completed = utc_now()
    client = _client()
    receipt = client.complete_trip(trip_id)
    chain_state = "anchored" if receipt else trip["chain_status"]
    db.execute("UPDATE trips SET status='completed',completed_at=?,chain_status=?,complete_tx_hash=? WHERE id=?", (completed, chain_state, receipt.get("tx_hash") if receipt else None, trip_id))
    _record_tx(db, receipt, trip_id, "trip_completed", {"vehicle_id": trip["vehicle_id"], "route_id": trip["route_id"]})
    db.commit()
    return jsonify({"trip": dict(db.execute("SELECT * FROM trips WHERE id=?", (trip_id,)).fetchone()), "transaction": receipt, "notice": None if receipt else "Trip completed in the application store; no chain receipt is available."})


@api.get("/tracking")
@auth_required()
def tracking():
    rows = get_db().execute("""SELECT v.*,t.id AS active_trip_id,t.route_id AS active_route_id,t.status AS trip_status
       FROM vehicles v LEFT JOIN trips t ON t.vehicle_id=v.id AND t.status='active' ORDER BY v.id""").fetchall()
    return jsonify({"vehicles": [dict(row) for row in rows], "provenance": "Locations without device source are sample simulation coordinates."})


@api.post("/sensor-data")
@sensor_ingest_required
def submit_sensor_data():
    data = _body()
    vehicle_id = str(data.get("vehicle_id", "")).strip()
    source = str(data.get("source", "simulation"))
    if source not in ("simulation", "device"):
        return _bad("source must be simulation or device.")
    timestamp = str(data.get("timestamp", utc_now()))
    try:
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        normalized = {
            "vehicle_id": vehicle_id,
            "trip_id": str(data["trip_id"]).strip() if data.get("trip_id") else None,
            "timestamp": timestamp,
            "lat": _sensor_number(data, "lat", 12.9716, -90, 90),
            "lon": _sensor_number(data, "lon", 77.5946, -180, 180),
            "speed_kmh": _sensor_number(data, "speed_kmh", 0, 0, 220),
            "accel_x": _sensor_number(data, "accel_x", 0, -80, 80),
            "accel_y": _sensor_number(data, "accel_y", 0, -80, 80),
            "accel_z": _sensor_number(data, "accel_z", 9.81, -80, 80),
            "gyro_x": _sensor_number(data, "gyro_x", 0, -60, 60),
            "gyro_y": _sensor_number(data, "gyro_y", 0, -60, 60),
            "gyro_z": _sensor_number(data, "gyro_z", 0, -60, 60),
            "acceleration_longitudinal": _sensor_number(data, "acceleration_longitudinal", 0, -35, 20),
            "brake_intensity": _sensor_number(data, "brake_intensity", 0, 0, 1),
            "harsh_brake_count": int(data.get("harsh_brake_count", 0)),
            "distance_from_route_m": _sensor_number(data, "distance_from_route_m", 12, 0, 50000),
            "heading_delta_deg": _sensor_number(data, "heading_delta_deg", 5, 0, 180),
            "route_progress": _sensor_number(data, "route_progress", 0.42, 0, 1),
            "emergency": bool(data.get("emergency", False)),
            "source": source,
        }
    except (ValueError, TypeError, KeyError) as exc:
        return _bad(f"Invalid sensor payload: {exc}")
    db = get_db()
    vehicle = db.execute("SELECT id FROM vehicles WHERE id=?", (vehicle_id,)).fetchone()
    if vehicle is None:
        return _bad("Register this vehicle before submitting its telemetry.", 404)
    trip_id = normalized["trip_id"]
    if trip_id:
        trip = db.execute("SELECT id,vehicle_id,status FROM trips WHERE id=?", (trip_id,)).fetchone()
        if not trip or trip["vehicle_id"] != vehicle_id:
            return _bad("The trip does not exist for this vehicle.", 404)
    ai_output = _ai(normalized)
    acc = ai_output["accident"].get("prediction", "Unavailable")
    drive = ai_output["driving"].get("prediction", "Unavailable")
    route = ai_output["route"].get("prediction", "Unavailable")
    checkpoint_id = f"CHK-{uuid.uuid4().hex[:12].upper()}"
    digest_evidence = {"checkpoint_id": checkpoint_id, "sensor": normalized, "ai_output": ai_output}
    _, digest = write_evidence(current_app.config["EVIDENCE_DIR"], checkpoint_id, digest_evidence)
    client = _client()
    checkpoint_receipt = None
    if trip_id:
        checkpoint_receipt = client.add_checkpoint(trip_id, checkpoint_id, digest, normalized["lat"], normalized["lon"])
    db.execute(
        """INSERT INTO telemetry(vehicle_id,trip_id,timestamp,lat,lon,speed_kmh,source,emergency,payload_json,accident_prediction,driving_prediction,route_prediction,checkpoint_id,evidence_hash,tx_hash,block_number)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (vehicle_id, trip_id, timestamp, normalized["lat"], normalized["lon"], normalized["speed_kmh"], source, int(normalized["emergency"]), json.dumps(normalized, sort_keys=True), acc, drive, route, checkpoint_id, digest,
         checkpoint_receipt.get("tx_hash") if checkpoint_receipt else None, checkpoint_receipt.get("block_number") if checkpoint_receipt else None),
    )
    telemetry_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    db.execute("UPDATE vehicles SET last_lat=?,last_lon=?,last_speed=?,last_seen=?,source=? WHERE id=?", (normalized["lat"], normalized["lon"], normalized["speed_kmh"], timestamp, source, vehicle_id))
    _record_tx(db, checkpoint_receipt, checkpoint_id, "gps_checkpoint", {"vehicle_id": vehicle_id, "trip_id": trip_id, "evidence_hash": digest})
    incident = None
    incident_triggered = normalized["emergency"] or acc == "Possible accident"
    if incident_triggered:
        incident = _make_incident(
            db, client, vehicle_id=vehicle_id, trip_id=trip_id,
            classification="Emergency alert" if normalized["emergency"] else "Possible accident",
            severity="critical" if normalized["emergency"] else "high", source=source, occurred_at=timestamp,
            evidence={"telemetry": normalized, "checkpoint_id": checkpoint_id, "checkpoint_hash": digest}, ai_output=ai_output,
        )
    db.commit()
    row = db.execute("SELECT * FROM telemetry WHERE id=?", (telemetry_id,)).fetchone()
    return jsonify({
        "telemetry": _telemetry_row(row), "ai": ai_output,
        "checkpoint": {"id": checkpoint_id, "hash": digest, "transaction": checkpoint_receipt, "chain_status": "anchored" if checkpoint_receipt else ("not_anchored" if client.status()["available"] else "unavailable")},
        "incident": incident, "provenance": "The source field is client-reported. Records labelled device are not independently hardware-attested; simulation is labelled separately.",
    }), 201


@api.post("/simulation/tick")
@auth_required("admin", "operator")
def simulation_tick():
    data = _body()
    db = get_db()
    row = db.execute("SELECT v.*,t.id AS active_trip_id FROM vehicles v LEFT JOIN trips t ON t.vehicle_id=v.id AND t.status='active' WHERE v.id=?", (data.get("vehicle_id"),)).fetchone()
    if row is None:
        return _bad("Select a registered vehicle for simulation.", 404)
    rng = random.Random()
    index = db.execute("SELECT COUNT(*) FROM telemetry WHERE vehicle_id=?", (row["id"],)).fetchone()[0]
    impact = bool(data.get("simulate_impact", False))
    deviation = bool(data.get("simulate_deviation", False))
    emergency = bool(data.get("emergency", False))
    lat = float(row["last_lat"] or 12.9716) + (0.00020 if index % 2 == 0 else -0.00011) + rng.uniform(-0.00004, 0.00004)
    lon = float(row["last_lon"] or 77.5946) + 0.00017 + rng.uniform(-0.00004, 0.00004)
    payload = {
        "vehicle_id": row["id"], "trip_id": row["active_trip_id"], "timestamp": utc_now(), "lat": lat, "lon": lon,
        "speed_kmh": 0.0 if emergency else rng.uniform(24, 48),
        "accel_x": 18.5 if impact else rng.uniform(-1.5, 1.5), "accel_y": 5.5 if impact else rng.uniform(-1.0, 1.0),
        "accel_z": 4.0 if impact else rng.uniform(9.2, 10.3), "gyro_x": 2.8 if impact else rng.uniform(-0.15, 0.15),
        "gyro_y": rng.uniform(-0.1, 0.1), "gyro_z": rng.uniform(-0.2, 0.2),
        "acceleration_longitudinal": -8.0 if impact else rng.uniform(-1.8, 1.7),
        "brake_intensity": 1.0 if impact else rng.uniform(0, 0.3), "harsh_brake_count": 1 if impact else 0,
        "distance_from_route_m": 680 if deviation else rng.uniform(4, 35), "heading_delta_deg": 95 if deviation else rng.uniform(0, 18),
        "route_progress": min(1.0, (index % 25) / 25), "emergency": emergency, "source": "simulation",
    }
    # Feed generated data through the same validated sensor-ingestion workflow.
    with current_app.test_client() as test_client:
        return test_client.post(
            "/api/sensor-data",
            json=payload,
            headers={"Authorization": request.headers.get("Authorization", "")},
        )


@api.get("/telemetry")
@auth_required()
def telemetry():
    vehicle_id = request.args.get("vehicle_id")
    limit = min(max(int(request.args.get("limit", "80")), 1), 500)
    if vehicle_id:
        rows = get_db().execute("SELECT * FROM telemetry WHERE vehicle_id=? ORDER BY id DESC LIMIT ?", (vehicle_id, limit)).fetchall()
    else:
        rows = get_db().execute("SELECT * FROM telemetry ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return jsonify({"telemetry": [_telemetry_row(row) for row in rows]})


@api.get("/ai/summary")
@auth_required()
def ai_summary():
    db = get_db()
    recent = db.execute("SELECT * FROM telemetry ORDER BY id DESC LIMIT 30").fetchall()
    model_metrics = None
    try:
        from ai_models.train_all import METADATA_PATH
        if METADATA_PATH.exists():
            training = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
            model_metrics = training.get("models", {})
    except (OSError, ValueError, ImportError):
        model_metrics = None
    return jsonify({
        "models": [
            {"key": "accident", "name": "Impact classifier", "input": "Accelerometer + gyroscope", "output": "Normal movement / Possible accident"},
            {"key": "driving", "name": "Driver behaviour", "input": "Speed + acceleration + braking", "output": "Safe / Risky driving"},
            {"key": "route", "name": "Route anomaly", "input": "GPS distance + heading + progress", "output": "Normal route / Route deviation"},
        ],
        "recent": [_telemetry_row(row) for row in recent],
        "model_metrics": model_metrics,
        "provenance": "Evaluation scores come from the held-out synthetic-data test split when training metadata exists; they are not validated real-world performance.",
    })


@api.get("/incidents")
@auth_required()
def incidents():
    rows = get_db().execute("SELECT * FROM incidents ORDER BY occurred_at DESC LIMIT 200").fetchall()
    return jsonify({"incidents": [_incident_row(row) for row in rows]})


@api.post("/incidents")
@auth_required("admin", "operator")
def create_incident():
    data = _body()
    vehicle_id = str(data.get("vehicle_id", "")).strip()
    db = get_db()
    vehicle = db.execute("SELECT id FROM vehicles WHERE id=?", (vehicle_id,)).fetchone()
    if not vehicle:
        return _bad("Register a vehicle before creating an incident.", 404)
    source = str(data.get("source", "simulation"))
    if source not in ("simulation", "device"):
        return _bad("source must be simulation or device.")
    readings = data.get("sensor_readings") if isinstance(data.get("sensor_readings"), dict) else {}
    ai_output = _ai(readings)
    incident = _make_incident(
        db, _client(), vehicle_id=vehicle_id, trip_id=data.get("trip_id"),
        classification=str(data.get("classification", "Manual safety report")),
        severity=str(data.get("severity", "medium")), source=source, occurred_at=str(data.get("occurred_at", utc_now())),
        evidence={"sensor_readings": readings, "operator_note": str(data.get("note", ""))[:1000]}, ai_output=ai_output,
    )
    db.commit()
    return jsonify({"incident": incident, "notice": "Incident evidence is stored off-chain; the response shows whether a real local-chain receipt was created."}), 201


@api.post("/incidents/<incident_id>/verify")
@auth_required()
def verify_incident(incident_id: str):
    db = get_db()
    row = db.execute("SELECT * FROM incidents WHERE id=?", (incident_id,)).fetchone()
    if row is None:
        return _bad("Incident was not found.", 404)
    try:
        recomputed = hash_evidence_file(row["evidence_path"])
        integrity_match = recomputed.lower() == row["evidence_hash"].lower()
    except OSError:
        recomputed, integrity_match = None, False
    client = _client()
    on_chain_match = client.verify_incident(incident_id, recomputed) if integrity_match and recomputed else None
    if not integrity_match:
        verification_status = "modified"
    elif on_chain_match is True:
        verification_status = "verified"
    elif on_chain_match is False:
        verification_status = "chain_mismatch"
    else:
        verification_status = "not_anchored"
    return jsonify({
        "incident_id": incident_id, "status": verification_status,
        "verified": verification_status == "verified", "integrity_match": integrity_match,
        "on_chain_match": on_chain_match, "stored_hash": row["evidence_hash"], "recomputed_hash": recomputed,
        "transaction_hash": row["tx_hash"], "block_number": row["block_number"],
        "chain": client.status(),
        "message": {
            "verified": "Evidence bytes match the stored SHA-256 digest and the on-chain record.",
            "modified": "Stored evidence is missing or its recomputed hash differs from the recorded digest.",
            "chain_mismatch": "Evidence hash does not match the value recorded by the deployed contract.",
            "not_anchored": "Evidence integrity was checked locally, but no on-chain verification was available.",
        }[verification_status],
    })


@api.get("/transactions")
@auth_required()
def transactions():
    rows = get_db().execute("SELECT * FROM transactions ORDER BY block_number DESC,id DESC LIMIT 500").fetchall()
    result = []
    for row in rows:
        item = dict(row)
        item["details"] = json.loads(item.pop("details_json"))
        result.append(item)
    return jsonify({"transactions": result, "chain": _client().status(), "notice": "Only actual receipts returned by the configured blockchain are listed; no transaction is synthesized."})


@api.get("/blockchain/records")
@auth_required()
def blockchain_records():
    db = get_db()
    vehicles = db.execute("SELECT id,name,plate,blockchain_id,chain_status,created_at FROM vehicles ORDER BY created_at DESC").fetchall()
    trips = db.execute("SELECT * FROM trips ORDER BY started_at DESC").fetchall()
    checkpoints = db.execute("SELECT id,vehicle_id,trip_id,timestamp,source,checkpoint_id,evidence_hash,tx_hash,block_number FROM telemetry ORDER BY id DESC LIMIT 200").fetchall()
    incidents = db.execute("SELECT id,vehicle_id,trip_id,classification,severity,source,occurred_at,evidence_hash,chain_status,tx_hash,block_number FROM incidents ORDER BY occurred_at DESC").fetchall()
    return jsonify({"chain": _client().status(), "vehicles": [dict(row) for row in vehicles], "trips": [dict(row) for row in trips], "checkpoints": [dict(row) for row in checkpoints], "incidents": [dict(row) for row in incidents]})


@api.get("/route-anomalies")
@auth_required()
def route_anomalies():
    rows = get_db().execute("SELECT * FROM telemetry WHERE route_prediction='Route deviation' ORDER BY id DESC LIMIT 100").fetchall()
    return jsonify({"anomalies": [_telemetry_row(row) for row in rows]})


@api.get("/driver-behaviour")
@auth_required()
def driver_behaviour():
    rows = get_db().execute("SELECT * FROM telemetry WHERE driving_prediction='Risky driving' ORDER BY id DESC LIMIT 100").fetchall()
    summary = get_db().execute("SELECT COUNT(*) FROM telemetry WHERE driving_prediction='Risky driving'").fetchone()[0]
    return jsonify({"alerts": [_telemetry_row(row) for row in rows], "unsafe_driving_alerts": summary})


@api.get("/admin/users")
@auth_required("admin")
def admin_users():
    rows = get_db().execute("SELECT id,email,name,role,created_at FROM users ORDER BY created_at").fetchall()
    return jsonify({"users": [dict(row) for row in rows], "notice": "Local prototype accounts use demonstration authentication; add production identity controls before deployment."})


@api.get("/admin/summary")
@auth_required("admin")
def admin_summary():
    db = get_db()
    return jsonify({
        "users": db.execute("SELECT COUNT(*) FROM users").fetchone()[0],
        "vehicles": db.execute("SELECT COUNT(*) FROM vehicles").fetchone()[0],
        "trips": db.execute("SELECT COUNT(*) FROM trips").fetchone()[0],
        "incidents": db.execute("SELECT COUNT(*) FROM incidents").fetchone()[0],
        "on_chain_transactions": db.execute("SELECT COUNT(*) FROM transactions").fetchone()[0],
        "chain": _client().status(),
    })
