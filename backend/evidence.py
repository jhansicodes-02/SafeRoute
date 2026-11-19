from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha256_hex(value: Any) -> str:
    return "0x" + hashlib.sha256(canonical_bytes(value)).hexdigest()


def write_evidence(directory: str | Path, record_id: str, evidence: Any) -> tuple[str, str]:
    safe_id = re.sub(r"[^a-zA-Z0-9_-]", "_", record_id)[:100]
    base = Path(directory).resolve()
    base.mkdir(parents=True, exist_ok=True)
    path = (base / f"{safe_id}.json").resolve()
    if path.parent != base:
        raise ValueError("Invalid evidence record ID")
    raw = canonical_bytes(evidence)
    path.write_bytes(raw)
    digest = "0x" + hashlib.sha256(raw).hexdigest()
    return str(path), digest


def hash_evidence_file(path: str | Path) -> str:
    return "0x" + hashlib.sha256(Path(path).read_bytes()).hexdigest()
