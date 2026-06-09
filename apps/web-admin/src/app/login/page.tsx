'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Spinner, cn } from '@/components/ui';
import { IconAlert, IconCheck, IconClock, IconShield } from '@/components/icons';

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

const ENTERPRISE_PILLARS = [
  {
    title: 'Role-scoped access',
    body: 'Sessions inherit branch scope, permissions, and role policy before any operational screen loads.',
  },
  {
    title: 'Auditable sign-in path',
    body: 'Authentication events, MFA challenges, and downstream actions are structured for compliance review.',
  },
  {
    title: 'Operational resilience',
    body: 'Health checks surface connectivity issues early so staff can distinguish outages from credential errors.',
  },
];

const CONTROL_POINTS = [
  'PCN and NDPA-oriented operating posture',
  'Protected staff-only environment',
  'MFA challenge before privileged access',
];

function maskEmail(value: string): string {
  const [local, domain] = value.split('@');
  if (!local || !domain) return value;
  if (local.length <= 2) return `${local[0] ?? ''}•@${domain}`;
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(local.length - 2, 3))}@${domain}`;
}

function HealthBanner({
  health,
  onRetry,
}: {
  health: HealthState;
  onRetry: () => void;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4',
        health.tone === 'healthy' && 'border-emerald-200 bg-emerald-50/90 text-emerald-900',
        health.tone === 'unhealthy' && 'border-amber-200 bg-amber-50/90 text-amber-950',
        health.tone === 'checking' && 'border-slate-200 bg-slate-50 text-slate-700',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            health.tone === 'healthy' && 'bg-emerald-100 text-emerald-700',
            health.tone === 'unhealthy' && 'bg-amber-100 text-amber-700',
            health.tone === 'checking' && 'bg-slate-200 text-slate-600',
          )}
        >
          {health.tone === 'checking' ? (
            <Spinner className="h-4 w-4 border-slate-400 border-t-slate-700" />
          ) : health.tone === 'healthy' ? (
            <IconCheck width={16} height={16} />
          ) : (
            <IconAlert width={16} height={16} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{health.title}</p>
            <span
              className={cn(
                'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.24em]',
                health.tone === 'healthy' && 'bg-emerald-100 text-emerald-700',
                health.tone === 'unhealthy' && 'bg-amber-100 text-amber-800',
                health.tone === 'checking' && 'bg-slate-200 text-slate-600',
              )}
            >
              {health.tone === 'healthy'
                ? 'Operational'
                : health.tone === 'unhealthy'
                  ? 'Attention needed'
                  : 'Checking'}
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 opacity-90">{health.message}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-white/70 hover:text-slate-900"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function AuthStep({
  index,
  title,
  body,
  state,
}: {
  index: string;
  title: string;
  body: string;
  state: 'complete' | 'current' | 'upcoming';
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4 transition-colors',
        state === 'complete' && 'border-emerald-200 bg-emerald-50/80',
        state === 'current' && 'border-white/15 bg-white/8',
        state === 'upcoming' && 'border-white/10 bg-black/10',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold',
            state === 'complete' && 'bg-emerald-100 text-emerald-700',
            state === 'current' && 'bg-brand-500 text-white',
            state === 'upcoming' && 'bg-white/10 text-white/70',
          )}
        >
          {state === 'complete' ? <IconCheck width={16} height={16} /> : index}
        </span>
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <p className="mt-1 text-sm leading-6 text-white/65">{body}</p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('superintendent@lanyard.test');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | undefined>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<HealthState>(DEFAULT_HEALTH);
  const isMfaStep = Boolean(mfaToken);
  const maskedEmail = maskEmail(email.trim());

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
    if (body?.mfaRequired) {
      setCode('');
      return setMfaToken(body.mfaToken);
    }
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
    'w-full rounded-2xl border border-slate-300/90 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100';

  const currentErrorTitle = isMfaStep ? 'Verification could not be completed' : 'Sign-in failed';
  const canSubmitLogin = email.trim().length > 0 && password.length > 0 && !busy;
  const canSubmitMfa = code.trim().length >= 6 && !busy;

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(13,148,136,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.16),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef5f3_48%,#f8fafc_100%)]" />
      <div className="absolute left-0 top-0 hidden h-full w-px bg-white/50 lg:block" />

      <div className="relative grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative flex flex-col justify-between overflow-hidden bg-ink-900 px-6 py-8 text-white sm:px-8 lg:px-12 lg:py-12">
          <div className="absolute -right-24 top-12 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
          <div className="absolute -left-20 bottom-12 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-lg shadow-brand-900/30">
                <IconShield width={22} height={22} />
              </span>
              <div>
                <div className="text-sm font-semibold tracking-wide">Lanyard Pharmacy</div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-brand-200">
                  Operations Console
                </div>
              </div>
            </div>

            <div className="mt-10 max-w-xl">
              <div className="inline-flex rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-100">
                Enterprise staff authentication
              </div>
              <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                Secure access for pharmacy operations, oversight, and compliance workflows.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-8 text-white/70">
                Authenticate once, verify high-trust actions with MFA, and enter a console built for
                prescription review, inventory control, finance operations, and auditable branch work.
              </p>
            </div>

            <div className="mt-8 grid gap-3">
              <AuthStep
                index="01"
                title="Credential verification"
                body="Staff identity is confirmed against your assigned operations account before any access is issued."
                state={isMfaStep ? 'complete' : 'current'}
              />
              <AuthStep
                index="02"
                title="MFA challenge"
                body="Privileged console access requires a second-factor code from your authenticator app."
                state={isMfaStep ? 'current' : 'upcoming'}
              />
              <AuthStep
                index="03"
                title="Session issued"
                body="Branch scope, role policy, and access claims are attached once sign-in is fully verified."
                state="upcoming"
              />
            </div>
          </div>

          <div className="relative mt-10 space-y-6">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {ENTERPRISE_PILLARS.map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <div className="text-sm font-semibold">{item.title}</div>
                  <p className="mt-2 text-sm leading-6 text-white/65">{item.body}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-white/60">
              {CONTROL_POINTS.map((item) => (
                <span key={item} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          <div className="w-full max-w-xl">
            <div className="rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-[0_30px_80px_-45px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                    <IconClock width={14} height={14} />
                    {isMfaStep ? 'Step 2 of 2' : 'Step 1 of 2'}
                  </div>
                  <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
                    {isMfaStep ? 'Complete multi-factor verification' : 'Staff sign in'}
                  </h2>
                  <p className="mt-2 max-w-lg text-sm leading-7 text-slate-500">
                    {isMfaStep
                      ? `Finish verification for ${maskedEmail}. Access is granted only after the one-time authenticator code is accepted.`
                      : 'Use your staff credentials to access the operations console. MFA will be requested automatically for protected accounts.'}
                  </p>
                </div>

                <div className="hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right sm:block">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Access tier
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">Privileged staff</div>
                  <div className="mt-1 text-xs text-slate-500">Protected operational console</div>
                </div>
              </div>

              <div className="mt-6">
                <HealthBanner
                  health={health}
                  onRetry={() => {
                    setHealth(DEFAULT_HEALTH);
                    void checkHealth();
                  }}
                />
              </div>

              {error ? (
                <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-rose-900" aria-live="polite">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                      <IconAlert width={16} height={16} />
                    </span>
                    <div>
                      <div className="font-semibold">{currentErrorTitle}</div>
                      <p className="mt-1 text-sm leading-6 text-rose-800">{error}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {!isMfaStep ? (
                <form
                  className="mt-6 space-y-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void login();
                  }}
                >
                  <div className="grid gap-5">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Staff email
                      </label>
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@lanyard.health"
                        autoComplete="username"
                        spellCheck={false}
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <label className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                          Password
                        </label>
                        <span className="text-xs text-slate-400">Case-sensitive</span>
                      </div>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    <div className="font-semibold text-slate-900">Before you continue</div>
                    <p className="mt-1 leading-6">
                      The system status above helps distinguish connectivity problems from real sign-in failures.
                      If the backend is unavailable, restore it first before retrying credentials.
                    </p>
                  </div>

                  <Button type="submit" disabled={!canSubmitLogin} className="w-full rounded-2xl py-3 text-sm">
                    {busy ? 'Verifying credentials…' : 'Continue to secure sign in'}
                  </Button>
                </form>
              ) : (
                <form
                  className="mt-6 space-y-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void verifyMfa();
                  }}
                >
                  <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">Authenticator challenge issued</div>
                    <p className="mt-1 leading-6">
                      Enter the current code from the authenticator app assigned to <span className="font-medium">{maskedEmail}</span>.
                      Codes typically rotate every 30 seconds.
                    </p>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Authenticator code
                      </label>
                      <span className="text-xs text-slate-400">6 to 8 digits</span>
                    </div>
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\s+/g, ''))}
                      placeholder="123456"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      className={`${inputClass} text-center text-lg font-semibold tracking-[0.45em]`}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button type="submit" disabled={!canSubmitMfa} className="w-full rounded-2xl py-3 text-sm">
                      {busy ? 'Confirming MFA…' : 'Verify and enter console'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full rounded-2xl py-3 text-sm"
                      onClick={() => {
                        setMfaToken(undefined);
                        setCode('');
                        setError(undefined);
                      }}
                    >
                      Use a different account
                    </Button>
                  </div>
                </form>
              )}

              <div className="mt-6 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Security
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">Short-lived access tokens with refresh-backed session continuity.</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Oversight
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">Operational actions remain tied to branch scope, roles, and audit records.</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Support
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">If sign-in fails repeatedly, confirm backend health before escalating credentials.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
