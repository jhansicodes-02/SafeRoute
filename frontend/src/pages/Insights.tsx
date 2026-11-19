import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowRight, BrainCircuit, Gauge, ShieldAlert, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, post } from '../api/client';
import { EmptyState, formatTime, PageIntro, SourcePill, StatusPill, Surface, SurfaceHead } from '../components/common';
import type { Telemetry, Vehicle } from '../types';

type AIInfo = { key: string; name: string; input: string; output: string };
type Summary = { models: AIInfo[]; recent: Telemetry[]; provenance: string; model_metrics?: Record<string, { accuracy?: number; precision_macro?: number; recall_macro?: number; confusion_matrix?: unknown }>; };

function SignalTable({ rows, signal, emptyTitle, emptyDetail }: { rows: Telemetry[]; signal: 'accident_prediction' | 'driving_prediction' | 'route_prediction'; emptyTitle: string; emptyDetail: string }) {
  if (!rows.length) return <EmptyState title={emptyTitle} detail={emptyDetail} />;
  return <div className="table-scroll"><table><thead><tr><th>TIME</th><th>VEHICLE / TRIP</th><th>MODEL OUTPUT</th><th>TELEMETRY</th><th>SOURCE</th><th>CHAIN CHECKPOINT</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{formatTime(row.timestamp)}</td><td><strong>{row.vehicle_id}</strong><small className="table-subline">{row.trip_id || 'No trip'}</small></td><td><StatusPill tone={row[signal] === 'Possible accident' || row[signal] === 'Risky driving' || row[signal] === 'Route deviation' ? 'warn' : 'good'}>{row[signal] || 'Unavailable'}</StatusPill></td><td>{row.speed_kmh.toFixed(1)} km/h · {row.lat.toFixed(4)}, {row.lon.toFixed(4)}</td><td><SourcePill source={row.source} /></td><td>{row.tx_hash ? <span className="mono">{row.tx_hash.slice(0, 11)}…</span> : <span className="muted">Not anchored</span>}</td></tr>)}</tbody></table></div>;
}

function ModelProvenance({ summary, category }: { summary: Summary | null; category: string }) {
  return <div className="model-provenance"><span className="model-provenance-icon"><BrainCircuit size={16} /></span><div><strong>{category} · local scikit-learn model</strong><span>{summary?.provenance || 'Synthetic training data; evaluation is an engineering baseline, not a real-world safety guarantee.'}</span></div><StatusPill tone="aqua">NO AI API</StatusPill></div>;
}

