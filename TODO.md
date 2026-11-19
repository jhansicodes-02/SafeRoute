# SafeRoute delivery tracker

Status reflects the implemented prototype and the checks actually run. A checkmark does not imply production readiness, real-world model validation, authenticated hardware attestation, or physical-device testing.

## [x] Solidity contracts and genuine Hardhat blockchain records

- Use an Ethereum-compatible blockchain with Solidity smart contracts and Hardhat; create proper smart contracts and use a local Hardhat blockchain for initial development.
- Implement vehicle registration with unique blockchain IDs; unique trip registration; trip start and trip completion transactions; GPS checkpoint verification; incident and emergency event registration; hash-based evidence integrity verification; immutable trip and incident history; smart-contract-based access permissions; and transaction history with transaction hashes and timestamps.
- Store hashes and essential verification metadata on-chain. Store large sensor datasets and evidence off-chain.
- Blockchain must be genuinely implemented. Do not simply display fake blockchain transaction records. If a real chain or MetaMask is unavailable, provide a clearly labelled simulation mode.

**Verified:** Hardhat contract suite: 5 passed. Deployed `SafeRouteRegistry` to local chain ID 31337 at block 1. The live app path produced real receipts for vehicle registration, trip registration/start, GPS checkpoint, incident, and trip completion; every listed receipt had a hash, mined block number, chain ID and block timestamp. No receipt is synthesized when the node/deployment is unavailable. MetaMask was not available or used; Flask submitted through the unlocked local Hardhat development signer.

## [x] Flask backend, persistence, API, roles, and chain integration

- Use a Python Flask backend and MongoDB or SQLite database (SQLite is the approved initial local prototype choice), with Solidity smart contracts, Hardhat blockchain, and Python ML models kept as separate modules.
- Create proper API endpoints for vehicle registration; trip management; sensor data submission; AI predictions; incident registration; blockchain verification; and transaction history.
- Support the login/registration, administrator permissions, and smart-contract access permissions requested for the prototype without presenting demo authentication as production-grade security.

**Verified:** API/integration tests pass; the live Flask service ran with a fresh isolated SQLite database. The operator/admin auth routes and protected admin views were exercised in tests, and the live chain round trip passed. The runtime command is `.venv/bin/python -m backend.app` (also `pnpm api`). Prototype auth and the unlocked development signer remain explicitly documented as non-production controls.

## [x] Custom AI models, labelled datasets, and Colab training notebooks

- Develop Python models without external AI APIs as a substitute for the project's own trained models.
- Accident detection input: accelerometer and gyroscope readings. Output: Normal movement / Possible accident. Train a machine-learning classification model.
- Driver behaviour analysis input: speed, acceleration and braking patterns. Output: Safe / Risky driving. Detect overspeeding and harsh braking.
- Route anomaly detection input: GPS coordinates and registered route. Output: Normal route / Route deviation. Identify unusual route changes.
- Use separate datasets or generate clearly labelled synthetic datasets when real data is unavailable. Include preprocessing, train-test splitting, model evaluation, accuracy, precision, recall and confusion matrices.
- Save trained models and integrate them with the backend. Do not fabricate AI accuracy or imply synthetic-data evaluation proves real-world performance.

**Verified:** Three saved scikit-learn pipelines and a Colab-compatible training notebook are present. Metrics are read from the training metadata generated from held-out synthetic test rows, not hard-coded. Recorded accident accuracy / macro precision / macro recall are 0.9867 / 0.9732 / 0.9887; driving 1.0000 / 1.0000 / 1.0000; route 0.9983 / 0.9989 / 0.9965. A synthetic impact without the emergency flag produced `Possible accident` and auto-created a simulation-labelled incident. These metrics are not real-world safety validation.

## [x] ESP32 firmware, hardware guide, and usable IoT simulation

- Design the system for ESP32, NEO-6M GPS module, MPU6050 accelerometer and gyroscope, and optional buzzer for emergency alerts.
- Support real-time GPS location, vehicle speed, acceleration and movement readings, sudden impact detection, and emergency alerts.
- Provide Arduino IDE-compatible ESP32 code and instructions for connecting actual ESP32 later.
- Implement simulation mode so the entire application can be tested without physical hardware. Clearly distinguish simulated incidents/readings from actual sensor-confirmed incidents/readings; do not fabricate hardware readings.

**Verified:** Firmware, wiring guide, and deterministic simulator are present; simulator tests pass and the live simulation path remained source-labelled `simulation`. No physical ESP32/GPS/MPU6050 was connected or tested. A client-supplied `device` source label is explicitly described as device-reported, not independently hardware-attested.

