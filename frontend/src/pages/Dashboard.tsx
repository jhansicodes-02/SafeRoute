import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, ArrowUpRight, Blocks, CheckCheck, Gauge, Radio, Route, ShieldCheck, Truck, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, post } from '../api/client';
import { MapPanel } from '../components/MapPanel';
import { EmptyState, formatTime, PageIntro, SourcePill, StatusPill, Surface, SurfaceHead } from '../components/common';
import { Area, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChainStatus, Incident, Telemetry, Vehicle } from '../types';

type Overview = {
  stats: { total_vehicles: number; active_trips: number; completed_trips: number; detected_incidents: number; unsafe_driving_alerts: number; route_deviations: number; verified_records: number; device_reported_records: number; simulation_records: number };
  chain: ChainStatus;
  alerts: Incident[];
  vehicles: Vehicle[];
  demo_mode: boolean;
};

const metricDefinitions = [
  { key: 'total_vehicles', label: 'Registered vehicles', icon: Truck, color: 'blue' },
  { key: 'active_trips', label: 'Active trips', icon: Route, color: 'aqua' },
  { key: 'completed_trips', label: 'Completed trips', icon: CheckCheck, color: 'green' },
  { key: 'detected_incidents', label: 'Safety incidents', icon: AlertTriangle, color: 'red' },
  { key: 'unsafe_driving_alerts', label: 'Risky driving signals', icon: Gauge, color: 'amber' },
  { key: 'route_deviations', label: 'Route deviations', icon: Activity, color: 'purple' },
  { key: 'verified_records', label: 'On-chain receipts', icon: ShieldCheck, color: 'green' },
] as const;

