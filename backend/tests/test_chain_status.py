from __future__ import annotations

from types import SimpleNamespace

from backend.chain import ChainClient


def _client(code: bytes, *, chain_id: int = 31337) -> ChainClient:
    eth = SimpleNamespace(chain_id=chain_id, get_code=lambda _address: code)
    client = ChainClient.__new__(ChainClient)
    client.rpc_url = "http://127.0.0.1:8545"
    client.deployment_file = None
    client.w3 = SimpleNamespace(is_connected=lambda: True, eth=eth)
    client.contract = object()
    client.address = "0x" + "12" * 20
    client.expected_chain_id = 31337
    client.last_error = None
    return client


def test_saved_address_without_contract_bytecode_is_not_reported_deployed():
    status = _client(b"").status()
    assert status["node_connected"] is True
    assert status["available"] is False
    assert status["contract_deployed"] is False
    assert "Redeploy" in status["message"]


def test_matching_chain_with_contract_bytecode_is_reported_available():
    status = _client(b"\x60\x80\x60\x40").status()
    assert status["available"] is True
    assert status["contract_deployed"] is True


def test_deployment_on_a_different_chain_is_not_reported_available():
    status = _client(b"\x60\x80", chain_id=1).status()
    assert status["available"] is False
    assert status["contract_deployed"] is False
    assert "does not match" in status["message"]
