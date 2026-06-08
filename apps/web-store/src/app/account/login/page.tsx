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
    <div className="mx-auto max-w-sm rounded-2xl border border-gray-200 bg-white p-6">
      <h1 className="text-xl font-bold text-gray-900">Sign in</h1>
      <p className="mt-1 text-sm text-gray-500">We’ll text you a one-time code.</p>

      {step === 'phone' ? (
        <div className="mt-5 space-y-3">
          <label className="block text-sm font-medium text-gray-700">Phone number</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+2348012345678"
            inputMode="tel"
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
          <button
            onClick={requestOtp}
            disabled={loading}
            className="w-full rounded-md bg-brand-600 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send code'}
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <label className="block text-sm font-medium text-gray-700">Enter the 6-digit code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            inputMode="numeric"
            maxLength={6}
            className="w-full rounded-md border border-gray-300 px-3 py-2 tracking-widest"
          />
          {devCode && (
            <p className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-500">
              Dev code: <span className="font-mono font-semibold">{devCode}</span>
            </p>
          )}
          <button
            onClick={verifyOtp}
            disabled={loading || code.length < 6}
            className="w-full rounded-md bg-brand-600 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? 'Verifying…' : 'Verify & sign in'}
          </button>
          <button onClick={() => setStep('phone')} className="w-full text-sm text-gray-500">
            Use a different number
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
