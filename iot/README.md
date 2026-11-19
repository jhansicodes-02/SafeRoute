# SafeRoute IoT prototype

This directory contains two deliberately separate data sources:

- **Simulator (`simulate.py`)** emits reproducible, explicitly fabricated values with `source: "simulation"`. These are not measurements and must never be described as physical-device readings.
- **ESP32 firmware (`esp32/SafeRouteESP32.ino`)** samples a connected MPU6050 and NEO-6M GPS, and reports `source: "device"`. Device values are only confirmed sensor readings when the hardware is connected and the GPS fix/time is valid. The sketch skips transmission when the GPS fix or UTC time is invalid, or when Wi-Fi is unavailable.

Neither option is a certified safety or emergency response system. Do not use it to make driving decisions.

## Simulator

From the project root, install its sole Python dependency and run a three-sample dry run:

```bash
python3 -m pip install requests
python3 iot/simulate.py --dry-run --count 3 --seed 42 --start-time 2026-01-01T00:00:00Z
```

Post three reproducible synthetic samples to the default local endpoint:

```bash
python3 iot/simulate.py --count 3 --interval 1 --seed 42
```

Trigger one synthetic impact/emergency on sample 4, plus a second one-shot emergency on sample 8:

```bash
python3 iot/simulate.py --count 10 --impact-at 4 --emergency-at 8
```

Additional exact examples:

```bash
python3 iot/simulate.py --url http://127.0.0.1:5000/api/sensor-data --vehicle-id SR-021 --no-trip-id --count 2 --dry-run
python3 iot/simulate.py --interval 0.5 --count 5 --timeout 3 --seed 9 --vehicle-id SR-021 --trip-id TRP-DEMO-001
python3 iot/simulate.py --count 0 --interval 1 --vehicle-id SR-021 --trip-id TRP-DEMO-001
```

`--count 0` runs until Ctrl-C. `--interval` is seconds and must be greater than zero. `--seed` makes generated sensor values reproducible; `--start-time` fixes the UTC timestamp origin, otherwise timestamps start at the current UTC time. The simulator catches and reports HTTP/network errors and continues, and reports non-success HTTP status codes. `--dry-run` prints JSON and never sends a request.

The synthetic trace uses a fixed Bengaluru demo-coordinate base, bounded plausible variation, and a simple progression. It is not a real location or registered route. Defaults use the seeded `SR-021` vehicle and active `TRP-DEMO-001` trip. Set `SAFEROUTE_DEVICE_TOKEN` or pass `--device-token` if the local API has a device token configured. `--impact-at N` injects a single synthetic impact and sets `emergency: true`; `--emergency-at N` injects a single braking/emergency event. Samples are numbered from 1.

## ESP32 Arduino firmware

Open `iot/esp32/SafeRouteESP32.ino` using Arduino IDE. Select a compatible **ESP32 Dev Module** board (Espressif Systems `esp32` board package). Install these libraries using Library Manager, matching the names below:

1. **TinyGPSPlus** (Mikal Hart)
2. **Adafruit MPU6050** (Adafruit)
3. **Adafruit Unified Sensor** (Adafruit; dependency of Adafruit MPU6050)
4. **ArduinoJson** (Benoit Blanchon)

`WiFi.h`, `HTTPClient.h`, and `Wire.h` come with the ESP32 Arduino core; do not install a separate HTTP client library. Open Serial Monitor at **115200 baud**. The GPS UART is initialized at **9600 baud**. The sketch samples/posts at **1000 ms** intervals.

Edit the sketch placeholders before upload:

- `WIFI_SSID` and `WIFI_PASSWORD` start empty intentionally. Enter credentials locally and do not commit real credentials.
- `API_URL` must use the Flask host's LAN IP and the configured route, e.g. `http://192.168.1.10:5000/api/sensor-data`; `127.0.0.1` on the ESP32 refers to the ESP32 itself, not your computer. If `SAFEROUTE_DEVICE_TOKEN` is configured, set the matching `DEVICE_TOKEN` placeholder in the local sketch; HTTP still exposes that token on the trusted LAN, so do not use a public network.
- `VEHICLE_ID` and `TRIP_ID` identify this device/trip. Set `TRIP_ID` to `""` to send JSON null.
- Editable pins: GPS RX/TX `16`/`17` (UART2), buzzer `25` (or `-1` to disable), I2C SDA/SCL `21`/`22`.
- Editable thresholds: `IMPACT_THRESHOLD_MPS2` defaults to `28.0` acceleration magnitude; `HARSH_DECEL_THRESHOLD_MPS2` defaults to `-4.0` longitudinal m/s². Emergency is asserted if either test triggers; buzzer is briefly activated. Tune and validate carefully for your particular mounting and sensor orientation. MPU6050 axes are not automatically aligned to vehicle axes, so the firmware's longitudinal calculation from speed change is more meaningful than a specific accelerometer axis.

