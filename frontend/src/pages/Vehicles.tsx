import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, BusFront, Check, Plus, RefreshCw, ShieldCheck, Truck } from 'lucide-react';
import { api, post } from '../api/client';
import { EmptyState, formatTime, PageIntro, shortHash, SourcePill, StatusPill, Surface, SurfaceHead } from '../components/common';
import type { Vehicle } from '../types';

export function Vehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [form, setForm] = useState({ name: '', plate: '', driver: '', route: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const refresh = useCallback(() => api<{ vehicles: Vehicle[] }>('/vehicles').then((value) => setVehicles(value.vehicles)).catch((cause) => setError(cause.message)), []);
  useEffect(() => { refresh(); }, [refresh]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const result = await post<{ vehicle: Vehicle; notice?: string }>('/vehicles', form);
      setNotice(result.notice || `Vehicle ${result.vehicle.id} registered${result.vehicle.chain_status === 'anchored' ? ' on the local chain' : ' in the application store'}.`);
      setForm({ name: '', plate: '', driver: '', route: '' });
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to register vehicle.'); }
    finally { setBusy(false); }
  }

  return <div className="page-stack">
    <PageIntro eyebrow="FLEET / VEHICLE REGISTRY" title="A fleet you can account for." description="Create an application record, then inspect whether a real registration transaction reached the local contract." action={<button className="button button-secondary" onClick={() => void refresh()}><RefreshCw size={15} />Refresh fleet</button>} />
    {notice ? <div className="notice-banner notice-success" role="status"><Check size={16} />{notice}</div> : null}{error ? <div className="notice-banner notice-error" role="alert">{error}</div> : null}
    <div className="registry-layout">
      <Surface className="registry-form-surface"><SurfaceHead title="Register a vehicle" detail="Required fields are stored in the local SQLite database" /><form className="stacked-form" onSubmit={submit}><label>Vehicle display name<input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Metro Shuttle 21" /></label><label>Registration plate<input required minLength={4} value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })} placeholder="KA-03-MN-4821" /></label><label>Assigned driver<input value={form.driver} onChange={(e) => setForm({ ...form, driver: e.target.value })} placeholder="Driver name or unassigned" /></label><label>Route / service area<input value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })} placeholder="Central Loop" /></label><button className="button button-primary form-action" disabled={busy}><Plus size={16} />{busy ? 'Registering…' : 'Register vehicle'}</button><div className="form-footnote"><ShieldCheck size={14} />A chain ID is only marked anchored when a transaction receipt is returned.</div></form></Surface>
      <Surface><SurfaceHead title="Registered fleet" detail={`${vehicles.length} vehicle records · simulation and device sources stay distinct`} />
        {vehicles.length ? <div className="fleet-list">{vehicles.map((vehicle) => <div className="fleet-row" key={vehicle.id}><div className="fleet-vehicle-icon"><Truck size={19} /></div><div className="fleet-primary"><div className="fleet-title"><strong>{vehicle.name}</strong><span className="fleet-id">{vehicle.id}</span></div><p>{vehicle.plate} <span>·</span> {vehicle.driver} <span>·</span> {vehicle.route}</p><div className="fleet-metadata"><span>Chain ID <code>{shortHash(vehicle.blockchain_id || '', 14)}</code></span><span>Last update {formatTime(vehicle.last_seen)}</span></div></div><div className="fleet-state"><SourcePill source={vehicle.source} /><StatusPill tone={vehicle.chain_status === 'anchored' ? 'good' : 'warn'}>{vehicle.chain_status === 'anchored' ? 'Anchored' : vehicle.chain_status === 'unavailable' ? 'Chain unavailable' : 'Not anchored'}</StatusPill><a href="/tracking" className="icon-button" aria-label={`Track ${vehicle.id}`}><ArrowUpRight size={16} /></a></div></div>)}</div> : <EmptyState title="No vehicles registered" detail="Add your first fleet vehicle to begin managing trips." />}
      </Surface>
    </div>
    <div className="info-strip"><span className="info-icon"><BusFront size={17} /></span><span><strong>Vehicle identity is stable.</strong> SafeRoute derives a bytes32 identifier from the application vehicle ID for the contract. Existing demo fleet rows are sample records and are not automatically represented as on-chain registrations.</span></div>
  </div>;
}
