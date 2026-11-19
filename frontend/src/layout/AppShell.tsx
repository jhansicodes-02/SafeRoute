import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowUpRight, Blocks, BusFront, ChevronDown, Gauge, LayoutDashboard, LogOut, MapPinned, Menu, Radio, Route, ShieldAlert, ShieldCheck, Users, WalletCards, X } from 'lucide-react';
import { BrowserProvider, type Eip1193Provider } from 'ethers';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { shortHash, StatusPill } from '../components/common';
import type { ChainStatus } from '../types';

type WalletState = { address: string; chainId: number } | null;
type EthereumProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
declare global { interface Window { ethereum?: EthereumProvider } }

const links = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, section: 'COMMAND' },
  { to: '/tracking', label: 'Live tracking', icon: MapPinned, section: 'COMMAND' },
  { to: '/vehicles', label: 'Vehicle registry', icon: BusFront, section: 'FLEET' },
  { to: '/trips', label: 'Trip operations', icon: Route, section: 'FLEET' },
  { to: '/driver-behaviour', label: 'Driver behaviour', icon: Gauge, section: 'SAFETY INTELLIGENCE' },
  { to: '/accident-detection', label: 'Impact detection', icon: ShieldAlert, section: 'SAFETY INTELLIGENCE' },
  { to: '/route-anomalies', label: 'Route deviations', icon: Activity, section: 'SAFETY INTELLIGENCE' },
  { to: '/incidents', label: 'Incident reports', icon: AlertTriangle, section: 'RECORDS' },
  { to: '/blockchain', label: 'Chain verification', icon: ShieldCheck, section: 'RECORDS' },
  { to: '/transactions', label: 'Transactions', icon: Blocks, section: 'RECORDS' },
  { to: '/admin', label: 'Administration', icon: Users, section: 'SYSTEM', admin: true },
];

const titles: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Operations overview', subtitle: 'A clear view of fleet movement, safety signals, and verification.' },
  '/tracking': { title: 'Live vehicle tracking', subtitle: 'Select a vehicle to inspect its trip and recent telemetry.' },
  '/vehicles': { title: 'Vehicle registry', subtitle: 'Register fleet assets and inspect their chain-anchoring state.' },
  '/trips': { title: 'Trip operations', subtitle: 'Start and complete route assignments with lifecycle records.' },
  '/driver-behaviour': { title: 'Driver behaviour', subtitle: 'Review model-detected overspeed and braking risk signals.' },
  '/accident-detection': { title: 'Impact detection', subtitle: 'Inspect accelerometer and gyroscope classifier output.' },
  '/route-anomalies': { title: 'Route deviations', subtitle: 'Investigate GPS distance and heading anomalies.' },
  '/incidents': { title: 'Incident reports', subtitle: 'Review evidence, provenance, and incident verification results.' },
  '/blockchain': { title: 'Blockchain verification', subtitle: 'Trace lifecycle records and compare evidence against on-chain hashes.' },
  '/transactions': { title: 'Transaction history', subtitle: 'Actual local-chain receipts only; unavailable writes are never simulated.' },
  '/admin': { title: 'System administration', subtitle: 'Manage local prototype accounts and inspect service readiness.' },
};

function BrandMark() {
  return <div className="brand-symbol" aria-hidden="true"><svg viewBox="0 0 40 44"><path d="M20 2 35 8v11c0 10-6.3 17.2-15 22C11.3 36.2 5 29 5 19V8L20 2Z" /><path d="M12 26h6l9-11M12 17h5" /><circle cx="27" cy="15" r="2.3" /></svg></div>;
}

