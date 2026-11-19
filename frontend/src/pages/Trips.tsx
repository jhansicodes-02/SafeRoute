import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCheck, CirclePlay, Route as RouteIcon, ShieldCheck } from 'lucide-react';
import { api, post } from '../api/client';
import { EmptyState, formatTime, PageIntro, StatusPill, Surface, SurfaceHead } from '../components/common';
import type { Trip, Vehicle } from '../types';

export function Trips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [tripData, vehicleData] = await Promise.all([api<{ trips: Trip[] }>('/trips'), api<{ vehicles: Vehicle[] }>('/vehicles')]);
      setTrips(tripData.trips); setVehicles(vehicleData.vehicles);
      if (!vehicleId && vehicleData.vehicles[0]) setVehicleId(vehicleData.vehicles[0].id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load trips.'); }
  }, [vehicleId]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(''); setError('');
    try {
      const result = await post<{ trip: Trip; transactions: Record<string, { tx_hash: string } | null>; notice?: string }>('/trips', { vehicle_id: vehicleId, route_id: routeId });
      const receiptCount = Object.values(result.transactions || {}).filter(Boolean).length;
      setNotice(result.notice || `Trip ${result.trip.id} started. ${receiptCount} local-chain lifecycle receipt(s) returned.`);
      setRouteId(''); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to start this trip.'); }
    finally { setBusy(false); }
  }

  async function complete(trip: Trip) {
    setBusy(true); setNotice(''); setError('');
    try {
      const result = await post<{ trip: Trip; transaction: { tx_hash: string } | null; notice?: string }>(`/trips/${encodeURIComponent(trip.id)}/complete`, {});
      setNotice(result.notice || `Trip ${trip.id} completed${result.transaction ? ' with a chain receipt' : ' in the application store; no chain receipt was created'}.`);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to complete this trip.'); }
    finally { setBusy(false); }
  }

  return <div className="page-stack">
    <PageIntro eyebrow="FLEET / TRIP OPERATIONS" title="Lifecycle, recorded." description="Vehicle assignment, trip registration, start, checkpoints, and completion are tracked separately from chain receipt status." />
    {notice ? <div className="notice-banner" role="status">{notice}</div> : null}{error ? <div className="notice-banner notice-error" role="alert">{error}</div> : null}
    <div className="trip-create-layout"><Surface className="trip-create-card"><SurfaceHead title="Start a trip" detail="One active trip per vehicle" /><form className="inline-form" onSubmit={create}><label>Vehicle<select required value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}><option value="">Select a vehicle</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.id} · {vehicle.name}</option>)}</select></label><label>Route / service ID<input required minLength={2} value={routeId} onChange={(e) => setRouteId(e.target.value)} placeholder="Central Loop" /></label><button className="button button-primary" disabled={busy || !vehicles.length}><CirclePlay size={16} />{busy ? 'Starting…' : 'Register & start trip'}</button></form><p className="trip-chain-note"><ShieldCheck size={14} />With Hardhat deployed, a trip uses distinct vehicle registration, trip registration, and trip-start transactions. Without it, only local SQLite state changes.</p></Surface><div className="trip-status-tile"><div className="trip-tile-icon"><RouteIcon size={18} /></div><span>ACTIVE SERVICE</span><strong>{trips.filter((trip) => trip.status === 'active').length.toString().padStart(2, '0')}</strong><small>{vehicles.length} registered vehicles</small></div><div className="trip-status-tile"><div className="trip-tile-icon tile-green"><CheckCheck size={18} /></div><span>COMPLETED</span><strong>{trips.filter((trip) => trip.status === 'completed').length.toString().padStart(2, '0')}</strong><small>Stored trip records</small></div></div>
    <Surface><SurfaceHead title="Trip register" detail="Current and completed application records" />
      {trips.length ? <div className="table-scroll"><table><thead><tr><th>TRIP</th><th>VEHICLE / DRIVER</th><th>ROUTE</th><th>STARTED</th><th>STATE</th><th>CHAIN</th><th></th></tr></thead><tbody>{trips.map((trip) => <tr key={trip.id}><td><strong className="mono">{trip.id}</strong></td><td><span>{trip.vehicle_name || trip.vehicle_id}</span><small className="table-subline">{trip.vehicle_plate || trip.driver_name || 'Vehicle'}</small></td><td><span className="route-text"><RouteIcon size={13} />{trip.route_id}</span></td><td>{formatTime(trip.started_at)}{trip.completed_at ? <small className="table-subline">Done {formatTime(trip.completed_at)}</small> : null}</td><td><StatusPill tone={trip.status === 'active' ? 'good' : 'neutral'}>{trip.status === 'active' ? 'In progress' : 'Completed'}</StatusPill></td><td><StatusPill tone={trip.chain_status === 'anchored' ? 'good' : trip.chain_status === 'partially_anchored' ? 'warn' : 'neutral'}>{trip.chain_status === 'anchored' ? 'Anchored' : trip.chain_status === 'partially_anchored' ? 'Partial' : 'Local only'}</StatusPill></td><td>{trip.status === 'active' ? <button className="button button-small button-secondary" disabled={busy} onClick={() => void complete(trip)}>Complete <ArrowRight size={13} /></button> : <span className="muted">—</span>}</td></tr>)}</tbody></table></div> : <EmptyState title="No trips available" detail="Start a trip from a registered vehicle to see its lifecycle here." />}
    </Surface>
  </div>;
}
