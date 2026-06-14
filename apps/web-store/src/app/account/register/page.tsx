'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

export default function RegisterPage() {
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '+234',
    email: '',
    marketingConsent: false,
  });
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function createAccount() {
    setLoading(true);
    setError(undefined);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        marketingConsent: form.marketingConsent,
      }),
    });
    const body = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(body?.error?.message ?? 'Could not create your account.');
      return;
    }
    setDevCode(body?.devCode);
    setStep('code');
  }

  async function confirm() {
    setLoading(true);
    setError(undefined);
    const res = await fetch('/api/auth/otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: form.phone.trim(), code, purpose: 'verify' }),
    });
    const body = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(body?.error?.message ?? 'Invalid code.');
      return;
    }
    await qc.invalidateQueries();
    router.push('/');
    router.refresh();
  }

  const canSubmit =
    form.firstName.trim().length > 0 &&
    form.lastName.trim().length > 0 &&
    form.phone.trim().length > 4;

  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      {/* Brand / trust panel */}
      <div className="surface-panel-dark hidden flex-col justify-between px-7 py-9 lg:flex">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-brand-200">
            <span className="h-1.5 w-1.5 rounded-full bg-seal-300" />
            Create your account
          </div>
          <h2 className="mt-6 font-display text-[2.3rem] leading-[1.05] text-white">
            Join Lanyard for trusted, pharmacist-verified medicine.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-7 text-white/72">
            One quick step. We text you a secure code to confirm your phone — no passwords to
            remember.
          </p>
        </div>
        <ul className="relative mt-8 space-y-3">
          {[
            'Branch-accurate pricing & stock',
            'Upload prescriptions for pharmacist review',
            'Track every order to pickup or delivery',
          ].map((point) => (
            <li key={point} className="flex items-center gap-3 text-sm text-white/85">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-white/10">
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-brand-200"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              {point}
            </li>
          ))}
        </ul>
      </div>

      {/* Form */}
      <div className="surface-panel px-6 py-8 sm:px-8">
        <div className="page-eyebrow">Create account</div>
        <h1 className="page-title mt-2">
          {step === 'details' ? 'Tell us about you' : 'Confirm your phone'}
        </h1>
        <p className="mt-2 text-sm text-ink-700/70">
          {step === 'details'
            ? 'We’ll text a one-time code to verify your number.'
            : `We sent a 6-digit code to ${form.phone}.`}
        </p>

        {step === 'details' ? (
          <div className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="reg-first" className="field-label">
                  First name
                </label>
                <input
                  id="reg-first"
                  value={form.firstName}
                  onChange={(e) => set('firstName', e.target.value)}
                  autoComplete="given-name"
                  className="input-field"
                />
              </div>
              <div>
                <label htmlFor="reg-last" className="field-label">
                  Last name
                </label>
                <input
                  id="reg-last"
                  value={form.lastName}
                  onChange={(e) => set('lastName', e.target.value)}
                  autoComplete="family-name"
                  className="input-field"
                />
              </div>
            </div>
            <div>
              <label htmlFor="reg-phone" className="field-label">
                Phone number
              </label>
              <input
                id="reg-phone"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+2348012345678"
                inputMode="tel"
                autoComplete="tel"
                className="input-field tnum"
              />
            </div>
            <div>
              <label htmlFor="reg-email" className="field-label">
                Email <span className="font-normal text-ink-700/45">(optional)</span>
              </label>
              <input
                id="reg-email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className="input-field"
              />
            </div>
            <label className="flex items-start gap-2.5 text-sm text-ink-700/75">
              <input
                type="checkbox"
                checked={form.marketingConsent}
                onChange={(e) => set('marketingConsent', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-paper-200 text-brand-600"
              />
              <span>Keep me updated on health tips and offers (optional).</span>
            </label>
            <button
              onClick={createAccount}
              disabled={loading || !canSubmit}
              className="primary-button w-full"
            >
              {loading ? 'Creating…' : 'Create account'}
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="reg-code" className="field-label">
                6-digit code
              </label>
              <input
                id="reg-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="input-field tnum text-center text-xl tracking-[0.5em]"
              />
            </div>
            {devCode && (
              <p className="rounded-[1rem] border border-paper-200 bg-paper-50/80 px-3 py-2 text-xs text-ink-700/70">
                Dev code:{' '}
                <span className="tnum font-mono font-semibold text-ink-950">{devCode}</span>
              </p>
            )}
            <button
              onClick={confirm}
              disabled={loading || code.length < 6}
              className="primary-button w-full"
            >
              {loading ? 'Verifying…' : 'Verify & finish'}
            </button>
            <button
              onClick={() => setStep('details')}
              className="w-full text-sm font-medium text-ink-700/60 transition hover:text-brand-800"
            >
              Edit my details
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 flex items-start gap-2 rounded-[1rem] border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <svg
              viewBox="0 0 24 24"
              className="mt-0.5 h-4 w-4 flex-none"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5m0 3h.01" strokeLinecap="round" />
            </svg>
            {error}
          </p>
        )}

        <p className="mt-6 border-t border-paper-200 pt-5 text-center text-sm text-ink-700/65">
          Already have an account?{' '}
          <Link href="/account/login" className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