export function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [result, recent] = await Promise.all([api<Overview>('/overview'), api<{ telemetry: Telemetry[] }>('/telemetry?limit=36')]);
      setOverview(result);
      setTelemetry(recent.telemetry.slice().reverse());
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Dashboard data is unavailable.'); }
  }, []);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 12000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function simulate(impact = false) {
    const vehicle = overview?.vehicles.find((item) => item.active_trip_id || item.id === 'SR-021') || overview?.vehicles[0];
    if (!vehicle) return;
    setBusy(true);
    setNotice('');
    try {
      const result = await post<{ ai: Record<string, { prediction: string }>; checkpoint: { chain_status: string }; incident?: Incident | null }>('/simulation/tick', { vehicle_id: vehicle.id, simulate_impact: impact, emergency: false });
      setNotice(impact ? `Synthetic impact evaluated as ${result.ai.accident.prediction}. Incident ${result.incident?.id || 'not triggered'}; source is simulation.` : `Synthetic checkpoint saved. Chain status: ${result.checkpoint.chain_status}.`);
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Simulation failed.'); }
    finally { setBusy(false); }
  }

  const stats = overview?.stats;
  const chartData = telemetry.map((item, index) => ({
    sample: index + 1,
    time: new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.timestamp)),
    speed: Number(item.speed_kmh.toFixed(1)),
    alerts: Number(item.emergency || item.accident_prediction === 'Possible accident' || item.driving_prediction === 'Risky driving' || item.route_prediction === 'Route deviation'),
  }));
  return (
    <div className="page-stack">
      <PageIntro eyebrow="COMMAND / OVERVIEW" title="Safety, in context." description="Fleet movement, model signals, and verifiable records in one operating view." action={<Link to="/tracking" className="button button-secondary">Open live tracking <ArrowRight size={15} /></Link>} />
      <section className="dashboard-banner">
        <div className="banner-copy"><div className="banner-label"><span className="banner-pip" />SAFEROUTE OPERATIONS · {overview?.demo_mode ? 'SIMULATION MODE' : 'LIVE MODE'}</div><h2>Every journey leaves<br /><span>a verifiable trace.</span></h2><p>Monitor trips and safety events. Anchor evidence only when the local contract is connected.</p><div className="banner-actions"><button className="button button-aqua" onClick={() => simulate(false)} disabled={busy}><Radio size={15} />{busy ? 'Sending…' : 'Generate simulated checkpoint'}</button><button className="button button-glass" onClick={() => simulate(true)} disabled={busy}><Zap size={15} />Simulate impact alert</button></div>{notice ? <div className="inline-notice" role="status">{notice}</div> : null}</div>
        <div className="banner-visual"><div className="radar-ring ring-outer" /><div className="radar-ring ring-middle" /><div className="radar-ring ring-inner" /><div className="radar-center"><ShieldCheck size={24} /></div><span className="radar-node node-a" /><span className="radar-node node-b" /><span className="radar-node node-c" /><div className="radar-label label-a">TRIP LOG</div><div className="radar-label label-b">HASH ANCHORED</div></div>
        <span className="banner-index">SR / 01</span>
      </section>
      <section className="metric-grid">
        {metricDefinitions.map(({ key, label, icon: Icon, color }) => <div className="metric-card" key={key}><div className={`metric-icon metric-${color}`}><Icon size={17} /></div><span className="metric-label">{label}</span><strong className="metric-value">{stats?.[key] ?? '—'}</strong><span className="metric-foot">{key === 'verified_records' ? 'Actual chain receipts' : key === 'detected_incidents' ? 'Operator-visible reports' : 'Application records'}</span></div>)}
      </section>
      <div className="dashboard-main-grid">
        <Surface className="map-surface"><SurfaceHead title="Fleet positions" detail="Last reported coordinates · source-tagged" action={<Link to="/tracking" className="text-link">Full map <ArrowUpRight size={14} /></Link>} />
          {overview?.vehicles ? <MapPanel vehicles={overview.vehicles} compact /> : <div className="map-loading">Loading map data…</div>}
          <div className="map-summary-row"><span><i className="legend-dot aqua" />Simulation records <strong>{stats?.simulation_records ?? 0}</strong></span><span><i className="legend-dot green" />Device-reported <strong>{stats?.device_reported_records ?? 0}</strong></span></div>
        </Surface>
        <Surface className="chain-card"><div className="chain-card-kicker"><ShieldCheck size={15} /> VERIFICATION LAYER</div><div className="chain-state"><span className={`chain-state-symbol ${overview?.chain.available ? 'chain-ready' : ''}`}><Blocks size={20} /></span><div><h2>{overview?.chain.available ? 'Local chain connected' : 'Chain not connected'}</h2><p>{overview?.chain.message || 'Checking configured Hardhat node and contract…'}</p></div></div><div className="chain-facts"><div><span>NETWORK</span><strong>{overview?.chain.available ? `Hardhat · ${overview.chain.chain_id}` : 'Awaiting local node'}</strong></div><div><span>CONTRACT</span><strong className="mono">{overview?.chain.contract_address || 'Not deployed'}</strong></div><div><span>VERIFIABLE RECEIPTS</span><strong>{stats?.verified_records ?? 0}</strong></div></div><Link to="/blockchain" className="chain-link">Inspect verification records <ArrowRight size={15} /></Link></Surface>
      </div>
      <div className="dashboard-bottom-grid">
        <Surface><SurfaceHead title="Safety inbox" detail="Most recent incident reports" action={<Link to="/incidents" className="text-link">View reports <ArrowUpRight size={14} /></Link>} />
          {overview?.alerts.length ? <div className="alert-list">{overview.alerts.map((incident) => <Link to="/incidents" className="alert-row" key={incident.id}><span className={`alert-symbol ${incident.severity === 'critical' ? 'alert-critical' : 'alert-warning'}`}><AlertTriangle size={16} /></span><div className="alert-main"><strong>{incident.classification}</strong><span>{incident.vehicle_id} · {formatTime(incident.occurred_at)}</span></div><SourcePill source={incident.source} /><StatusPill tone={incident.chain_status === 'anchored' ? 'good' : 'warn'}>{incident.chain_status === 'anchored' ? 'Anchored' : 'Local only'}</StatusPill></Link>)}</div> : <EmptyState title="No incidents in the safety inbox" detail="Generated sensor alerts will appear here with their simulation or device provenance." />}
        </Surface>
        <Surface><SurfaceHead title="Operations snapshot" detail="Current runtime signals" />
          <div className="snapshot-list"><div><span className="snapshot-mark snapshot-blue"><Radio size={15} /></span><span><strong>Telemetry sources</strong><small>Records labelled simulation or device-reported</small></span><b>{(stats?.simulation_records ?? 0) + (stats?.device_reported_records ?? 0)}</b></div><div><span className="snapshot-mark snapshot-aqua"><ShieldCheck size={15} /></span><span><strong>Chain writes</strong><small>Only receipts from Hardhat transactions</small></span><b>{stats?.verified_records ?? 0}</b></div><div><span className="snapshot-mark snapshot-amber"><AlertTriangle size={15} /></span><span><strong>Model caveat</strong><small>Generated synthetic training baseline</small></span><b className="snapshot-tag">DEMO</b></div></div>
          <Link to="/accident-detection" className="snapshot-link">Review model signals <ArrowRight size={14} /></Link>
        </Surface>
      </div>
      <Surface className="chart-surface"><SurfaceHead title="Telemetry and model signals" detail="Chronological stored speed samples and model-labelled alerts · oldest left" action={<Link to="/tracking" className="text-link">Inspect samples <ArrowUpRight size={14} /></Link>} />
        {chartData.length ? <div className="dashboard-chart-wrap"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 8, right: 6, left: 4, bottom: 0 }}><CartesianGrid stroke="rgba(148,170,198,.09)" vertical={false} /><XAxis dataKey="time" tick={{ fill: '#7890a8', fontSize: 8 }} tickLine={false} axisLine={{ stroke: 'rgba(148,170,198,.14)' }} minTickGap={25} /><YAxis yAxisId="speed" tick={{ fill: '#7890a8', fontSize: 8 }} tickLine={false} axisLine={false} width={38} /><YAxis yAxisId="alerts" orientation="right" domain={[0, 1]} allowDecimals={false} tick={{ fill: '#7890a8', fontSize: 8 }} tickLine={false} axisLine={false} width={26} /><Tooltip contentStyle={{ background: '#0b1827', border: '1px solid rgba(148,170,198,.18)', borderRadius: 7, color: '#dce8f2', fontSize: 9 }} labelStyle={{ color: '#8da4b9' }} /><Area yAxisId="speed" type="monotone" dataKey="speed" name="Speed (km/h)" stroke="#46d9d1" fill="rgba(70,217,209,.11)" strokeWidth={2} isAnimationActive={false} /><Bar yAxisId="alerts" dataKey="alerts" name="Model / emergency alert" fill="#ffb55f" barSize={10} radius={[3, 3, 0, 0]} isAnimationActive={false} /></ComposedChart></ResponsiveContainer></div> : <EmptyState title="No timeline samples" detail="The chart uses stored telemetry only. Send a labelled simulator sample to populate it." />}
      </Surface>
      <div className="footnote-line"><span><Activity size={13} />Device source is client-reported, not hardware-attested; no production network is implied.</span><span>{overview?.chain.available ? <StatusPill tone="good">Chain ready</StatusPill> : <StatusPill tone="warn">Blockchain unavailable</StatusPill>}</span></div>
    </div>
  );
}
