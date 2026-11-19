from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from flask import current_app, g
from werkzeug.security import generate_password_hash


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        path = Path(current_app.config["DATABASE"])
        path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(path, timeout=15)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        g.db = connection
    return g.db


def close_db(_error: BaseException | None = None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def init_db(app) -> None:
    with app.app_context():
        db_path = Path(app.config["DATABASE"])
        db_path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(db_path)
        db.executescript(
            """
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'operator', 'viewer')),
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS vehicles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                plate TEXT NOT NULL UNIQUE,
                driver TEXT NOT NULL DEFAULT 'Unassigned',
                route TEXT NOT NULL DEFAULT 'Unassigned route',
                blockchain_id TEXT NOT NULL,
                chain_status TEXT NOT NULL DEFAULT 'not_anchored',
                last_lat REAL,
                last_lon REAL,
                last_speed REAL NOT NULL DEFAULT 0,
                last_seen TEXT,
                source TEXT NOT NULL DEFAULT 'simulation',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS trips (
                id TEXT PRIMARY KEY,
                vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
                route_id TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('active', 'completed')),
                source TEXT NOT NULL DEFAULT 'simulation',
                chain_status TEXT NOT NULL DEFAULT 'not_anchored',
                started_at TEXT NOT NULL,
                completed_at TEXT,
                start_tx_hash TEXT,
                complete_tx_hash TEXT
            );
            CREATE TABLE IF NOT EXISTS telemetry (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
                trip_id TEXT REFERENCES trips(id),
                timestamp TEXT NOT NULL,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                speed_kmh REAL NOT NULL,
                source TEXT NOT NULL CHECK(source IN ('simulation', 'device')),
                emergency INTEGER NOT NULL DEFAULT 0,
                payload_json TEXT NOT NULL,
                accident_prediction TEXT,
                driving_prediction TEXT,
                route_prediction TEXT,
                checkpoint_id TEXT,
                evidence_hash TEXT,
                tx_hash TEXT,
                block_number INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_telemetry_vehicle_time ON telemetry(vehicle_id, timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_telemetry_trip_time ON telemetry(trip_id, timestamp DESC);
            CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY,
                vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
                trip_id TEXT REFERENCES trips(id),
                classification TEXT NOT NULL,
                severity TEXT NOT NULL,
                source TEXT NOT NULL CHECK(source IN ('simulation', 'device')),
                status TEXT NOT NULL DEFAULT 'open',
                occurred_at TEXT NOT NULL,
                evidence_hash TEXT NOT NULL,
                evidence_path TEXT NOT NULL,
                chain_status TEXT NOT NULL DEFAULT 'not_anchored',
                tx_hash TEXT,
                block_number INTEGER,
                ai_output_json TEXT NOT NULL,
                details_json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_incidents_time ON incidents(occurred_at DESC);
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                record_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                tx_hash TEXT NOT NULL UNIQUE,
                block_number INTEGER NOT NULL,
                chain_id INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                details_json TEXT NOT NULL
            );
            """
        )
        db.commit()
        if app.config.get("SEED_DEMO_DATA", True):
            _seed_demo_data(db)
        db.close()


def _seed_demo_data(db: sqlite3.Connection) -> None:
    """Seed clearly labelled local simulation rows; never seed blockchain transactions."""
    now = utc_now()
    configured_users = [
        ("usr-demo-admin", current_app.config.get("DEMO_ADMIN_EMAIL"), "SafeRoute Admin", current_app.config.get("DEMO_ADMIN_PASSWORD"), "admin"),
        ("usr-demo-ops", current_app.config.get("DEMO_OPERATOR_EMAIL"), "Transit Operator", current_app.config.get("DEMO_OPERATOR_PASSWORD"), "operator"),
    ]
    users = [
        (user_id, email, name, generate_password_hash(password), role, now)
        for user_id, email, name, password, role in configured_users
        if email and password
    ]
    if users:
        db.executemany(
            "INSERT OR IGNORE INTO users(id,email,name,password_hash,role,created_at) VALUES (?,?,?,?,?,?)",
            users,
        )
    demo_vehicles = [
        ("SR-021", "Metro Shuttle 21", "KA-03-MN-4821", "Asha K.", "Central Loop", "", "not_anchored", 12.9715, 77.5940, 34.0, now, "simulation", now),
        ("SR-034", "Rapid Connect 34", "KA-05-RC-1834", "Vikram S.", "Airport Link", "", "not_anchored", 12.9790, 77.6014, 0.0, now, "simulation", now),
        ("SR-052", "CityLine 52", "KA-01-CL-7752", "Meera P.", "East Connector", "", "not_anchored", 12.9659, 77.6098, 28.0, now, "simulation", now),
        ("SR-067", "Transit Express 67", "KA-02-TE-3967", "Unassigned", "North Loop", "", "not_anchored", 12.9894, 77.5892, 0.0, now, "simulation", now),
    ]
    db.executemany(
        """INSERT OR IGNORE INTO vehicles(id,name,plate,driver,route,blockchain_id,chain_status,last_lat,last_lon,last_speed,last_seen,source,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        demo_vehicles,
    )
    db.execute(
        """INSERT OR IGNORE INTO trips(id,vehicle_id,route_id,status,source,chain_status,started_at)
           VALUES (?,?,?,?,?,?,?)""",
        ("TRP-DEMO-001", "SR-021", "Central Loop", "active", "simulation", "not_anchored", now),
    )
    db.execute(
        """INSERT OR IGNORE INTO trips(id,vehicle_id,route_id,status,source,chain_status,started_at,completed_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        ("TRP-DEMO-002", "SR-052", "East Connector", "completed", "simulation", "not_anchored", now, now),
    )
    # A first map point is explicitly a sample coordinate, not a live device fix.
    existing = db.execute("SELECT 1 FROM telemetry LIMIT 1").fetchone()
    if not existing:
        points = [
            ("SR-021", "TRP-DEMO-001", now, 12.9715, 77.5940, 34.0, "simulation", 0, json.dumps({"provenance": "synthetic demo seed"}), "Normal movement", "Safe", "Normal route"),
            ("SR-052", "TRP-DEMO-002", now, 12.9659, 77.6098, 28.0, "simulation", 0, json.dumps({"provenance": "synthetic demo seed"}), "Normal movement", "Safe", "Normal route"),
        ]
        db.executemany(
            """INSERT INTO telemetry(vehicle_id,trip_id,timestamp,lat,lon,speed_kmh,source,emergency,payload_json,accident_prediction,driving_prediction,route_prediction)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            points,
        )
    db.commit()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    db = get_db()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
