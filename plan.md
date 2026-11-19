# SafeRoute — Implementation Plan

## Product scope and engineering approach

Deliver a simulation-first, locally runnable public-transport safety prototype and prepare its existing React/Vite TypeScript dashboard and Python Flask API for Vercel hosting. The existing local workflow remains supported: SQLite, local evidence files, trained Python classifiers, simulated/ESP32 sensor ingestion, and the Ethereum-compatible Hardhat development chain remain available. The Vercel path uses one Vercel project with separate Vite frontend and Flask Python services routed on a shared domain. The working vertical slice will continue to register vehicles, manage trips, accept GPS/sensor checkpoints, create incidents, store evidence off-chain, anchor evidence hashes and lifecycle records in Solidity, and recompute/compare evidence hashes through the UI. No sample blockchain transaction, AI score, or sensor reading will be represented as real when a corresponding service or device is unavailable.

SQLite and local evidence files remain the local defaults. The Vercel runtime uses a persistent PostgreSQL connection supplied through a Vercel Marketplace integration (recommended provider: Neon); canonical evidence JSON is stored in PostgreSQL there so integrity verification does not depend on a serverless filesystem. The local Hardhat node and unlocked account remain development-only. Production chain access is optional and must use an explicitly configured external EVM RPC endpoint, chain ID, deployed contract address, and server-only signer key; when configuration is missing or invalid, chain writes remain disabled and records stay unanchored/unavailable. The frontend uses actual deployment and receipt data only when a real configured chain response exists. Simulation-mode data and model results remain visibly labelled. The three saved Python models and prediction outputs are preserved; synthetic training/evaluation scores remain engineering baselines, not evidence of real-world performance.

## Module boundaries and data flow

- **Frontend:** React, TypeScript and Vite; single-page navigation for the requested monitoring, management, verification and administration views; Leaflet/OpenStreetMap for tracking; Ethers.js for optional MetaMask connection and contract reads/writes; relative `/api` requests proxied to Flask during development.
- **Backend:** Flask JSON API; SQLite for local users/roles, vehicles, trips, telemetry, checkpoints, incidents and transaction metadata, or PostgreSQL for Vercel; password-hashed accounts and role checks; saved model inference through joblib/scikit-learn; Web3.py reads and optional writes. The local demo may use the unlocked Hardhat development account. Vercel writes require a dedicated external signer configured only in server-side environment variables; absent signing configuration disables writes.
- **Blockchain:** Hardhat/Solidity contracts for authorized vehicle registration, unique trips and lifecycle, checkpoint/evidence hash anchoring, incident registration, permissions and event history. Local deployment continues to use the generated `backend/deployment.json`; Vercel reads the configured contract address and chain ID from environment variables and uses a checked-in ABI derived from the contract. Contracts store hashes and minimal verification metadata, not full reports or sensor streams.
- **AI:** Three independently trainable, serializable scikit-learn classifiers for impact detection, risky driving and route deviation. Synthetic data generation is labelled as such; notebooks include preprocessing, splitting, accuracy/precision/recall and confusion matrices. Inference returns model output and provenance without inventing metrics.
- **IoT:** Python simulator emits reproducible vehicle telemetry, coordinates, speed, accelerometer/gyroscope values and emergencies to the Flask API. Arduino IDE ESP32 firmware targets NEO-6M GPS + MPU6050 with optional buzzer, and posts sensor JSON to the same API; physical readings are distinguished from simulation.
- **Evidence:** Reports/sensor payloads remain local files in local mode and are stored as canonical JSON bytes in PostgreSQL in Vercel mode. SHA-256 hashing and re-reading the same bytes on verification remain unchanged; the digest is compared against the contract record and verification includes transaction/block metadata only when a chain receipt exists.

## Runtime and dependencies

Use pnpm 11 with the pinned `packageManager` field and reviewed `pnpm-workspace.yaml` `allowBuilds` policy. Local development remains unchanged: Vite on Preview port 3000 proxies relative `/api` requests to Flask on `127.0.0.1:5000`; Hardhat JSON-RPC is `127.0.0.1:8545`. For Vercel, pin Python 3.12, expose the Flask WSGI app through the Python framework runtime, build the Vite workspace member, and route `/api/*` to Flask while other paths go to the frontend service. Select the database by configuration: `SAFEROUTE_DATABASE` is the local SQLite path; Vercel requires a pooled persistent PostgreSQL URL and must not fall back to SQLite or local files. Production JWT signing and first-admin bootstrap use protected runtime environment variables. Keep Python runtime and test dependencies distinct where possible. `.env.example` contains names and blank placeholders only; generated databases, keys, chain state and local `.env` files remain excluded from Git. No production credentials or deployment are created during preparation.

## Vercel hosting preparation

Use Vercel Services, which builds each service separately and routes both through one deployment. Route `/api/*` to the Flask Python WSGI service and the remaining paths to the Vite SPA; preserve the original `/api/...` path because Flask registers its blueprint under `/api`. Keep the development Vite proxy local-only and keep browser API requests relative.

Use a persistent PostgreSQL Marketplace provider such as Neon for Vercel records and evidence bytes. The code selects PostgreSQL only when the server-side connection URL is configured; local mode continues to use SQLite and local JSON evidence files. In Vercel mode, missing database configuration is an error, not a silent SQLite fallback. Production JWT signing and first-admin bootstrap use protected runtime environment variables; demo mode and synthetic demo seeding default off.