function WalletButton() {
  const [wallet, setWallet] = useState<WalletState>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;
    provider.request({ method: 'eth_accounts' }).then((value) => {
      const accounts = value as string[];
      if (accounts?.[0]) {
        new BrowserProvider(provider as unknown as Eip1193Provider).getNetwork().then((network) => setWallet({ address: accounts[0], chainId: Number(network.chainId) })).catch(() => undefined);
      }
    }).catch(() => undefined);
  }, []);

  async function connect() {
    if (!window.ethereum) {
      setMessage('MetaMask is not available in this browser. Local demo writes use the Hardhat development signer.');
      return;
    }
    try {
      const provider = new BrowserProvider(window.ethereum as unknown as Eip1193Provider);
      const accounts = await provider.send('eth_requestAccounts', []) as string[];
      const network = await provider.getNetwork();
      setWallet({ address: accounts[0], chainId: Number(network.chainId) });
      setMessage(Number(network.chainId) === 31337 ? 'Wallet connected to local Hardhat (chain 31337).' : `Wallet connected to chain ${network.chainId}; SafeRoute local records still use the configured Hardhat signer.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Wallet connection was not completed.');
    }
  }

  return <div className="wallet-wrap"><button className={`wallet-button ${wallet ? 'wallet-connected' : ''}`} onClick={connect} title="Connect MetaMask; prototype writes use the local Hardhat operator signer"><WalletCards size={15} />{wallet ? shortHash(wallet.address, 6) : 'Connect wallet'}<ChevronDown size={13} /></button>{message ? <span className="sr-only" role="status">{message}</span> : null}</div>;
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [chain, setChain] = useState<ChainStatus | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = titles[location.pathname] || titles['/'];

  useEffect(() => {
    let active = true;
    const refresh = () => api<{ chain: ChainStatus }>('/health').then((result) => active && setChain(result.chain)).catch(() => active && setChain(null));
    refresh();
    const timer = window.setInterval(refresh, 12000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const sections = [...new Set(links.filter((link) => !link.admin || user?.role === 'admin').map((link) => link.section))];
  return (
    <div className="app-shell">
      {mobileOpen ? <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /> : null}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup"><BrandMark /><div><strong>SafeRoute</strong><span>TRANSIT SAFETY OS</span></div><button className="sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={17} /></button></div>
        <div className="sidebar-tagline">Every journey recorded.<br />Every incident verified.</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {sections.map((section) => (
            <div className="nav-section" key={section}>
              <span className="nav-label">{section}</span>
              {links.filter((link) => link.section === section && (!link.admin || user?.role === 'admin')).map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`} onClick={() => setMobileOpen(false)}>
                  <Icon size={17} strokeWidth={1.75} /><span>{label}</span>{to === '/incidents' ? <i className="nav-pulse" /> : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="chain-mini"><span className={`chain-orb ${chain?.available ? 'online' : ''}`} /><div><small>LOCAL CHAIN</small><strong>{chain?.available ? 'Connected' : 'Unavailable'}</strong></div><ArrowUpRight size={14} /></div>
          <div className="user-card"><div className="avatar">{user?.name?.slice(0, 1).toUpperCase() || 'O'}</div><div className="user-card-copy"><strong>{user?.name || 'Operator'}</strong><span>{user?.role || 'operator'} · local prototype</span></div><button onClick={signOut} aria-label="Sign out" className="signout-button"><LogOut size={15} /></button></div>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <div className="breadcrumb"><span>SafeRoute</span><span className="breadcrumb-slash">/</span><strong>{current.title}</strong></div>
          <div className="topbar-right">
            <StatusPill tone={chain?.available ? 'good' : 'warn'}><span className={`status-dot ${chain?.available ? 'dot-good' : 'dot-warn'}`} />{chain?.available ? 'LOCAL CHAIN ONLINE' : 'CHAIN OFFLINE'}</StatusPill>
            <span className="topbar-divider" />
            <WalletButton />
            <div className="topbar-avatar" title={user?.email}>{user?.name?.slice(0, 1).toUpperCase()}</div>
          </div>
        </header>
        <div className="content-area"><Outlet /></div>
        <footer className="app-footer"><span><Radio size={12} /> DEMONSTRATION ENVIRONMENT</span><span>Local prototype · No certified emergency response</span></footer>
      </main>
    </div>
  );
}
