from __future__ import annotations

import os
import secrets
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

from backend.database import close_db, init_db

ROOT = Path(__file__).resolve().parent.parent


def create_app(test_config: dict | None = None) -> Flask:
    load_dotenv(ROOT / ".env")
    app = Flask(__name__)
    app.config.from_mapping(
        DATABASE=os.getenv("SAFEROUTE_DATABASE", str(ROOT / "backend" / "data" / "saferoute.db")),
        JWT_SECRET=os.getenv("SAFEROUTE_JWT_SECRET") or secrets.token_urlsafe(32),
        DEVICE_TOKEN=os.getenv("SAFEROUTE_DEVICE_TOKEN", ""),
        DEMO_ADMIN_EMAIL=os.getenv("SAFEROUTE_DEMO_ADMIN_EMAIL", "admin@saferoute.local"),
        DEMO_ADMIN_PASSWORD=os.getenv("SAFEROUTE_DEMO_ADMIN_PASSWORD", ""),
        DEMO_OPERATOR_EMAIL=os.getenv("SAFEROUTE_DEMO_OPERATOR_EMAIL", "operator@saferoute.local"),
        DEMO_OPERATOR_PASSWORD=os.getenv("SAFEROUTE_DEMO_OPERATOR_PASSWORD", ""),
        SEED_DEMO_DATA=os.getenv("SAFEROUTE_SEED_DEMO", "true").lower() == "true",
        EVIDENCE_DIR=os.getenv("SAFEROUTE_EVIDENCE_DIR", str(ROOT / "backend" / "evidence")),
        RPC_URL=os.getenv("SAFEROUTE_RPC_URL", "http://127.0.0.1:8545"),
        DEPLOYMENT_FILE=os.getenv("SAFEROUTE_DEPLOYMENT_FILE", str(ROOT / "backend" / "deployment.json")),
        DEMO_MODE=os.getenv("SAFEROUTE_DEMO_MODE", "true").lower() == "true",
        JSON_SORT_KEYS=False,
    )
    if test_config:
        app.config.update(test_config)
    origins = os.getenv("SAFEROUTE_CORS_ORIGIN", "http://localhost:3000").split(",")
    CORS(app, resources={r"/api/*": {"origins": origins}}, allow_headers=["Authorization", "Content-Type", "X-Device-Token"])
    app.teardown_appcontext(close_db)
    init_db(app)

    from backend.routes import api

    app.register_blueprint(api, url_prefix="/api")


    return app
