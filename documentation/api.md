# SafeRoute HTTP API

Base URL in local development: `http://127.0.0.1:5000/api`. The Vite browser app uses relative `/api` requests and proxies them to Flask. JSON errors use `{"error":"..."}`. Authenticated routes accept `Authorization: Bearer <token>`; sensor ingestion accepts an operator/admin bearer token, a configured `X-Device-Token`, or local-demo ingestion only when demo mode is enabled and no device token is configured.

## Authentication and readiness

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | None | API and current local-chain connection/deployment status. |
| `POST` | `/auth/register` | None | `{name,email,password}`; password must be at least 10 characters; assigns `operator` role. |
| `POST` | `/auth/login` | None | `{email,password}`; returns bearer token and user. |
| `GET` | `/auth/me` | Bearer | Resolve the current account. |

## Fleet and trip lifecycle

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/overview` | Bearer | Dashboard counts, alert inbox, chain state, device/simulation counts and seed/demo flag. |
| `GET` | `/vehicles` | Bearer | List vehicle records. |
| `POST` | `/vehicles` | Admin/operator | `{name,plate,driver?,route?}`. Response includes actual registration receipt or `null`, chain state and notice. |
| `GET` | `/vehicles/:vehicle_id` | Bearer | Vehicle, trip, and latest sample details. |
| `GET` | `/tracking` | Bearer | Fleet location rows with active trip context and provenance caveat. |
| `GET` | `/trips` | Bearer | Trip records with vehicle identity. |
| `POST` | `/trips` | Admin/operator | `{vehicle_id,route_id}`. Creates application trip; chain registration/start are separate receipt fields. |
| `POST` | `/trips/:trip_id/complete` | Admin/operator | Complete an active trip; response exposes receipt if one exists. |

A successful application-level write does not assert a successful chain write. Check `chain_status`, transaction receipt fields and `/transactions`. There is no fabricated hash fallback.

## Sensor, AI, and incident routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/sensor-data` | Device token or operator | Validate/store telemetry, call local models, save checkpoint evidence, and possibly create an incident. |
| `POST` | `/simulation/tick` | Admin/operator | Send one generated sample through the same sensor-ingestion endpoint; request booleans `simulate_impact`, `simulate_deviation`, `emergency`. Always reports `source: simulation`. |
| `GET` | `/telemetry?vehicle_id=&limit=` | Bearer | Latest telemetry, max 500 rows. |
| `GET` | `/ai/summary` | Bearer | Model feature descriptions, recent samples, and persisted training metrics when available. |
| `GET` | `/driver-behaviour` | Bearer | Model outputs labelled `Risky driving`. |
| `GET` | `/route-anomalies` | Bearer | Model outputs labelled `Route deviation`. |
| `GET` | `/incidents` | Bearer | Recent incident summaries and evidence metadata. |
| `POST` | `/incidents` | Admin/operator | Manually report `{vehicle_id,classification?,severity?,source?,trip_id?,occurred_at?,sensor_readings?,note?}`. |
| `POST` | `/incidents/:incident_id/verify` | Bearer | Recompute saved evidence SHA-256, query contract if possible, and return status, stored/recomputed digests and receipt metadata. |

Sensor payload fields (all units specified):

```json
{
  "vehicle_id": "SR-021",
  "trip_id": "TRP-DEMO-001",
  "timestamp": "2026-11-18T12:00:00Z",
  "lat": 12.9715,
  "lon": 77.594,
  "speed_kmh": 34.0,
  "accel_x": 0.1,
  "accel_y": 0.0,
  "accel_z": 9.8,
  "gyro_x": 0.0,
  "gyro_y": 0.0,
  "gyro_z": 0.0,
  "acceleration_longitudinal": 0.0,
  "brake_intensity": 0.0,
  "harsh_brake_count": 0,
  "distance_from_route_m": 12.0,
  "heading_delta_deg": 5.0,
  "route_progress": 0.42,
  "emergency": false,
  "source": "simulation"
}
```

GPS is decimal degrees; speed is km/h; accelerometer and longitudinal acceleration are m/s²; gyroscope values are rad/s; brake intensity and route progress are 0–1; route distance is metres; heading delta is degrees. Some omitted numeric fields receive documented defaults. Inputs must be finite and within range. A linked trip must exist for the submitted vehicle. The simulator defaults to the seeded `SR-021` / `TRP-DEMO-001` pair.

## Chain and administration

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/transactions` | Bearer | Actual receipts recorded by the app; response includes chain and explanatory notice. |
| `GET` | `/blockchain/records` | Bearer | Vehicle IDs, lifecycle rows, checkpoint digests, incident digests and actual receipt fields. |
| `GET` | `/admin/users` | Admin | User IDs, names, emails, roles and creation times; never password hashes. |
| `GET` | `/admin/summary` | Admin | Counts and chain readiness. |

## Example curl flow

```bash
# Sign in through the local app using credentials configured outside source control.
# Set TOKEN in this shell to the bearer token returned by POST /api/auth/login.

# Inspect service status
curl -sS http://127.0.0.1:5000/api/health

# Post one explicitly simulated sensor sample to the seeded active trip
curl -sS http://127.0.0.1:5000/api/sensor-data \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"vehicle_id":"SR-021","trip_id":"TRP-DEMO-001","source":"simulation","lat":12.9716,"lon":77.5941,"speed_kmh":32,"accel_x":0.2,"accel_y":0,"accel_z":9.8,"gyro_x":0,"gyro_y":0,"gyro_z":0}'
```

The API stores evidence off-chain and includes receipt details only when actual local Hardhat writes were mined. API access control and HTTP transport are prototype quality; do not expose publicly.