Use a checked-in contract ABI so the Python function does not depend on ignored Hardhat build artifacts. Local Hardhat continues using the generated deployment file and unlocked development account. Vercel chain operations require an external RPC URL, contract address, chain ID, and server-only signing key. A missing RPC, contract, or signer remains an honest unavailable/read-only state; it never creates a fake receipt or transaction.

Include the existing `.joblib` models and metrics file in the Python function and preserve their inference path. Do not retrain on Vercel's read-only function filesystem. Keep runtime dependencies within the Vercel Python function bundle limits and exclude test, notebook, dataset, IoT, Hardhat cache/artifact, and Node dependency trees from the Python bundle where the Vercel configuration allows it. Add root `vercel.json`, `.python-version`, and `backend/abi/SafeRouteRegistry.json` for the Vercel runtime. Preparation does not create external services or deploy.

## Project structure

```text
frontend/                 React/Vite UI, routes, map, components, API client
backend/                  Flask app, SQLite models/schema, API and chain integration
blockchain/contracts/     Solidity access control and transport records
blockchain/scripts/       Hardhat deployment and address export
blockchain/test/          Contract lifecycle, permissions and hash tests
ai_models/                Synthetic-data generators, training and inference modules
notebooks/                Google Colab-compatible training/evaluation notebooks
datasets/                 Clearly labelled generated training datasets
artifacts/                Local generated contract/model artifacts (ignored where appropriate)
iot/                      ESP32 sketch, simulator and device setup notes
documentation/            Architecture, hardware, AI, API and chain guides
public/                   SPA route manifest and static brand/favicon assets
README.md                 Setup, run, test and end-to-end demonstration guide
```

## Interface design

### Design movement

Operational control-room software, interpreted through a calm, contemporary transit-technology aesthetic rather than a generic admin template.

### Core principles

- Make live service state and safety exceptions legible before secondary detail.
- Treat verification provenance as first-class data: identify simulation, device, model, and chain status at the point of use.
- Use restrained color to signal meaning consistently; reserve high-intensity accents for active routes, verified records, and actionable alerts.
- Keep common trip and incident actions directly accessible without hiding them in decorative navigation.

### Color philosophy

A deep ink-navy canvas suggests a reliable operations room and reduces glare during extended monitoring. Layered blue-gray surfaces separate tools, tables, and live map without heavy borders. Cool blue communicates navigation and active service; a distinct bright aqua is SafeRoute’s signature verification/route color. Amber and red are reserved for caution and emergency states, with labels/icons as well as color to remain clear.

### Layout paradigm

A persistent, compact left navigation rail anchors the main control surface; the dashboard and tracking screens use a broad map/operations canvas with a narrower live status and alert column rather than a centered grid of equal cards. Dense history and verification views use readable tables with expandable evidence details. Smaller screens collapse the rail and stack the map, metrics, and alerts in operational priority order.

### Signature elements

1. A fine aqua route trace with checkpoint nodes across maps, trip timelines, and lifecycle details.
2. A shield/checkpoint motif that distinguishes hash-anchored records from ordinary application data.
3. Small provenance chips—**SIMULATED**, **DEVICE**, **MODEL**, **ON-CHAIN**—repeated consistently beside readings and results.

### Interaction philosophy and animation

Actions should confirm actual outcomes, not optimistically imply a chain write. Disable or explain actions when a service is unavailable; display the resulting transaction hash, block, and confirmation state only when received from the chain. Use concise inline feedback, explicit emergency confirmation, keyboard-visible focus, and accessible text for every status. Motion is restrained: short fades/slides for panel changes, a low-amplitude pulse for current vehicle positions, and a one-time route/checkpoint trace when a trip is selected. Avoid motion on every metric update and honor reduced-motion preferences.

### Typography system

Use Inter (or a clean system sans-serif fallback) for headings, navigation, and body copy. Use IBM Plex Mono (or a system monospace fallback) for coordinates, IDs, hashes, timestamps, and numeric telemetry. Establish a strong hierarchy with compact all-caps section labels, readable medium-sized operational headings, and tabular numbers for KPI values.

### Brand essence

SafeRoute is a trustworthy safety operations workspace for public-transport teams that connects live telemetry to independently verifiable trip and incident evidence. Personality: **calm, exact, accountable**.

### Brand voice

Use precise, action-oriented language; say what is known and how it is known, and never overstate certainty. Example lines: “Trip anchored. 3 checkpoints verified on the local chain.” “Impact signal detected — simulated telemetry; review before escalation.”

### Wordmark and logo

Create a compact shield/checkpoint vector mark whose single route line turns into an “S” and terminates at a verification node. Pair it with a geometric SafeRoute wordmark; use the symbol alone for favicon and tight navigation contexts.

### Signature brand color

Verification aqua **#46D9D1**, used sparingly against the dark navy palette to identify SafeRoute route traces and verified evidence.

## Material constraints

This workspace begins empty. The sandbox supports the website Preview and can run local development services, but it does not imply a physical ESP32, MetaMask installation, public Ethereum endpoint, persistent production hosting, or production identity/security. Local Hardhat and simulator operation require their documented processes to be running. The application must explain unavailable components honestly and keep simulation mode useful for a complete demonstration.
