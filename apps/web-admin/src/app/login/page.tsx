'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Spinner, cn } from '@/components/ui';
import { IconAlert, IconShield } from '@/components/icons';

type HealthState = {
  title: string;
  message: string;
  tone: 'healthy' | 'unhealthy' | 'checking';
};

const DEFAULT_HEALTH: HealthState = {
  title: 'Checking backend',
  message: 'Verifying that authentication services are reachable…',
  tone: 'checking',
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('superintendent@lanyard.test');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | undefined>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<HealthState>(DEFAULT_HEALTH);

  async function checkHealth() {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as
        | { title?: string; message?: string }
        | null;

      if (!res.ok) {
        setHealth({
          title: body?.title ?? 'Backend unavailable',
          message: body?.message ?? 'The API is not reachable from the admin app.',
          tone: 'unhealthy',
        });
        return;
      }

      setHealth({
        title: body?.title ?? 'Backend online',
        message: body?.message ?? 'Authentication services are reachable.',
        tone: 'healthy',
      });
    } catch {
      setHealth({
        title: 'Backend unavailable',
        message: 'The admin app could not verify API connectivity.',
        tone: 'unhealthy',
      });
    }
  }

  useEffect(() => {
    void checkHealth();
    const timer = window.setInterval(() => {
      void checkHealth();
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  async function login() {
    setBusy(true);
    setError(undefined);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(body?.error?.message ?? 'Invalid credentials');
    if (body?.mfaRequired) return setMfaToken(body.mfaToken);
    router.push('/');
    router.refresh();
  }

  async function verifyMfa() {
    setBusy(true);
    setError(undefined);
    const res = await fetch('/api/auth/mfa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mfaToken, code }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(body?.error?.message ?? 'Invalid MFA code');
    router.push('/');
    router.refresh();
  }

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-500';

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white">
            <IconShield width={22} height={22} />
          </span>
          <div>
            <div className="font-bold">Lanyard Pharmacy</div>
            <div className="text-xs uppercase tracking-widest text-brand-300">Operations Console</div>
          </div>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-2xl font-semibold leading-snug">
            One command center for prescriptions, orders, inventory and compliance.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            Verify prescriptions, fulfil orders and track performance across every branch — with a
            full, append-only audit trail built for PCN and NDPA compliance.
          </p>
        </div>
        <div className="relative text-xs text-white/40">
          Protected system · Authorized staff only · All activity is logged
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white">
              <IconShield width={22} height={22} />
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Staff sign in</h1>
          <p className="mt-1 text-sm text-slate-500">
            {mfaToken ? 'Two-factor verification required' : 'Lanyard Pharmacy operations console'}
          </p>
          <div
            className={cn(
              'mt-4 flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm',
              health.tone === 'healthy' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
              health.tone === 'unhealthy' && 'border-amber-200 bg-amber-50 text-amber-900',
              health.tone === 'checking' && 'border-slate-200 bg-slate-50 text-slate-600',
            )}
          >
            <span className="mt-0.5 shrink-0">
              {health.tone === 'checking' ? (
                <Spinner className="h-4 w-4 border-slate-300 border-t-slate-600" />
              ) : (
                <IconAlert
                  width={16}
                  height={16}
                  className={health.tone === 'healthy' ? 'text-emerald-600' : 'text-amber-700'}
                />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{health.title}</div>
              <p
                className={cn(
                  'mt-0.5 text-xs',
                  health.tone === 'healthy' && 'text-emerald-700/90',
                  health.tone === 'unhealthy' && 'text-amber-800/90',
                  health.tone === 'checking' && 'text-slate-500',
                )}
              >
                {health.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setHealth(DEFAULT_HEALTH);
                void checkHealth();
              }}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition-colors hover:bg-white/60 hover:text-slate-700"
            >
              Retry
            </button>
          </div>

          {!mfaToken ? (
            <div className="mt-7 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@lanyard.test"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  onKeyDown={(e) => e.key === 'Enter' && login()}
                  className={inputClass}
                />
              </div>
              <Button onClick={login} disabled={busy} className="w-full py-2.5">
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </div>
          ) : (
            <div className="mt-7 space-y-3">
              <label className="block text-sm font-medium text-slate-600">
                Authenticator code
              </label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                inputMode="numeric"
                onKeyDown={(e) => e.key === 'Enter' && verifyMfa()}
                className={`${inputClass} tracking-[0.4em]`}
              />
              <Button onClick={verifyMfa} disabled={busy} className="w-full py-2.5">
                {busy ? 'Verifying…' : 'Verify'}
              </Button>
            </div>
          )}
          {error && (
            <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
