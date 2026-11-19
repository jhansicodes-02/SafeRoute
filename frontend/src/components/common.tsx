import type { ReactNode } from 'react';
import { ArrowUpRight, Radio } from 'lucide-react';

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="page-intro">
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>
      {action ? <div className="intro-action">{action}</div> : null}
    </div>
  );
}

export function Surface({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`surface ${className}`}>{children}</section>;
}

export function SurfaceHead({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className="surface-head"><div><h2>{title}</h2>{detail ? <p>{detail}</p> : null}</div>{action}</div>;
}

export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'good' | 'warn' | 'bad' | 'neutral' | 'aqua' }) {
  return <span className={`status-pill tone-${tone}`}>{children}</span>;
}

export function SourcePill({ source }: { source: 'simulation' | 'device' }) {
  return <span className={`source-pill ${source === 'device' ? 'source-device' : 'source-sim'}`}><Radio size={12} />{source === 'device' ? 'DEVICE' : 'SIMULATED'}</span>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><div className="empty-mark"><ArrowUpRight size={16} /></div><strong>{title}</strong><p>{detail}</p></div>;
}

export function formatTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function shortHash(value?: string | null, start = 10) {
  if (!value) return '—';
  return value.length > start + 8 ? `${value.slice(0, start)}…${value.slice(-6)}` : value;
}

export function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
