import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, FileCheck2, RefreshCw, ShieldAlert, ShieldCheck, Siren } from 'lucide-react';
import { api, post } from '../api/client';
import { EmptyState, formatTime, PageIntro, shortHash, SourcePill, StatusPill, Surface, SurfaceHead } from '../components/common';
import type { Incident, Vehicle } from '../types';

type Verification = { status: string; verified: boolean; integrity_match: boolean; on_chain_match: boolean | null; stored_hash: string; recomputed_hash: string | null; transaction_hash: string | null; block_number: number | null; message: string };

export function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [verification, setVerification] = useState<Record<string, Verification>>({});
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const refresh = useCallback(async () => {
    try {
      const [incidentData, fleet] = await Promise.all([api<{ incidents: Incident[] }>('/incidents'), api<{ vehicles: Vehicle[] }>('/vehicles')]);
      setIncidents(incidentData.incidents); setVehicles(fleet.vehicles);
      if (!selectedId && incidentData.incidents[0]) setSelectedId(incidentData.incidents[0].id);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to retrieve incidents.'); }
  }, [selectedId]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function trigger() {
    const vehicle = vehicles.find((item) => item.active_trip_id) || vehicles[0];
    if (!vehicle) { setNotice('Register a vehicle before testing the incident workflow.'); return; }
    setBusy(true); setNotice('');
    try {
      const result = await post<{ incident?: Incident | null; ai: Record<string, { prediction: string }> }>('/simulation/tick', { vehicle_id: vehicle.id, simulate_impact: true, emergency: true });
      setNotice(result.incident ? `Incident ${result.incident.id} created from explicitly simulated telemetry. Evidence is ${result.incident.chain_status === 'anchored' ? 'anchored' : 'not on-chain'}.` : `AI output ${result.ai.accident.prediction}; no incident threshold was met.`);
      await refresh();
      if (result.incident) setSelectedId(result.incident.id);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to generate a test alert.'); }
    finally { setBusy(false); }
  }

  async function verify(id: string) {
    setBusy(true); setNotice('');
    try { const result = await post<Verification>(`/incidents/${encodeURIComponent(id)}/verify`, {}); setVerification((previous) => ({ ...previous, [id]: result })); setNotice(result.message); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Evidence verification failed.'); }
    finally { setBusy(false); }
  }

  const selected = incidents.find((incident) => incident.id === selectedId) || incidents[0];
  return <div className="page-stack"><PageIntro eyebrow="RECORDS / INCIDENT MANAGEMENT" title="An alert with an evidence trail." description="Reports carry the sensor payload, model output, source label, hash, and any returned blockchain receipt." action={<button className="button button-primary" onClick={trigger} disabled={busy}><Siren size={15} />{busy ? 'Generating…' : 'Simulate incident'}</button>} />{notice ? <div className={`notice-banner ${notice.includes('modified') || notice.includes('not') ? '' : 'notice-success'}`} role="status">{notice}</div> : null}<div className="incident-layout"><Surface className="incident-list-surface"><SurfaceHead title="Incident register" detail={`${incidents.length} saved reports · newest first`} action={<button className="icon-button" onClick={() => void refresh()} aria-label="Refresh incidents"><RefreshCw size={15} /></button>} />{incidents.length ? <div className="incident-list">{incidents.map((incident) => <button key={incident.id} onClick={() => setSelectedId(incident.id)} className={`incident-list-row ${incident.id === selected?.id ? 'incident-selected' : ''}`}><span className={`incident-severity-icon severity-${incident.severity}`}><AlertTriangle size={16} /></span><span className="incident-list-copy"><strong>{incident.classification}</strong><small>{incident.id} · {incident.vehicle_id} · {formatTime(incident.occurred_at)}</small></span><SourcePill source={incident.source} /><StatusPill tone={incident.chain_status === 'anchored' ? 'good' : 'warn'}>{incident.chain_status === 'anchored' ? 'Anchored' : 'Local only'}</StatusPill></button>)}</div> : <EmptyState title="No incident records" detail="The demo button creates a synthetic impact, runs the classifier, saves evidence, and attempts a chain record." />}</Surface>
      <div className="incident-detail-column">{selected ? <><Surface><div className="incident-detail-head"><div><span className="eyebrow">INCIDENT REPORT</span><h2>{selected.classification}</h2><span className="mono">{selected.id}</span></div><StatusPill tone={selected.severity === 'critical' ? 'bad' : 'warn'}>{selected.severity}</StatusPill></div><div className="incident-detail-meta"><div><span>VEHICLE</span><strong>{selected.vehicle_id}</strong></div><div><span>TRIP</span><strong>{selected.trip_id || 'No linked trip'}</strong></div><div><span>OCCURRED</span><strong>{formatTime(selected.occurred_at)}</strong></div><div><span>PROVENANCE</span><SourcePill source={selected.source} /></div></div><div className="incident-ai-box"><div className="incident-ai-head"><ShieldAlert size={16} /><strong>Model assessment</strong><span>local sklearn classifiers</span></div><div className="incident-ai-results">{Object.entries(selected.ai_output || {}).map(([name, result]) => <div key={name}><span>{name}</span><strong>{result.prediction}</strong><small>{result.provenance === 'synthetic_training_data' ? 'Synthetic-trained model' : 'Unavailable'}</small></div>)}</div></div><div className="evidence-hash-box"><div><span className="eyebrow">OFF-CHAIN EVIDENCE · SHA-256</span><code>{selected.evidence_hash}</code></div><StatusPill tone={selected.chain_status === 'anchored' ? 'good' : 'warn'}>{selected.chain_status === 'anchored' ? 'ON-CHAIN' : 'NOT ANCHORED'}</StatusPill></div><div className="incident-action-row"><button className="button button-secondary" disabled={busy} onClick={() => void verify(selected.id)}><FileCheck2 size={15} />Verify evidence</button>{selected.tx_hash ? <a className="button button-ghost" href="/transactions">View transaction</a> : null}</div>{verification[selected.id] ? <div className={`verification-result verify-${verification[selected.id].status}`}><div className="verification-result-icon">{verification[selected.id].verified ? <Check size={17} /> : <ShieldAlert size={17} />}</div><div><strong>{verification[selected.id].status.replace(/_/g, ' ').toUpperCase()}</strong><p>{verification[selected.id].message}</p><div className="verification-digests"><span>Stored <code>{shortHash(verification[selected.id].stored_hash, 18)}</code></span><span>Recomputed <code>{shortHash(verification[selected.id].recomputed_hash, 18)}</code></span></div></div></div> : null}</Surface><Surface><SurfaceHead title="Evidence details" detail="The source report remains in local off-chain storage" /><pre className="evidence-json">{JSON.stringify(selected.details, null, 2)}</pre></Surface></> : <Surface><EmptyState title="Select an incident" detail="Incident details and verification actions will appear here." /></Surface>}</div></div><div className="info-strip"><span className="info-icon"><ShieldCheck size={17} /></span><span>Evidence is verified only when stored bytes recompute to the saved hash and the contract's incident-hash view returns true. A local-only report is not described as blockchain-verified.</span></div></div>;
}
