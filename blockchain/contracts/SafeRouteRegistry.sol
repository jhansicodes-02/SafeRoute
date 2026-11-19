// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SafeRouteRegistry
/// @notice Stores compact identifiers, lifecycle data, coordinates and evidence digests; bulky evidence remains off-chain.
contract SafeRouteRegistry {
    address public owner;
    mapping(address => bool) public admins;
    mapping(address => bool) public operators;

    struct Vehicle {
        bytes32 id;
        string externalVehicleId;
        string metadata;
        uint64 registeredAt;
        bool exists;
    }
    struct Trip {
        bytes32 id;
        bytes32 vehicleId;
        bytes32 routeId;
        uint64 registeredAt;
        uint64 startedAt;
        uint64 completedAt;
        bool exists;
        bool started;
        bool completed;
    }
    struct Checkpoint {
        bytes32 id;
        bytes32 tripId;
        bytes32 evidenceHash;
        int32 latitudeE6;
        int32 longitudeE6;
        uint64 recordedAt;
        bool exists;
    }
    struct Incident {
        bytes32 id;
        bytes32 tripId;
        bytes32 evidenceHash;
        uint8 severity;
        uint64 recordedAt;
        bool exists;
    }
    struct Evidence {
        bytes32 digest;
        uint64 recordedAt;
        bool exists;
    }

    mapping(bytes32 => Vehicle) private vehicles;
    mapping(bytes32 => Trip) private trips;
    mapping(bytes32 => Checkpoint) private checkpoints;
    mapping(bytes32 => Incident) private incidents;
    mapping(bytes32 => Evidence) private evidenceRecords;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AdminUpdated(address indexed account, bool enabled);
    event OperatorUpdated(address indexed account, bool enabled);
    event VehicleRegistered(bytes32 indexed vehicleId, string externalVehicleId, string metadata, address indexed registrar, uint64 timestamp);
    event TripRegistered(bytes32 indexed tripId, bytes32 indexed vehicleId, bytes32 indexed routeId, address registrar, uint64 timestamp);
    event TripStarted(bytes32 indexed tripId, uint64 timestamp, address indexed operator);
    event TripCompleted(bytes32 indexed tripId, uint64 timestamp, address indexed operator);
    event CheckpointRecorded(bytes32 indexed checkpointId, bytes32 indexed tripId, int32 latitudeE6, int32 longitudeE6, bytes32 evidenceHash, uint64 timestamp, address indexed operator);
    event IncidentRecorded(bytes32 indexed incidentId, bytes32 indexed tripId, bytes32 evidenceHash, uint8 severity, uint64 timestamp, address indexed operator);
    event EvidenceRecorded(bytes32 indexed evidenceId, bytes32 digest, uint64 timestamp, address indexed operator);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier onlyAdmin() { require(msg.sender == owner || admins[msg.sender], "not admin"); _; }
    modifier onlyOperator() { require(msg.sender == owner || admins[msg.sender] || operators[msg.sender], "not authorized operator"); _; }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        address previous = owner;
        owner = newOwner;
        emit OwnershipTransferred(previous, newOwner);
    }

    function setAdmin(address account, bool enabled) external onlyOwner {
        require(account != address(0), "zero account");
        admins[account] = enabled;
        emit AdminUpdated(account, enabled);
    }

    function setOperator(address account, bool enabled) external onlyAdmin {
        require(account != address(0), "zero account");
        operators[account] = enabled;
        emit OperatorUpdated(account, enabled);
    }

    function registerVehicle(bytes32 vehicleId, string calldata externalVehicleId, string calldata metadata) external onlyOperator {
        require(vehicleId != bytes32(0), "empty vehicle id");
        require(!vehicles[vehicleId].exists, "vehicle exists");
        require(bytes(externalVehicleId).length != 0, "empty external id");
        vehicles[vehicleId] = Vehicle(vehicleId, externalVehicleId, metadata, uint64(block.timestamp), true);
        emit VehicleRegistered(vehicleId, externalVehicleId, metadata, msg.sender, uint64(block.timestamp));
    }

    function registerTrip(bytes32 tripId, bytes32 vehicleId, bytes32 routeId) external onlyOperator {
        require(tripId != bytes32(0) && routeId != bytes32(0), "empty trip or route id");
        require(!trips[tripId].exists, "trip exists");
        require(vehicles[vehicleId].exists, "vehicle missing");
        trips[tripId] = Trip(tripId, vehicleId, routeId, uint64(block.timestamp), 0, 0, true, false, false);
        emit TripRegistered(tripId, vehicleId, routeId, msg.sender, uint64(block.timestamp));
    }

    function startTrip(bytes32 tripId) external onlyOperator {
        Trip storage t = trips[tripId];
        require(t.exists, "trip missing");
        require(!t.started && !t.completed, "invalid lifecycle");
        t.started = true;
        t.startedAt = uint64(block.timestamp);
        emit TripStarted(tripId, t.startedAt, msg.sender);
    }

    function completeTrip(bytes32 tripId) external onlyOperator {
        Trip storage t = trips[tripId];
        require(t.exists, "trip missing");
        require(t.started && !t.completed, "invalid lifecycle");
        t.completed = true;
        t.completedAt = uint64(block.timestamp);
        emit TripCompleted(tripId, t.completedAt, msg.sender);
    }

    function recordCheckpoint(bytes32 checkpointId, bytes32 tripId, int32 latitudeE6, int32 longitudeE6, bytes32 evidenceHash) external onlyOperator {
        require(checkpointId != bytes32(0) && !checkpoints[checkpointId].exists, "checkpoint exists or empty");
        require(trips[tripId].exists && trips[tripId].started && !trips[tripId].completed, "trip not active");
        require(latitudeE6 >= -90000000 && latitudeE6 <= 90000000, "latitude out of range");
        require(longitudeE6 >= -180000000 && longitudeE6 <= 180000000, "longitude out of range");
        checkpoints[checkpointId] = Checkpoint(checkpointId, tripId, evidenceHash, latitudeE6, longitudeE6, uint64(block.timestamp), true);
        emit CheckpointRecorded(checkpointId, tripId, latitudeE6, longitudeE6, evidenceHash, uint64(block.timestamp), msg.sender);
    }

    function recordIncident(bytes32 incidentId, bytes32 tripId, bytes32 evidenceHash, uint8 severity) external onlyOperator {
        require(incidentId != bytes32(0) && !incidents[incidentId].exists, "incident exists or empty");
        require(trips[tripId].exists, "trip missing");
        require(severity > 0, "invalid severity");
        incidents[incidentId] = Incident(incidentId, tripId, evidenceHash, severity, uint64(block.timestamp), true);
        emit IncidentRecorded(incidentId, tripId, evidenceHash, severity, uint64(block.timestamp), msg.sender);
    }

    function recordEvidence(bytes32 evidenceId, bytes32 digest) external onlyOperator {
        require(evidenceId != bytes32(0) && !evidenceRecords[evidenceId].exists, "evidence exists or empty");
        evidenceRecords[evidenceId] = Evidence(digest, uint64(block.timestamp), true);
        emit EvidenceRecorded(evidenceId, digest, uint64(block.timestamp), msg.sender);
    }

    /// @notice Compare a candidate SHA-256 digest (bytes32) against an evidence digest on-chain.
    function verifyEvidence(bytes32 evidenceId, bytes32 candidateHash) external view returns (bool) {
        Evidence storage e = evidenceRecords[evidenceId];
        return e.exists && e.digest == candidateHash;
    }

    function verifyCheckpointHash(bytes32 checkpointId, bytes32 candidateHash) external view returns (bool) {
        Checkpoint storage c = checkpoints[checkpointId];
        return c.exists && c.evidenceHash == candidateHash;
    }

    function verifyIncidentHash(bytes32 incidentId, bytes32 candidateHash) external view returns (bool) {
        Incident storage i = incidents[incidentId];
        return i.exists && i.evidenceHash == candidateHash;
    }

    function getVehicle(bytes32 vehicleId) external view returns (Vehicle memory) { require(vehicles[vehicleId].exists, "vehicle missing"); return vehicles[vehicleId]; }
    function getTrip(bytes32 tripId) external view returns (Trip memory) { require(trips[tripId].exists, "trip missing"); return trips[tripId]; }
    function getCheckpoint(bytes32 checkpointId) external view returns (Checkpoint memory) { require(checkpoints[checkpointId].exists, "checkpoint missing"); return checkpoints[checkpointId]; }
    function getIncident(bytes32 incidentId) external view returns (Incident memory) { require(incidents[incidentId].exists, "incident missing"); return incidents[incidentId]; }
    function getEvidence(bytes32 evidenceId) external view returns (Evidence memory) { require(evidenceRecords[evidenceId].exists, "evidence missing"); return evidenceRecords[evidenceId]; }
}
