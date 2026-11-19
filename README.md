# SafeRoute

**Every Journey Recorded. Every Incident Verified.**

SafeRoute is a local-first public-transport safety prototype connecting a React operations dashboard, Flask/SQLite API, locally trained Python classifiers, an Ethereum-compatible Solidity registry, and ESP32 sensor support. It is simulation-first so the full product flow can be exercised without a physical bus, ESP32, MetaMask, or public blockchain.

> **Prototype and safety notice:** This project is not a certified emergency-response system or a validated safety product. Never rely on it for dispatch, driving, medical, or passenger-safety decisions, and do not ingest real passenger data or sensitive incident evidence. Generated sensor values and model evaluations are synthetic engineering baselines. The telemetry `source` field is client-reported; a `device` label is not independently hardware-attested. Local Hardhat signers, locally configured demo accounts, development JWT configuration, and plain-HTTP device ingestion are not production controls.

## What works

- Responsive React/TypeScript workspace with dashboard, OpenStreetMap fleet map, vehicle registry, trip lifecycle, driver-behaviour signals, impact detection, route deviations, incident reports, evidence verification, local-chain records, transaction history, and role-restricted administrator views.
- Flask endpoints backed by SQLite for authentication, vehicle/trip state, sensor telemetry, local model inference, generated incidents, canonical off-chain evidence, SHA-256 verification, and actual local-chain receipt metadata.
- Three deterministic scikit-learn pipelines: MPU6050 accelerometer/gyroscope impact classification, risky-driving classification, and GPS route-anomaly classification. Data is generated and labelled synthetic; evaluation uses a stratified held-out split.
- Hardhat/Solidity `SafeRouteRegistry` with unique IDs, operator/admin permissions, vehicle registration, trip lifecycle, checkpoint coordinates/hashes, incident hashes, and hash-verification reads. Writes are listed only after a transaction receipt is received.
- Python telemetry simulator and Arduino IDE ESP32 firmware for NEO-6M + MPU6050 with optional buzzer. Simulator samples are labelled `simulation`; firmware payloads use `device` when running with valid sensors/GPS.

### Map tiles

