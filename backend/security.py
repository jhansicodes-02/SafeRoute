from __future__ import annotations

import hmac
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Callable

import jwt
from flask import current_app, g, jsonify, request

from backend.database import get_db


def issue_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": user_id, "iat": now, "exp": now + timedelta(hours=12)},
        current_app.config["JWT_SECRET"],
        algorithm="HS256",
    )


def _resolve_user() -> tuple[dict | None, tuple | None]:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None, (jsonify({"error": "Sign in to continue."}), 401)
    try:
        payload = jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return None, (jsonify({"error": "Your session expired. Please sign in again."}), 401)
    except jwt.InvalidTokenError:
        return None, (jsonify({"error": "The session token is not valid."}), 401)
    user = get_db().execute(
        "SELECT id,email,name,role,created_at FROM users WHERE id=?", (payload.get("sub"),)
    ).fetchone()
    if user is None:
        return None, (jsonify({"error": "The account for this session no longer exists."}), 401)
    return dict(user), None


def auth_required(*roles: str) -> Callable:
    def decorator(view: Callable) -> Callable:
        @wraps(view)
        def wrapped(*args, **kwargs):
            user, error = _resolve_user()
            if error:
                return error
            g.user = user
            if roles and g.user["role"] not in roles:
                return jsonify({"error": "This action requires a different account role."}), 403
            return view(*args, **kwargs)

        return wrapped

    return decorator


def sensor_ingest_required(view: Callable) -> Callable:
    """Allow a configured device token, a bearer session, or explicit local-demo mode only."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        expected = current_app.config.get("DEVICE_TOKEN", "")
        supplied = request.headers.get("X-Device-Token", "")
        if expected and supplied and hmac.compare_digest(expected, supplied):
            g.user = {"id": "esp32-device", "email": "device@local", "name": "Configured ESP32", "role": "operator"}
            return view(*args, **kwargs)
        header = request.headers.get("Authorization", "")
        if header:
            user, error = _resolve_user()
            if error:
                return error
            if user["role"] not in ("admin", "operator"):
                return jsonify({"error": "This action requires an operator account."}), 403
            g.user = user
            return view(*args, **kwargs)
        if current_app.config.get("DEMO_MODE") and not expected:
            g.user = {"id": "local-demo-ingest", "email": "", "name": "Local demo ingestion", "role": "operator"}
            return view(*args, **kwargs)
        return jsonify({"error": "Use an operator bearer token or configured X-Device-Token."}), 401

    return wrapped
