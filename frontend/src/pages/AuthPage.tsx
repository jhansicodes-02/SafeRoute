import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  const { signIn, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (isRegister) await register(name, email, password);
      else await signIn(email, password);
      navigate('/', { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to complete the request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-story">
        <div className="auth-brand"><div className="brand-symbol"><svg viewBox="0 0 40 44"><path d="M20 2 35 8v11c0 10-6.3 17.2-15 22C11.3 36.2 5 29 5 19V8L20 2Z" /><path d="M12 26h6l9-11M12 17h5" /><circle cx="27" cy="15" r="2.3" /></svg></div><strong>SafeRoute</strong></div>
        <div className="auth-story-copy"><span className="eyebrow">PUBLIC TRANSPORT SAFETY</span><h1>Every journey<br /><em>recorded.</em></h1><p>Every incident verified.</p><div className="auth-proof"><span className="proof-icon"><ShieldCheck size={18} /></span><span>Trip events and evidence hashes.<br />Connected to a verifiable local ledger.</span></div></div>
        <div className="auth-story-meta"><span>SAFEROUTE OPERATIONS</span><span>LOCAL PROTOTYPE · 01</span></div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-overline">OPERATOR ACCESS</div>
          <h2>{isRegister ? 'Create your account' : 'Sign in to command'}</h2>
          <p className="auth-copy">{isRegister ? 'Register a local operator account to access the monitoring workspace.' : 'Enter your operator credentials to open the live safety workspace.'}</p>
          <form className="auth-form" onSubmit={submit}>
            {isRegister ? <label>Full name<input autoComplete="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></label> : null}
            <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@transit.org" /></label>
            <label>Password<div className="password-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'} required minLength={isRegister ? 10 : 1} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isRegister ? 'At least 10 characters' : 'Enter your password'} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
            {error ? <div className="form-error" role="alert">{error}</div> : null}
            <button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : isRegister ? 'Create operator account' : 'Open operations console'}<ArrowRight size={16} /></button>
          </form>
          {!isRegister ? <div className="demo-access"><div><span className="demo-dot" />LOCAL DEMO ACCESS</div><small>Demo accounts are seeded only from credentials configured in your local environment.</small></div> : null}
          <p className="auth-switch">{isRegister ? 'Already have an account?' : 'New to this workspace?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create operator account'}</Link></p>
          <div className="auth-disclaimer">Prototype access control only · Do not use with production or sensitive safety data.</div>
        </div>
      </section>
    </main>
  );
}
