# Smart-contract and local-chain guide

## Contract

`blockchain/contracts/SafeRouteRegistry.sol` targets Solidity 0.8.24 and is built with Hardhat 2.22.17 on an Ethereum-compatible EVM. The contract has an owner, admin mapping, operator mapping, events and unique record mappings for vehicles, trips, checkpoints, incidents and standalone evidence digests. Writes are restricted to the authorized operator role; owner/admin permissions manage operators/admins.

Stored data is minimized: bytes32 stable IDs/digests, vehicle external ID and small metadata, route ID, lifecycle timestamps/state, GPS coordinates scaled to signed microdegrees, and incident severity. Large sensor payloads/reports remain in local off-chain JSON evidence files. The contract lifecycle rejects duplicate identifiers and invalid trip transitions. Checkpoint records require a started, not-completed trip; incident records require a registered trip.

The verification view compares a supplied candidate `bytes32` digest with the contract record. Flask recomputes the SHA-256 digest from exact stored report bytes and calls the incident verifier. It only returns `verified` if both the local digest and on-chain comparison match. It returns `modified`, `chain_mismatch`, or `not_anchored` for the corresponding cases.

## Local deploy

Terminal 1:

```bash
pnpm chain
```

Terminal 2:

```bash
CI=1 pnpm deploy:local
```

The Hardhat node uses chain ID `31337` and RPC port `8545`. `blockchain/scripts/deploy.js` compiles/deploys `SafeRouteRegistry` and writes `backend/deployment.json` with the actual address, network ID, and deploy block. This descriptor, Hardhat artifacts/cache, and all development keys/state are local-only. A fresh Hardhat node is an empty chain; redeploy after restarting it.

After deploy, start/restart Flask. Check `GET /api/health` for `node_connected`, `contract_deployed`, `chain_id`, and address before creating writes. A transaction row is added only after `eth_sendTransaction` returns a receipt with success status; its transaction hash, block number, chain ID and block timestamp are then read from the configured RPC.

## Ethers and MetaMask

The application offers a MetaMask connection indicator and notes the connected account/chain. To inspect the local network in MetaMask, add RPC `http://127.0.0.1:8545`, chain ID `31337`, currency symbol `ETH`, and optionally import a Hardhat-only test key printed by the node. Never use this network or key for assets; Hardhat keys are public deterministic development credentials. **SafeRoute API writes use the unlocked local Hardhat account and are not MetaMask-signed.** No transaction will be generated when node/deployment is unavailable.

## Test suite

```bash
CI=1 pnpm test:chain
```

Tests cover unique vehicle/trip IDs, lifecycle and timestamps, checkpoint evidence hash comparison, incident verification and role protections. The test process runs against an ephemeral in-memory Hardhat network, not the deployed local RPC.

## Limits

This is not a production network integration. It does not manage production signing keys, public chain confirmations, gas policy, multi-chain network allowlisting or durable off-chain evidence storage. SQLite and evidence files are local instance data. A digest proves that bytes match a prior digest; it does not prove the sensor was calibrated, the input true, or the report author trusted.