Leaflet requests visible raster tiles from `https://tile.openstreetmap.de/{z}/{x}/{y}.png`; this is a tile-image endpoint, not an embedded OpenStreetMap webpage. The map credits both © OpenStreetMap contributors and the OpenStreetMap.de style. The operator allows tile embedding in smaller non-commercial web apps, but limits throughput per IP and does not offer a production availability guarantee. Use only for normal interactive viewing: do not bulk-prefetch or provide offline downloads. For commercial or sustained production traffic, select a provider whose plan explicitly covers that usage or self-host tiles. See the [OpenStreetMap.de style usage terms](https://www.openstreetmap.de/germanstyle.html) and the [raster tile provider directory](https://wiki.openstreetmap.org/wiki/Raster_tile_providers).

## Requirements

- Node.js 20 or newer, Corepack and pnpm 11 (the root `package.json` pins pnpm 11.25.0).
- Python 3.10–3.12 recommended. Python package pins are in `requirements.txt`.
- Optional for hardware: ESP32 DevKit, NEO-6M GPS, MPU6050 breakout, and optional buzzer/driver. Hardware dependencies and wiring are in [`iot/README.md`](iot/README.md).
- Optional wallet: MetaMask configured for the local Hardhat RPC. The page provides a connection indicator; prototype contract writes are sent by Flask through the unlocked local Hardhat development account, not signed by MetaMask.

## Install

Run from the repository root:

```bash
corepack enable
pnpm install
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
```

Set `SAFEROUTE_JWT_SECRET`, `SAFEROUTE_DEMO_ADMIN_PASSWORD`, and `SAFEROUTE_DEMO_OPERATOR_PASSWORD` to unique values in the ignored local `.env` file. Demo accounts are seeded only when their passwords are configured. The committed `.env.example` contains blank secret fields and safe local defaults; it contains no credentials. Leave `SAFEROUTE_DEVICE_TOKEN` empty only for an isolated local demo. Never commit `.env` or copy a Hardhat development key to a real network.

Train and save the three synthetic-data models before starting the backend:

```bash
.venv/bin/python -m ai_models.train_all
```

This writes joblib pipelines and `ai_models/models/metrics.json`. Reported scores are computed during that run on the held-out generated test split; they do not predict real-world transport safety performance. The root [`notebooks/train_models.ipynb`](notebooks/train_models.ipynb) can be opened in Google Colab for the same preprocessing, stratified split, training and evaluation workflow.

## Run locally

Open separate terminals in the repository root, in this order.

**Terminal 1 — local Hardhat node:**

```bash
pnpm chain
```

Wait until Hardhat reports the JSON-RPC server at `http://127.0.0.1:8545`.

**Terminal 2 — compile and deploy the contract:**

```bash
CI=1 pnpm deploy:local
```

This writes the local contract address and chain ID to the ignored file `backend/deployment.json`. Start/restart the Flask process after deployment so the API can report the deployed contract. If the node restarts, redeploy: the local in-memory chain and contract address are new.

**Terminal 3 — Flask API:**

```bash
.venv/bin/python -m backend.app
```

The API listens on `127.0.0.1:5000`; verify it with `curl http://127.0.0.1:5000/api/health`.

**Terminal 4 — Vite dashboard:**

```bash
pnpm dev
```

Open the Manus project Preview to use the app (Vite is configured for port 3000 and proxies relative `/api` requests to Flask). The local development address, when running outside Preview, is `http://localhost:3000`.

The seeded demo administrator and operator accounts require passwords configured in the ignored local `.env` file; no passwords are included in this repository. New signups receive the operator role; they cannot promote themselves to admin.

### Simulation-only quick start

If the chain is stopped or not deployed, the UI continues with local SQLite records and labels those records unanchored; it does not mint fake transactions. The demo dataset seeds `SR-021` with active trip `TRP-DEMO-001`. From another terminal, send a few explicitly synthetic samples:

```bash
.venv/bin/python iot/simulate.py --dry-run --count 2 --seed 42
.venv/bin/python iot/simulate.py --count 3 --interval 1 --seed 42
```

Generate a clearly synthetic impact/emergency at sample 4:

```bash
.venv/bin/python iot/simulate.py --count 5 --impact-at 4
```

Run the route/incident test buttons in the dashboard or Tracking view to exercise the same sensor-ingestion and model path. “Simulate” actions must not be presented as physical sensor events.

## End-to-end operator path

1. Sign in with a locally configured administrator account.
2. Open **Vehicles** and register a test vehicle; when Hardhat is deployed, inspect the returned registration receipt and chain ID.
3. Open **Trips** and register/start a route. Trip registration and start are distinct contract calls.
4. Open **Tracking** and select the vehicle. Use **Send checkpoint**, **Simulate impact alert**, or **Simulate route deviation** to test generated data; source chips explicitly say `SIMULATED`.
5. Open **Incidents** and select the impact report. Review sensor fields, model predictions, SHA-256 evidence digest and receipt. Click **Verify evidence** to recompute saved bytes and query the contract when available.
6. Open **Blockchain** for vehicle IDs, trip lifecycle, GPS hashes, incident evidence, transaction hashes, block numbers and timestamps; open **Transactions** for actual receipts only.
7. Complete the trip in **Trips**. The completion receipt is shown if the contract write succeeds.

With a physical ESP32, configure a registered vehicle/trip, local Wi-Fi, Flask host LAN IP, and optional device token in the sketch; follow [`iot/README.md`](iot/README.md) and test while safely stationary. Use only a trusted network. The current device firmware does not have route geometry, so route-derived fields are labelled placeholders rather than route fixes.

## Configuration

| Variable | Local default / behavior |
| --- | --- |
| `SAFEROUTE_JWT_SECRET` | Replace the example with a random secret before sharing the service. |
| `SAFEROUTE_DEVICE_TOKEN` | Empty for local demo; when set, sensor ingestion accepts this `X-Device-Token` or an operator bearer session. Configure the same token in the simulator/firmware. |
| `SAFEROUTE_DATABASE` | `backend/data/saferoute.db` (SQLite). |
| `SAFEROUTE_RPC_URL` | `http://127.0.0.1:8545`. |
| `SAFEROUTE_DEPLOYMENT_FILE` | `backend/deployment.json` generated by local deployment. |
| `SAFEROUTE_API_HOST` / `SAFEROUTE_API_PORT` | `127.0.0.1` / `5000`; use a LAN binding only for isolated hardware tests. |
| `SAFEROUTE_CORS_ORIGIN` | `http://localhost:3000`; adjust only for trusted local UI origins. |
| `SAFEROUTE_DEMO_MODE` | `true` in the example; do not rely on demo ingestion/auth for shared services. |

## Tests and build

```bash
CI=1 pnpm test:chain
.venv/bin/python -m pytest backend/tests ai_models/tests iot/test_simulate.py -q
pnpm typecheck
pnpm build
```

`pnpm test` composes the chain, API/model/simulator and frontend checks. Hardhat runs in non-interactive mode. Tests use temporary SQLite databases except the model-pipeline unit tests, which read actual saved training artifacts. The integration tests explicitly check no chain transaction is fabricated when RPC/deployment is unavailable.

## Documentation

- [Architecture and data flow](documentation/architecture.md)
- [HTTP API reference](documentation/api.md)
- [Smart-contract and local-chain guide](documentation/blockchain.md)
- [AI model training and evaluation](documentation/ai-training.md)
- [ESP32 wiring and sensor payload guide](iot/README.md)

## Scope and security limitations

This deliverable is a local development prototype, not a production deployment. Authentication is a lightweight bearer-token prototype; there is no managed identity, rate limiting, formal key custody, audit process, data retention policy, or real multi-tenant model. SQLite and local filesystem evidence are single-instance development storage. Hardhat accounts are public test keys, and Flask uses an unlocked development signer. The device API is plain HTTP, even when a token is configured. OpenStreetMap tiles and Google Fonts require network access. No physical ESP32 or MetaMask availability is assumed by the preview environment; the dashboard labels these constraints instead of inventing their status.
