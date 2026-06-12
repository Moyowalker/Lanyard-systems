'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

export default function LoginPage() {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('+234');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();

  async function requestOtp() {
    setLoading(true);
    setError(undefined);
    const res = await fetch('/api/auth/otp/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const body = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(body?.error?.message ?? 'Could not send a code to that number.');
      return;
    }
    setDevCode(body?.devCode);
    setStep('code');
  }

  async function verifyOtp() {
    setLoading(true);
    setError(undefined);
    const res = await fetch('/api/auth/otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, code }),
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

  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      {/* Brand / trust panel */}
      <div className="surface-panel-dark hidden flex-col justify-between px-7 py-9 lg:flex">
        <div className="absolute inset-x-0 -top-24 h-60 bg-[radial-gradient(60%_100%_at_72%_0%,rgba(61,161,126,0.4),transparent_70%)]" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-brand-200">
            <span className="h-1.5 w-1.5 rounded-full bg-seal-300" />
            Welcome back
          </div>
          <h2 className="mt-6 font-display text-[2.3rem] leading-[1.05] text-white">
            Your medicines, your branch, your prescriptions — in one trusted place.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-7 text-white/72">
            Sign in with a one-time code. No passwords to remember, and your account keeps pricing,
            stock, and order history accurate to your branch.
          </p>
        </div>
        <ul className="relative mt-8 space-y-3">
          {[
            'Pharmacist-verified prescriptions',
            'Branch-accurate pricing & stock',
            'Live order tracking to pickup or delivery',
          ].map((point) => (
            <li key={point} className="flex items-center gap-3 text-sm text-white/85">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-white/10">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-brand-200" fill="none" stroke="currentColor" strokeWidth="2">
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
        <div className="page-eyebrow">Sign in</div>
        <h1 className="page-title mt-2">
          {step === 'phone' ? 'Enter your phone number' : 'Enter your code'}
        </h1>
        <p className="mt-2 text-sm text-ink-700/70">
          {step === 'phone'
            ? 'We’ll text you a secure one-time code to sign in.'
            : `We sent a 6-digit code to ${phone}.`}
        </p>

        {step === 'phone' ? (
          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-phone" className="field-label">
                Phone number
              </label>
              <input
                id="login-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+2348012345678"
                inputMode="tel"
                autoComplete="tel"
                className="input-field tnum text-base"
              />
            </div>
            <button onClick={requestOtp} disabled={loading} className="primary-button w-full">
              {loading ? 'Sending…' : 'Send code'}
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-code" className="field-label">
                6-digit code
              </label>
              <input
                id="login-code"
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
                Dev code: <span className="tnum font-mono font-semibold text-ink-950">{devCode}</span>
              </p>
            )}
            <button
              onClick={verifyOtp}
              disabled={loading || code.length < 6}
              className="primary-button w-full"
            >
              {loading ? 'Verifying…' : 'Verify & sign in'}
            </button>
            <button
              onClick={() => setStep('phone')}
              className="w-full text-sm font-medium text-ink-700/60 transition hover:text-brand-800"
            >
              Use a different number
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 flex items-start gap-2 rounded-[1rem] border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="1.9">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5m0 3h.01" strokeLinecap="round" />
            </svg>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
