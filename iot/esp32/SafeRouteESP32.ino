/*
  SafeRoute ESP32 sensor sender. Device readings are actual sensor measurements only
  when valid sensors/fix are available; missing GPS coordinates are sent as 0.0 with
  GPS fix validity reflected by skipping the POST. This is a prototype, not a certified
  safety system. Serial monitor: 115200 baud. Sampling/POST interval: 1000 ms.

  LOCAL-NETWORK SECURITY: plain HTTP carries telemetry without authentication or
  encryption. Use only a trusted isolated LAN and a trusted API; never expose this
  prototype endpoint to the public Internet.
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <TinyGPSPlus.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

// Keep credentials empty; enter local credentials only on your own device.
const char* WIFI_SSID = "";       // Replace locally; do not commit real credentials.
const char* WIFI_PASSWORD = "";   // Replace locally; do not commit real credentials.
const char* API_URL = "http://192.168.1.10:5000/api/sensor-data"; // Set Flask host LAN IP.
const char* DEVICE_TOKEN = ""; // Optional local token matching SAFEROUTE_DEVICE_TOKEN; never commit a real token.
const char* VEHICLE_ID = "ESP32-001";
const char* TRIP_ID = "device-trip-001"; // Set to empty string to send JSON null.

// Editable pin configuration (classic ESP32 DevKit defaults).
static const int GPS_RX_PIN = 16; // ESP32 RX2 <- NEO-6M TX
static const int GPS_TX_PIN = 17; // ESP32 TX2 -> NEO-6M RX (optional)
static const uint32_t GPS_BAUD = 9600;
static const int BUZZER_PIN = 25; // Optional active buzzer; set -1 to disable.
static const int I2C_SDA_PIN = 21;
static const int I2C_SCL_PIN = 22;
// Editable detection thresholds; impact uses acceleration magnitude in m/s^2.
static const float IMPACT_THRESHOLD_MPS2 = 28.0f;
static const float HARSH_DECEL_THRESHOLD_MPS2 = -4.0f;
static const uint32_t SAMPLE_INTERVAL_MS = 1000;

TinyGPSPlus gps;
Adafruit_MPU6050 mpu;
HardwareSerial GPSSerial(2);
bool imuReady = false;
uint32_t lastSampleMs = 0;
uint32_t harshBrakeCount = 0;
float previousSpeedKmh = 0.0f;
uint32_t lastSpeedMs = 0;

void updateGps() {
  while (GPSSerial.available()) gps.encode(GPSSerial.read());
}

void setup() {
  Serial.begin(115200);
  delay(100);
  if (BUZZER_PIN >= 0) {
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);
  }
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  imuReady = mpu.begin();
  if (!imuReady) Serial.println("MPU6050 not found; telemetry POST disabled until it is available.");
  else {
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  }
  GPSSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("GPS UART2 started at 9600 baud; waiting for valid fix.");
  if (strlen(WIFI_SSID) == 0) {
    Serial.println("Set WIFI_SSID and WIFI_PASSWORD placeholders before connecting.");
    return;
  }
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  uint32_t started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 20000) {
    delay(300); Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Connected; ESP32 IP: "); Serial.println(WiFi.localIP());
  } else Serial.println("Wi-Fi connection timed out; retrying in loop.");
}

void loop() {
  updateGps();
  if (WiFi.status() != WL_CONNECTED && strlen(WIFI_SSID) > 0) {
    WiFi.reconnect();
  }
  if (millis() - lastSampleMs < SAMPLE_INTERVAL_MS) return;
  lastSampleMs = millis();
  if (!imuReady && !mpu.begin()) {
    Serial.println("No IMU; sample skipped."); return;
  }
  imuReady = true;
  sensors_event_t accel, gyro, temp;
  mpu.getEvent(&accel, &gyro, &temp);
  float ax = accel.acceleration.x, ay = accel.acceleration.y, az = accel.acceleration.z;
  float magnitude = sqrtf(ax * ax + ay * ay + az * az);
  bool impact = magnitude >= IMPACT_THRESHOLD_MPS2;

  bool gpsValid = gps.location.isValid() && gps.location.age() < 5000;
  if (!gpsValid) {
    // Invalid/stale fix: never invent coordinates or transmit a fabricated location.
    Serial.println("GPS fix invalid/stale; waiting and skipping POST.");
    return;
  }
  float speedKmh = gps.speed.isValid() ? gps.speed.kmph() : 0.0f;
  uint32_t now = millis();
  float longitudinal = 0.0f;
  if (lastSpeedMs > 0 && now > lastSpeedMs) {
    longitudinal = ((speedKmh - previousSpeedKmh) / 3.6f) / ((now - lastSpeedMs) / 1000.0f);
  }
  previousSpeedKmh = speedKmh;
  lastSpeedMs = now;
  bool harshBrake = longitudinal <= HARSH_DECEL_THRESHOLD_MPS2;
  if (harshBrake) harshBrakeCount++;
  bool emergency = impact || harshBrake;
  // Emergency trigger: impact threshold OR longitudinal deceleration threshold.
  if (BUZZER_PIN >= 0) {
    digitalWrite(BUZZER_PIN, emergency ? HIGH : LOW);
    if (emergency) delay(120);
    digitalWrite(BUZZER_PIN, LOW);
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("No Wi-Fi; sample not posted."); return;
  }
  HTTPClient http;
  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");
  if (strlen(DEVICE_TOKEN) > 0) http.addHeader("X-Device-Token", DEVICE_TOKEN);
  StaticJsonDocument<768> doc;
  doc["vehicle_id"] = VEHICLE_ID;
  if (strlen(TRIP_ID) == 0) doc["trip_id"] = nullptr; else doc["trip_id"] = TRIP_ID;
  char timestamp[32];
  // GPS UTC date/time is used only when the receiver reports a valid timestamp.
  if (gps.date.isValid() && gps.time.isValid()) {
    snprintf(timestamp, sizeof(timestamp), "%04d-%02d-%02dT%02d:%02d:%02dZ",
      gps.date.year(), gps.date.month(), gps.date.day(), gps.time.hour(), gps.time.minute(), gps.time.second());
    doc["timestamp"] = timestamp;
  } else {
    // UTC epoch fallback: millisecond timestamp from GPS is unavailable, so use ISO UTC from compile-independent uptime is not valid.
    // Skip rather than fabricate a UTC timestamp.
    http.end(); Serial.println("GPS UTC time invalid; sample skipped."); return;
  }
  doc["lat"] = gps.location.lat(); doc["lon"] = gps.location.lng();
  doc["speed_kmh"] = speedKmh;
  doc["accel_x"] = ax; doc["accel_y"] = ay; doc["accel_z"] = az;
  doc["gyro_x"] = gyro.gyro.x; doc["gyro_y"] = gyro.gyro.y; doc["gyro_z"] = gyro.gyro.z;
  doc["acceleration_longitudinal"] = longitudinal;
  doc["brake_intensity"] = constrain((-longitudinal) / 8.0f, 0.0f, 1.0f);
  doc["harsh_brake_count"] = harshBrakeCount;
  // Route-derived fields unavailable without route geometry; conservative device placeholders.
  doc["distance_from_route_m"] = 0.0f; doc["heading_delta_deg"] = 0.0f; doc["route_progress"] = 0.0f;
  doc["emergency"] = emergency;
  doc["source"] = "device";
  String body; serializeJson(doc, body);
  int status = http.POST(body);
  Serial.printf("POST %s (%d)\n", emergency ? "EMERGENCY" : "sample", status);
  if (status < 0) Serial.printf("HTTP error: %s\n", http.errorToString(status).c_str());
  else if (status >= 400) Serial.println(http.getString());
  http.end();
}
