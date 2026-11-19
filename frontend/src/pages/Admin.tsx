import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Database, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { EmptyState, formatTime, PageIntro, StatusPill, Surface, SurfaceHead } from '../components/common';
import type { ChainStatus, User } from '../types';

type AdminData = { users: number; vehicles: number; trips: number; incidents: number; on_chain_transactions: number; chain: ChainStatus };

export function Admin() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<AdminData | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [notice, setNotice] = useState('');
  const refresh = useCallback(async () => {
    try { const [stats, people] = await Promise.all([api<AdminData>('/admin/summary'), api<{ users: User[]; notice: string }>('/admin/users')]); setSummary(stats); setUsers(people.users); setNotice(people.notice); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to load administrator data.'); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  if (user?.role !== 'admin') return <div className="page-stack"><PageIntro eyebrow="SYSTEM / ADMINISTRATION" title="Administrator access required." description="Local prototype administration is restricted to the administrator role." /><Surface><EmptyState title="Restricted area" detail="Sign in with an administrator account to inspect users and service status." /></Surface></div>;
  return <div className="page-stack"><PageIntro eyebrow="SYSTEM / ADMINISTRATION" title="The system, in view." description="Review prototype accounts, local database counts, and configured chain readiness." action={<button className="button button-secondary" onClick={() => void refresh()}><RefreshCw size={15} />Refresh</button>} />{notice ? <div className="notice-banner">{notice}</div> : null}<div className="admin-metrics">{[{ label: 'Local accounts', value: summary?.users ?? '—', icon: Users }, { label: 'Fleet vehicles', value: summary?.vehicles ?? '—', icon: Database }, { label: 'Incident reports', value: summary?.incidents ?? '—', icon: AlertTriangle }, { label: 'Actual chain receipts', value: summary?.on_chain_transactions ?? '—', icon: ShieldCheck }].map(({ label, value, icon: Icon }) => <div className="admin-metric" key={label}><Icon size={16} /><span>{label}</span><strong>{value}</strong></div>)}</div><div className="admin-main-grid"><Surface><SurfaceHead title="Operator accounts" detail="Password hashes are stored; roles are assigned by the application registration flow" />{users.length ? <div className="table-scroll"><table><thead><tr><th>NAME</th><th>EMAIL</th><th>ROLE</th><th>CREATED</th></tr></thead><tbody>{users.map((person) => <tr key={person.id}><td><strong>{person.name}</strong></td><td>{person.email}</td><td><StatusPill tone={person.role === 'admin' ? 'aqua' : 'neutral'}>{person.role}</StatusPill></td><td>{formatTime(person.created_at)}</td></tr>)}</tbody></table></div> : <EmptyState title="No accounts listed" detail="Registered prototype accounts will appear here." />}</Surface><Surface className="service-health-card"><SurfaceHead title="Service status" detail="Local development components" /><div className="service-health-row"><span><Database size={15} />SQLite database</span><StatusPill tone="good">Available</StatusPill></div><div className="service-health-row"><span><ShieldCheck size={15} />Hardhat RPC + contract</span><StatusPill tone={summary?.chain.available ? 'good' : 'warn'}>{summary?.chain.available ? 'Connected' : 'Unavailable'}</StatusPill></div><p>{summary?.chain.message}</p><div className="admin-warning"><AlertTriangle size={16} /><span>Prototype authentication, generated datasets, local SQLite, and the unlocked Hardhat signer are not production security controls. Do not use real passenger or safety evidence.</span></div></Surface></div></div>;
}
