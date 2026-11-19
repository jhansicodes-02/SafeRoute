from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from web3 import Web3


class ChainClient:
    """Development-chain adapter. A missing node/deployment is never represented as a receipt."""

    INCIDENT_SEVERITY = {"low": 1, "medium": 2, "high": 3, "critical": 4}

    def __init__(self, rpc_url: str, deployment_file: str):
        self.rpc_url = rpc_url
        self.deployment_file = Path(deployment_file)
        self.w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 2}))
        self.contract = None
        self.address: str | None = None
        self.expected_chain_id: int | None = None
        self.last_error: str | None = None
        self._load_contract()

    @property
    def node_connected(self) -> bool:
        try:
            return bool(self.w3.is_connected())
        except Exception:
            return False

    def _load_contract(self) -> None:
        if not self.deployment_file.exists():
            self.last_error = "No SafeRoute contract deployment file was found."
            return
        try:
            data = json.loads(self.deployment_file.read_text(encoding="utf-8"))
            self.address = Web3.to_checksum_address(data["address"])
            self.expected_chain_id = int(data.get("chainId", 0)) or None
            artifact = Path(__file__).resolve().parent.parent / "blockchain" / "artifacts" / "contracts" / "SafeRouteRegistry.sol" / "SafeRouteRegistry.json"
            if not artifact.exists():
                self.last_error = "Contract ABI is missing; compile and deploy the Hardhat contract first."
                return
            abi = json.loads(artifact.read_text(encoding="utf-8"))["abi"]
            self.contract = self.w3.eth.contract(address=self.address, abi=abi)
        except Exception as exc:
            self.last_error = f"Contract deployment is not ready: {str(exc)[:160]}"

    def status(self) -> dict[str, Any]:
        connected = self.node_connected
        chain_id = None
        if connected:
            try:
                chain_id = int(self.w3.eth.chain_id)
            except Exception:
                pass
        chain_matches = self.expected_chain_id is None or chain_id == self.expected_chain_id
        contract_code_present = False
        if connected and self.contract is not None and self.address and chain_matches:
            try:
                contract_code_present = len(self.w3.eth.get_code(self.address)) > 0
            except Exception as exc:
                self.last_error = f"Could not inspect contract bytecode: {str(exc)[:120]}"
        deployed = bool(connected and self.contract is not None and chain_matches and contract_code_present)
        if not connected:
            message = "Local Hardhat node is not connected. No blockchain writes are being recorded."
        elif not self.contract:
            message = self.last_error or "SafeRoute contract is not deployed on this chain."
        elif not chain_matches:
            message = f"Connected chain {chain_id} does not match deployment chain {self.expected_chain_id}."
        elif not contract_code_present:
            message = "No contract bytecode exists at the saved deployment address. Redeploy after restarting the local node."
        else:
            message = "Connected to the deployed SafeRoute contract on the configured local chain."
        return {
            "available": deployed,
            "node_connected": connected,
            "contract_deployed": bool(self.contract and contract_code_present),
            "contract_address": self.address,
            "chain_id": chain_id,
            "rpc_url": self.rpc_url,
            "message": message,
            "mode": "local_hardhat" if deployed else "unavailable",
        }

    @staticmethod
    def identifier(value: str) -> bytes:
        return Web3.keccak(text=str(value))

    @staticmethod
    def digest_bytes(value: str) -> bytes:
        return Web3.to_bytes(hexstr=value)

    def _submit(self, function_name: str, *args) -> dict[str, Any] | None:
        if not self.status()["available"]:
            return None
        try:
            accounts = self.w3.eth.accounts
            if not accounts:
                raise RuntimeError("The JSON-RPC node exposes no unlocked development account.")
            function_factory = getattr(self.contract.functions, function_name, None)
            if function_factory is None:
                raise RuntimeError(f"The deployed contract does not expose {function_name}.")
            tx_hash = function_factory(*args).transact({"from": accounts[0]})
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
            if int(receipt.status) != 1:
                raise RuntimeError("The local chain returned a failed transaction receipt.")
            block = self.w3.eth.get_block(receipt.blockNumber)
            return {
                "tx_hash": Web3.to_hex(receipt.transactionHash),
                "block_number": int(receipt.blockNumber),
                "chain_id": int(self.w3.eth.chain_id),
                "timestamp": datetime.fromtimestamp(int(block.timestamp), timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
                "gas_used": int(receipt.gasUsed),
                "contract_address": self.address,
            }
        except Exception as exc:
            self.last_error = str(exc)[:240]
            return None

    def vehicle_exists(self, vehicle_id: str) -> bool:
        if not self.status()["available"]:
            return False
        try:
            self.contract.functions.getVehicle(self.identifier(vehicle_id)).call()
            return True
        except Exception:
            return False

    def register_vehicle(self, vehicle_id: str, public_id: str, metadata_uri: str = "") -> dict[str, Any] | None:
        return self._submit("registerVehicle", self.identifier(vehicle_id), public_id, metadata_uri)

    def register_trip(self, trip_id: str, vehicle_id: str, route_id: str) -> dict[str, Any] | None:
        return self._submit("registerTrip", self.identifier(trip_id), self.identifier(vehicle_id), self.identifier(route_id))

    def start_trip(self, trip_id: str) -> dict[str, Any] | None:
        return self._submit("startTrip", self.identifier(trip_id))

    def add_checkpoint(self, trip_id: str, checkpoint_id: str, evidence_hash: str, lat: float, lon: float) -> dict[str, Any] | None:
        return self._submit(
            "recordCheckpoint",
            self.identifier(checkpoint_id),
            self.identifier(trip_id),
            int(round(lat * 1_000_000)),
            int(round(lon * 1_000_000)),
            self.digest_bytes(evidence_hash),
        )

    def complete_trip(self, trip_id: str) -> dict[str, Any] | None:
        return self._submit("completeTrip", self.identifier(trip_id))

    def register_incident(self, incident_id: str, trip_id: str | None, evidence_hash: str, severity: str, _occurred_at: str) -> dict[str, Any] | None:
        if not trip_id:
            self.last_error = "Contract incident records require a registered trip; this report remains off-chain."
            return None
        severity_code = self.INCIDENT_SEVERITY.get(severity.lower())
        if severity_code is None:
            self.last_error = "Incident severity must be low, medium, high, or critical."
            return None
        return self._submit("recordIncident", self.identifier(incident_id), self.identifier(trip_id), self.digest_bytes(evidence_hash), severity_code)

    def verify_evidence(self, record_id: str, evidence_hash: str) -> bool | None:
        if not self.status()["available"]:
            return None
        try:
            return bool(self.contract.functions.verifyEvidence(self.identifier(record_id), self.digest_bytes(evidence_hash)).call())
        except Exception as exc:
            self.last_error = str(exc)[:240]
            return None

    def verify_incident(self, incident_id: str, evidence_hash: str) -> bool | None:
        if not self.status()["available"]:
            return None
        try:
            return bool(self.contract.functions.verifyIncidentHash(self.identifier(incident_id), self.digest_bytes(evidence_hash)).call())
        except Exception as exc:
            self.last_error = str(exc)[:240]
            return None

    def verify_checkpoint(self, checkpoint_id: str, evidence_hash: str) -> bool | None:
        if not self.status()["available"]:
            return None
        try:
            return bool(self.contract.functions.verifyCheckpointHash(self.identifier(checkpoint_id), self.digest_bytes(evidence_hash)).call())
        except Exception as exc:
            self.last_error = str(exc)[:240]
            return None
