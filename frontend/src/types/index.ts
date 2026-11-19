export type User = { id: string; email: string; name: string; role: 'admin' | 'operator' | 'viewer'; created_at?: string };

export type ChainStatus = {
  available: boolean;
  node_connected: boolean;
  contract_deployed: boolean;
  contract_address: string | null;
  chain_id: number | null;
  rpc_url: string;
  message: string;
  mode: 'local_hardhat' | 'unavailable';
};

export type Vehicle = {
  id: string;
  name: string;
  plate: string;
  driver: string;
  route: string;
  blockchain_id: string;
  chain_status: string;
  last_lat: number | null;
  last_lon: number | null;
  last_speed: number;
  last_seen: string | null;
  source: 'simulation' | 'device';
  active_trip_id?: string | null;
  active_route_id?: string | null;
  trip_status?: string | null;
  created_at?: string;
};

export type Trip = {
  id: string;
  vehicle_id: string;
  route_id: string;
  status: 'active' | 'completed';
  source: 'simulation' | 'device';
  chain_status: string;
  started_at: string;
  completed_at: string | null;
  start_tx_hash: string | null;
  complete_tx_hash: string | null;
  vehicle_name?: string;
  vehicle_plate?: string;
  driver_name?: string;
  vehicle_blockchain_id?: string;
};

export type Receipt = {
  tx_hash: string;
  block_number: number;
  chain_id: number;
  timestamp: string;
  gas_used: number;
  contract_address: string | null;
};

export type Telemetry = {
  id: number;
  vehicle_id: string;
  trip_id: string | null;
  timestamp: string;
  lat: number;
  lon: number;
  speed_kmh: number;
  source: 'simulation' | 'device';
  emergency: boolean;
  accident_prediction: string | null;
  driving_prediction: string | null;
  route_prediction: string | null;
  checkpoint_id: string | null;
  evidence_hash: string | null;
  tx_hash: string | null;
  block_number: number | null;
  payload: Record<string, unknown>;
};

export type AIResult = {
  prediction: string;
  risk?: number | null;
  probability?: number | null;
  model?: string;
  provenance?: string;
  training_metrics?: Record<string, unknown> | null;
  missing_input_fields?: string[];
};

export type Incident = {
  id: string;
  vehicle_id: string;
  trip_id: string | null;
  classification: string;
  severity: string;
  source: 'simulation' | 'device';
  status: string;
  occurred_at: string;
  evidence_hash: string;
  evidence_path: string;
  chain_status: string;
  tx_hash: string | null;
  block_number: number | null;
  ai_output: Record<string, AIResult>;
  details: Record<string, unknown>;
};

export type ChainTransaction = {
  id: number;
  record_id: string;
  event_type: string;
  tx_hash: string;
  block_number: number;
  chain_id: number;
  timestamp: string;
  details: Record<string, unknown>;
};