function useInsightData() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [notice, setNotice] = useState('');
  const refresh = useCallback(async () => {
    try {
      const [modelData, fleet] = await Promise.all([api<Summary>('/ai/summary'), api<{ vehicles: Vehicle[] }>('/vehicles')]);
      setSummary(modelData); setVehicles(fleet.vehicles);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Model data is unavailable.'); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { summary, vehicles, notice, refresh, setNotice };
}

export function DriverBehaviour() {
  const { summary, vehicles, notice, refresh, setNotice } = useInsightData();
  const [alerts, setAlerts] = useState<Telemetry[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { const data = await api<{ alerts: Telemetry[] }>('/driver-behaviour'); setAlerts(data.alerts); } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to load driving alerts.'); } }, [setNotice]);
  useEffect(() => { void load(); }, [load]);
  async function testSignal() {
    const vehicle = vehicles.find((item) => item.active_trip_id) || vehicles[0]; if (!vehicle) return;
    setBusy(true); setNotice('');
    try { const result = await post<{ ai: Record<string, { prediction: string }> }>('/simulation/tick', { vehicle_id: vehicle.id, simulate_impact: true }); setNotice(`Synthetic braking signal returned ${result.ai.driving.prediction}; no vehicle reading is implied.`); await Promise.all([refresh(), load()]); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to generate test signal.'); } finally { setBusy(false); }
  }
  return <div className="page-stack"><PageIntro eyebrow="SAFETY INTELLIGENCE / DRIVER" title="Signals, not assumptions." description="Model outputs flag overspeeding, harsh braking, and acceleration patterns for operator review." action={<button className="button button-secondary" onClick={testSignal} disabled={busy}><Zap size={15} />{busy ? 'Evaluating…' : 'Generate test signal'}</button>} />{notice ? <div className="notice-banner" role="status">{notice}</div> : null}<ModelProvenance summary={summary} category="Driver behaviour model" /><div className="mini-metric-row"><div className="mini-metric"><span>RISKY RECORDS</span><strong>{alerts.length}</strong><small>Model-labelled telemetry in local storage</small></div><div className="mini-metric"><span>ACTIVE VEHICLES</span><strong>{vehicles.length}</strong><small>Registered fleet</small></div><div className="mini-metric"><span>FEATURE INPUTS</span><strong>04</strong><small>Speed, acceleration, brake intensity, count</small></div></div><Surface><SurfaceHead title="Driving risk signals" detail="Recent telemetry where the custom model outputs Risky driving" />{alerts.length ? <SignalTable rows={alerts} signal="driving_prediction" emptyTitle="No driving alerts" emptyDetail="A model-labelled risky sample will appear here after telemetry ingestion." /> : <EmptyState title="No risky driving output recorded" detail="SafeRoute only shows model classifications actually returned by its local classifier." />}</Surface><div className="info-strip"><span className="info-icon"><Gauge size={17} /></span><span>Driver labels are produced by the locally trained synthetic-data classifier. They are not a validated driver score and require human review.</span><Link to="/accident-detection">Model details <ArrowRight size={14} /></Link></div></div>;
}

export function AccidentDetection() {
  const { summary, vehicles, notice, refresh, setNotice } = useInsightData();
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Telemetry[]>([]);
  const loadRows = useCallback(async () => { try { const data = await api<{ telemetry: Telemetry[] }>('/telemetry?limit=80'); setRows(data.telemetry); } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to load telemetry.'); } }, [setNotice]);
  useEffect(() => { void loadRows(); }, [loadRows]);
  async function simulateImpact() {
    const vehicle = vehicles.find((item) => item.active_trip_id) || vehicles[0]; if (!vehicle) { setNotice('Register a vehicle first.'); return; }
    setBusy(true); setNotice('');
    try { const result = await post<{ ai: Record<string, { prediction: string }>; incident?: { id: string } | null }>('/simulation/tick', { vehicle_id: vehicle.id, simulate_impact: true, emergency: true }); setNotice(`Synthetic impact classified as “${result.ai.accident.prediction}”. ${result.incident ? `Incident ${result.incident.id} registered.` : 'No incident was generated.'}`); await Promise.all([loadRows(), refresh()]); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to test accident model.'); } finally { setBusy(false); }
  }
  const model = summary?.models.find((item) => item.key === 'accident');
  const recent = rows.filter((item) => item.accident_prediction === 'Possible accident');
  return <div className="page-stack"><PageIntro eyebrow="SAFETY INTELLIGENCE / IMPACT" title="An impact signal deserves context." description="Accelerometer and gyroscope features feed a locally trained classifier; every result retains its source." action={<button className="button button-primary" onClick={simulateImpact} disabled={busy}><Zap size={15} />{busy ? 'Running model…' : 'Simulate impact event'}</button>} />{notice ? <div className="notice-banner" role="status">{notice}</div> : null}<ModelProvenance summary={summary} category="Impact classifier" /><section className="model-detail-grid"><Surface className="model-detail-card"><div className="model-icon-large model-red"><ShieldAlert size={21} /></div><span className="eyebrow">ACCIDENT DETECTION</span><h2>{model?.output || 'Normal movement / Possible accident'}</h2><p>Input signals are six MPU6050 axis measurements: accelerometer x/y/z and gyroscope x/y/z.</p><div className="feature-chips">{['accel_x', 'accel_y', 'accel_z', 'gyro_x', 'gyro_y', 'gyro_z'].map((field) => <code key={field}>{field}</code>)}</div></Surface><Surface className="model-evaluation"><SurfaceHead title="Training evaluation" detail="Measured on the held-out synthetic test split" />{summary?.model_metrics?.accident ? <div className="metric-score-grid">{(['accuracy', 'precision', 'recall'] as const).map((key) => { const metric = key === 'precision' ? summary.model_metrics?.accident?.precision_macro : key === 'recall' ? summary.model_metrics?.accident?.recall_macro : summary.model_metrics?.accident?.accuracy; return <div key={key}><span>{key.toUpperCase()} (MACRO)</span><strong>{typeof metric === 'number' ? `${(metric * 100).toFixed(1)}%` : '—'}</strong></div>; })}</div> : <div className="evaluation-empty"><Activity size={17} /><span>Metrics are computed when <code>python3 -m ai_models.train_all</code> runs. The UI does not invent an accuracy.</span></div>}<p className="evaluation-caption">Synthetic-data performance is not a field-safety claim or evidence of clinical/transport deployment readiness.</p></Surface></section><Surface><SurfaceHead title="Possible impact outputs" detail={`${recent.length} model-classified samples in the local telemetry history`} />{recent.length ? <SignalTable rows={recent} signal="accident_prediction" emptyTitle="No possible accidents" emptyDetail="The detector has not classified any sample as a possible accident." /> : <EmptyState title="No possible accident output" detail="Generate a labelled synthetic impact to exercise the classification and incident workflow." />}</Surface></div>;
}

export function RouteAnomalies() {
  const { summary, vehicles, notice, refresh, setNotice } = useInsightData();
  const [rows, setRows] = useState<Telemetry[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { const data = await api<{ anomalies: Telemetry[] }>('/route-anomalies'); setRows(data.anomalies); } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to load route anomalies.'); } }, [setNotice]);
  useEffect(() => { void load(); }, [load]);
  async function simulate() {
    const vehicle = vehicles.find((item) => item.active_trip_id) || vehicles[0]; if (!vehicle) { setNotice('Register a vehicle first.'); return; }
    setBusy(true); setNotice('');
    try { const result = await post<{ ai: Record<string, { prediction: string }> }>('/simulation/tick', { vehicle_id: vehicle.id, simulate_deviation: true }); setNotice(`Synthetic route sample evaluated as “${result.ai.route.prediction}”.`); await Promise.all([load(), refresh()]); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to generate route sample.'); } finally { setBusy(false); }
  }
  return <div className="page-stack"><PageIntro eyebrow="SAFETY INTELLIGENCE / ROUTE" title="Keep the route in view." description="GPS distance and heading features identify route-deviation candidates for operator review." action={<button className="button button-secondary" onClick={simulate} disabled={busy}><Activity size={15} />{busy ? 'Evaluating…' : 'Simulate route deviation'}</button>} />{notice ? <div className="notice-banner" role="status">{notice}</div> : null}<ModelProvenance summary={summary} category="Route anomaly model" /><div className="route-analysis-banner"><div className="route-analysis-mark"><Activity size={20} /></div><div><span className="eyebrow">ROUTE DEVIATION MONITORING</span><h2>GPS features against a registered service path.</h2><p>Distance from route, heading change, speed, and route progress are model inputs. Sensor/device provenance remains visible.</p></div><div className="route-analysis-number"><strong>{rows.length.toString().padStart(2, '0')}</strong><span>FLAGGED SAMPLES</span></div></div><Surface><SurfaceHead title="Deviation candidates" detail="Model output Route deviation; not an automated dispatch decision" />{rows.length ? <SignalTable rows={rows} signal="route_prediction" emptyTitle="No deviations flagged" emptyDetail="No model-classified route-deviation samples have been recorded." /> : <EmptyState title="No route deviations recorded" detail="Use the simulation action to exercise the route anomaly model with synthetic coordinates." />}</Surface></div>;
}
