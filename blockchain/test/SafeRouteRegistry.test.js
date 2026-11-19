const { expect } = require("chai");
const { ethers } = require("hardhat");

const id = (value) => ethers.keccak256(ethers.toUtf8Bytes(value));
const digest = (hex) => ethers.hexlify(ethers.sha256(ethers.toUtf8Bytes(hex)));

async function expectRevert(operation, expectedMessage) {
  try {
    const transaction = await operation();
    if (transaction && typeof transaction.wait === "function") await transaction.wait();
  } catch (error) {
    const reason = [error.shortMessage, error.reason, error.message].filter(Boolean).join(" ");
    expect(reason, `expected revert containing: ${expectedMessage}`).to.include(expectedMessage);
    return;
  }
  expect.fail(`Expected the operation to revert with: ${expectedMessage}`);
}

describe("SafeRouteRegistry", function () {
  async function setup() {
    const [owner, operator, outsider] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SafeRouteRegistry");
    const registry = await Factory.deploy();
    await registry.waitForDeployment();
    await registry.setOperator(operator.address, true);
    return { registry, owner, operator, outsider };
  }

  it("registers vehicles and trips with unique IDs", async function () {
    const { registry, operator } = await setup();
    const vehicleId = id("vehicle-001");
    const tripId = id("trip-001");
    await registry.connect(operator).registerVehicle(vehicleId, "VAN-001", "{\"type\":\"van\"}");
    expect((await registry.getVehicle(vehicleId)).externalVehicleId).to.equal("VAN-001");
    await expectRevert(() => registry.connect(operator).registerVehicle(vehicleId, "VAN-002", ""), "vehicle exists");
    await registry.connect(operator).registerTrip(tripId, vehicleId, id("route-A"));
    expect((await registry.getTrip(tripId)).vehicleId).to.equal(vehicleId);
    await expectRevert(() => registry.connect(operator).registerTrip(tripId, vehicleId, id("route-B")), "trip exists");
  });

  it("enforces valid trip lifecycle and records timestamps", async function () {
    const { registry, operator } = await setup();
    const vehicleId = id("vehicle"), tripId = id("trip");
    await registry.connect(operator).registerVehicle(vehicleId, "EXT-1", "");
    await registry.connect(operator).registerTrip(tripId, vehicleId, id("route"));
    await expectRevert(() => registry.connect(operator).completeTrip(tripId), "invalid lifecycle");
    await registry.connect(operator).startTrip(tripId);
    const started = await registry.getTrip(tripId);
    expect(started.started).to.equal(true);
    expect(started.startedAt > 0n).to.equal(true);
    await expectRevert(() => registry.connect(operator).startTrip(tripId), "invalid lifecycle");
    await registry.connect(operator).completeTrip(tripId);
    const completed = await registry.getTrip(tripId);
    expect(completed.completed).to.equal(true);
    expect(completed.completedAt >= completed.startedAt).to.equal(true);
    await expectRevert(() => registry.connect(operator).completeTrip(tripId), "invalid lifecycle");
  });

  it("records checkpoints and verifies matching evidence hashes", async function () {
    const { registry, operator } = await setup();
    const vehicleId = id("vehicle"), tripId = id("trip"), checkpointId = id("checkpoint");
    const evidenceHash = digest("photo-bytes-reference");
    await registry.connect(operator).registerVehicle(vehicleId, "EXT-1", "");
    await registry.connect(operator).registerTrip(tripId, vehicleId, id("route"));
    await registry.connect(operator).startTrip(tripId);
    await registry.connect(operator).recordCheckpoint(checkpointId, tripId, 37774900, -122419400, evidenceHash);
    const checkpoint = await registry.getCheckpoint(checkpointId);
    expect(checkpoint.evidenceHash).to.equal(evidenceHash);
    expect(checkpoint.latitudeE6).to.equal(37774900n);
    expect(await registry.verifyCheckpointHash(checkpointId, evidenceHash)).to.equal(true);
    expect(await registry.verifyCheckpointHash(checkpointId, digest("different"))).to.equal(false);
  });

  it("records incidents and verifies incident hashes", async function () {
    const { registry, operator } = await setup();
    const vehicleId = id("vehicle"), tripId = id("trip"), incidentId = id("incident");
    const evidenceHash = digest("incident-evidence");
    await registry.connect(operator).registerVehicle(vehicleId, "EXT-1", "");
    await registry.connect(operator).registerTrip(tripId, vehicleId, id("route"));
    await registry.connect(operator).recordIncident(incidentId, tripId, evidenceHash, 3);
    expect((await registry.getIncident(incidentId)).severity).to.equal(3n);
    expect(await registry.verifyIncidentHash(incidentId, evidenceHash)).to.equal(true);
    expect(await registry.verifyIncidentHash(incidentId, digest("other"))).to.equal(false);
    await expectRevert(() => registry.connect(operator).recordIncident(incidentId, tripId, evidenceHash, 2), "incident exists or empty");
  });

  it("restricts writes to authorized operators and role administrators", async function () {
    const { registry, owner, outsider, operator } = await setup();
    await expectRevert(() => registry.connect(outsider).registerVehicle(id("v"), "EXT", ""), "not authorized operator");
    await expectRevert(() => registry.connect(operator).setOperator(outsider.address, true), "not admin");
    await registry.setAdmin(outsider.address, true);
    await registry.connect(outsider).setOperator(outsider.address, true);
    await registry.connect(outsider).registerVehicle(id("v"), "EXT", "");
    await expectRevert(() => registry.connect(outsider).setAdmin(operator.address, true), "not owner");
    expect(await registry.owner()).to.equal(owner.address);
  });
});