## [x] Responsive SafeRoute dashboard and all requested pages

- Create a professional, modern, responsive dashboard with dark navy and blue theme, clean transport monitoring interface, professional typography, interactive maps, modern cards and charts, and responsive layout.
- Create these pages: Login and Registration; Main Dashboard; Live Vehicle Tracking; Vehicle Registration; Trip Management; Driver Behaviour Monitoring; AI Accident Detection; Route Deviation Monitoring; Blockchain Verification; Incident Reports; Transaction History; Admin Dashboard. Do not leave placeholder buttons or nonfunctional pages.
- Display total registered vehicles, active trips, completed trips, detected incidents, unsafe driving alerts, route deviations, and blockchain verification status.
- Add a live vehicle map using Leaflet and OpenStreetMap. Display simulated vehicle movement when hardware is unavailable. Allow users to select a vehicle and inspect its trip details.

**Verified:** TypeScript check and production build pass. The 13-entry static route manifest returned HTTP 200 JSON and covers the current routes. The dashboard chart uses persisted telemetry. The map's Bengaluru corridor is explicitly illustrative; it is not registered route geometry. The app is running in Preview on the configured port; it was not published.

## [x] Operational incident workflow and evidence integrity verification

- When an accident or abnormal event is detected: generate an incident ID; capture the available sensor readings and GPS coordinates; run the AI detection model; generate an incident report; calculate the evidence hash; register the incident on blockchain; and display an emergency alert on the dashboard.
- Clearly distinguish simulated incidents from actual sensor-confirmed incidents.
- Provide a Verify Evidence action that recomputes the hash of stored evidence and compares it with the blockchain record, showing whether the evidence is verified or modified.

**Verified:** The live local-chain round trip created and registered an incident with a real receipt. The verify endpoint recomputed the stored evidence hash and the contract verification read returned `verified`. A separate locally tested tamper path returns `modified`. Simulation provenance is kept explicit; there is no claim of physical sensor confirmation.

## [x] Blockchain verification and transaction history views

- The Blockchain Verification page must display vehicle blockchain ID, trip ID, trip start and completion records, GPS checkpoint hashes, incident evidence hashes, transaction hashes, block numbers, timestamps, and verification status.
- Show real transaction information only when available from actual blockchain transactions; do not fabricate blockchain transactions. Use a clearly labelled simulation mode when a real device or MetaMask is unavailable.
- The Transaction History page displays the actual transaction hashes and timestamps associated with supported lifecycle and incident events.

**Verified:** Live records contain all six actual event types, chain ID 31337, block numbers, and UTC timestamps obtained from mined receipts/blocks. Unanchored seeded demo records remain clearly unanchored and are not presented as chain transactions.

## [x] Engineering tests, documentation, and runnable end-to-end demonstration

- Test smart contracts; backend APIs; AI predictions; evidence integrity verification; simulated IoT data; and frontend/backend integration.
- Test the complete workflow from vehicle registration to trip completion and blockchain verification where local services are available.
- Create a complete README; installation instructions; environment configuration example; hardware connection guide; smart-contract deployment guide; AI model training guide; API documentation; and architecture explanation.
- At delivery, provide exact terminal commands to install dependencies, deploy smart contracts, start the backend, and launch the frontend. Run the application and fix errors; report sandbox/device limitations plainly.

**Verified:** `pnpm test` passes (5 contract tests, 14 API/model/IoT tests, and TypeScript check); `pnpm build` succeeds with route-level chunks and no oversized-chunk warning. The local chain integration and route-manifest/favicon requests were exercised. README and linked API, architecture, blockchain, AI, and hardware guides include exact commands and limitations. No public deployment was made.

## [ ] Vercel hosting preparation without deployment

- Prepare the existing SafeRoute project for hosting entirely on Vercel. Do not use Render, Railway or other hosting platforms.
- Inspect the complete frontend and Flask backend.
- Configure the application for Vercel's Python runtime.
- Preserve all existing AI models and predictions.
- Identify and fix local-only dependencies, including SQLite storage, local evidence files and localhost Hardhat RPC.
- Identify the persistent database and external blockchain RPC configuration needed.
- Configure environment variables securely.
- Check Python dependencies, model sizes and frontend build compatibility.
- Preserve all existing functionality and the working local version.
- Create the necessary Vercel configuration files.
- Do not fabricate successful deployment or blockchain transactions.
- Prepare the project and report external services or credentials required. Do not deploy until the user approves.