### Wiring

Power down before wiring. Confirm the breakout's voltage requirements; use a regulator/level shifting as needed. Do not assume every NEO-6M or MPU6050 breakout tolerates 5 V logic.

**NEO-6M to ESP32 DevKit:** GPS TX → ESP32 GPIO16 (UART2 RX); GPS RX ← ESP32 GPIO17 (optional UART2 TX); GND → GND; VCC → module-rated supply. GPS commonly runs at 9600 baud. Allow time and a clear view of the sky for a fix.

**MPU6050 to ESP32:** SDA → GPIO21; SCL → GPIO22; GND → GND; VCC → breakout-rated supply. The sketch initializes I2C using these editable pins and relies on the module's default I2C address/configuration. **Optional buzzer:** positive/control → GPIO25, negative/GND → GND. Use a transistor/driver and appropriate protection for a buzzer that exceeds a GPIO pin's current rating; GPIO pins are not power outputs.

The serial log states when the GPS fix/time is unavailable, Wi-Fi is absent, a sensor is unavailable, or an HTTP request fails. With no valid recent GPS position (less than 5 seconds old) it skips POST rather than invent coordinates; with no valid GPS date/time it skips POST rather than inventing a UTC timestamp. GPS time/date is emitted as ISO-8601 UTC. The current sketch treats unavailable route geometry fields (`distance_from_route_m`, `heading_delta_deg`, `route_progress`) as zero placeholders; they are not route-derived measurements.

## Endpoint schema and local API requirements

The prototype expects a Flask service listening on the ESP32-reachable host/interface and implementing `POST /api/sensor-data` (or the URL configured in `API_URL`). The Python simulator's default is `http://127.0.0.1:5000/api/sensor-data`. For a device, bind Flask to a LAN interface such as `0.0.0.0` only on a trusted network, configure the host firewall to allow the intended local clients, and put the host and ESP32 on the same reachable LAN. This repo's future route may not yet exist; a 404 or connection error means API setup/network reachability needs attention.

The POST body is JSON with the specified keys and units:

| Key | Type / unit | Meaning |
|---|---|---|
| `vehicle_id` | string, required | Vehicle identifier |
| `trip_id` | string or null | Optional trip identifier |
| `timestamp` | ISO-8601 UTC string | Sample time, normally ending in `Z` |
| `lat`, `lon` | number, decimal degrees | GPS position |
| `speed_kmh` | number, km/h | Speed |
| `accel_x`, `accel_y`, `accel_z` | number, m/s² | Accelerometer axes |
| `gyro_x`, `gyro_y`, `gyro_z` | number, rad/s | Gyroscope axes |
| `acceleration_longitudinal` | number, m/s² | Longitudinal acceleration estimate |
| `brake_intensity` | number, 0–1 | Normalized braking estimate |
| `harsh_brake_count` | integer | Harsh braking count |
| `distance_from_route_m` | number, metres | Distance from route, if computed |
| `heading_delta_deg` | number, degrees | Heading difference, if computed |
| `route_progress` | number, 0–1 | Progress along route, if computed |
| `emergency` | boolean | Event flag |
| `source` | `simulation` or `device` | Explicit provenance label |

## Safe test flow

1. Start the Flask backend and verify that its sensor endpoint exists. Confirm the host/port/path before sending any requests.
2. First run the simulator in dry-run mode. Inspect `source: "simulation"`, IDs, units, UTC timestamps, and any intentional synthetic event.
3. Against a local dev API, send one synthetic sample: `python3 iot/simulate.py --count 1 --dry-run` previews only; remove `--dry-run` to actually POST. Never present that response as a sensor measurement.
4. For hardware, connect the sensors, set local Wi-Fi credentials and the host's LAN IP, upload the sketch, then inspect Serial Monitor for valid GPS fix/time and successful HTTP status. Check that received payloads say `source: "device"`; these are actual reported sensor values, subject to sensor calibration, mounting, and GPS quality.
5. Test the buzzer/threshold behavior only while safely stationary with the vehicle powered down. Do not induce impacts, perform abrupt braking, test while driving, or rely on emergency alerts for real incidents.
6. Keep the endpoint on a trusted private network: this prototype uses unauthenticated plain HTTP and does not encrypt telemetry. Never expose port 5000 or this device endpoint directly to the public Internet.
