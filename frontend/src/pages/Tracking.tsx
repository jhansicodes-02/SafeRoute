import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock3, Gauge, MapPin, Radio, RefreshCw, Route, ShieldAlert, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, post } from '../api/client';
import { MapPanel } from '../components/MapPanel';
import { EmptyState, formatTime, PageIntro, SourcePill, StatusPill, Surface, SurfaceHead } from '../components/common';
import type { Telemetry, Vehicle } from '../types';

export function Tracking() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [telemetry, setTelemetry] = useState<Telemetry[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const selected = useMemo(() => vehicles.find((vehicle) => vehicle.id === selectedId) || vehicles[0], [vehicles, selectedId]);

  const refresh = useCallback(async () => {
    try {
      const result = await api<{ vehicles: Vehicle[] }>('/tracking');
      setVehicles(result.vehicles);
      if (!selectedId && result.vehicles[0]) setSelectedId(result.vehicles[0].id);
      if (selected?.id) {
        const recent = await api<{ telemetry: Telemetry[] }>(`/telemetry?vehicle_id=${encodeURIComponent(selected.id)}&limit=8`);
        setTelemetry(recent.telemetry);
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Tracking data unavailable.'); }
  }, [selected?.id, selectedId]);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 9000); return () => window.clearInterval(timer); }, [refresh]);

  async function simulate(kind: 'normal' | 'impact' | 'deviation') {
    if (!selected) return;
    setBusy(true);
    setNotice('');
    try {
      const result = await post<{ checkpoint: { chain_status: string }; ai: Record<string, { prediction: string }>; incident?: { id: string } | null }>('/simulation/tick', {
        vehicle_id: selected.id,
        simulate_impact: kind === 'impact',
        simulate_deviation: kind === 'deviation',
        emergency: false,
      });
      setNotice(kind === 'impact' ? `Synthetic impact evaluated as “${result.ai.accident.prediction}”. ${result.incident ? `Incident ${result.incident.id} created.` : 'No incident threshold was met.'}` : kind === 'deviation' ? `Route model returned “${result.ai.route.prediction}”.` : `New simulated checkpoint. Chain status: ${result.checkpoint.chain_status}.`);
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to send simulation data.'); }
    finally { setBusy(false); }
  }

  return <div className="page-stack">
    <PageIntro eyebrow="COMMAND / LIVE TRACKING" title="Movement with provenance." description="Inspect reported locations and trip context. Source labels are client-reported, not hardware attestation." action={<button className="button button-secondary" onClick={() => void refresh()}><RefreshCw size={15} />Refresh</button>} />
    {notice ? <div className="notice-banner" role="status">{notice}</div> : null}
    <div className="tracking-layout">
      <Surface className="tracking-map-surface">
        <SurfaceHead title="Fleet map" detail="OpenStreetMap · demo city coordinates" action={<StatusPill tone="aqua">SOURCE TAGGED</StatusPill>} />
        {vehicles.length ? <MapPanel vehicles={vehicles} selectedVehicle={selected?.id} onSelect={setSelectedId} /> : <div className="map-loading">Loading vehicle positions…</div>}
      </Surface>
      <div className="tracking-side">
        <Surface>
          <SurfaceHead title="Vehicle focus" detail="Choose an asset to inspect" />
          {selected ? <>
            <div className="vehicle-select-list">
              {vehicles.map((vehicle) => <button className={`vehicle-select-row ${selected.id === vehicle.id ? 'selected' : ''}`} key={vehicle.id} onClick={() => setSelectedId(vehicle.id)}>
                <span className={`vehicle-mini-icon ${vehicle.source === 'device' ? 'device-mini' : ''}`}><Radio size={15} /></span>
                <span className="vehicle-select-copy"><strong>{vehicle.name}</strong><small>{vehicle.id} · {vehicle.route}</small></span>
                <span className="select-speed">{vehicle.last_speed.toFixed(0)}<small>km/h</small></span>
              </button>)}
            </div>
            <div className="selected-vehicle">
              <div className="selected-vehicle-head"><div><span className="eyebrow">SELECTED VEHICLE</span><h3>{selected.id}</h3></div><SourcePill source={selected.source} /></div>
              <p>{selected.name} · {selected.plate}</p>
              <div className="vehicle-facts">
                <div><MapPin size={14} /><span>POSITION</span><strong>{selected.last_lat?.toFixed(5) ?? '—'}, {selected.last_lon?.toFixed(5) ?? '—'}</strong></div>
                <div><Gauge size={14} /><span>SPEED</span><strong>{selected.last_speed.toFixed(1)} km/h</strong></div>
                <div><Clock3 size={14} /><span>LAST REPORT</span><strong>{formatTime(selected.last_seen)}</strong></div>
                <div><Route size={14} /><span>ACTIVE TRIP</span><strong>{selected.active_trip_id || 'None recorded'}</strong></div>
              </div>
              <div className="selected-chain-row"><span>Blockchain ID</span><code>{selected.blockchain_id || 'Pending registration'}</code></div>
            </div>
          </> : <EmptyState title="No vehicles yet" detail="Register a vehicle before live tracking begins." />}
        </Surface>
        <Surface>
          <SurfaceHead title="Simulation controls" detail="Generated values are explicitly labelled" />
          <div className="simulation-actions">
            <button className="simulation-action" disabled={busy || !selected} onClick={() => void simulate('normal')}><span className="action-icon action-aqua"><Radio size={15} /></span><span><strong>Send checkpoint</strong><small>Synthetic normal telemetry</small></span><ArrowRight size={14} /></button>
            <button className="simulation-action" disabled={busy || !selected} onClick={() => void simulate('impact')}><span className="action-icon action-red"><Zap size={15} /></span><span><strong>Simulate impact alert</strong><small>Test AI + incident flow</small></span><ArrowRight size={14} /></button>
            <button className="simulation-action" disabled={busy || !selected} onClick={() => void simulate('deviation')}><span className="action-icon action-amber"><ShieldAlert size={15} /></span><span><strong>Simulate route deviation</strong><small>Test anomaly classifier</small></span><ArrowRight size={14} /></button>
          </div>
        </Surface>
      </div>
    </div>
    <Surface>
      <SurfaceHead title="Recent vehicle telemetry" detail={selected ? `${selected.id} · latest received samples` : 'Latest sensor samples'} />
      {telemetry.length ? <div className="table-scroll"><table><thead><tr><th>TIME</th><th>LOCATION</th><th>SPEED</th><th>AI SIGNALS</th><th>SOURCE</th><th>CHECKPOINT</th></tr></thead><tbody>{telemetry.map((item) => <tr key={item.id}><td>{formatTime(item.timestamp)}</td><td className="mono">{item.lat.toFixed(5)}, {item.lon.toFixed(5)}</td><td>{item.speed_kmh.toFixed(1)} km/h</td><td><div className="signal-pills"><StatusPill tone={item.accident_prediction === 'Possible accident' ? 'bad' : 'good'}>{item.accident_prediction || 'Not evaluated'}</StatusPill><StatusPill tone={item.driving_prediction === 'Risky driving' ? 'warn' : 'neutral'}>{item.driving_prediction || '—'}</StatusPill></div></td><td><SourcePill source={item.source} /></td><td>{item.tx_hash ? <Link className="mono text-link" to="/transactions">{item.tx_hash.slice(0, 10)}…</Link> : <StatusPill tone="warn">Not anchored</StatusPill>}</td></tr>)}</tbody></table></div> : <EmptyState title="No telemetry samples" detail="Use a simulation control or connect the ESP32 to populate this view." />}
    </Surface>
  </div>;
}
