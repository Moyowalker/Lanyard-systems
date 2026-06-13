'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { CustomerAddressDto, CustomerProfileDto } from '@lanyard/contracts';

type Address = CustomerAddressDto;

const EMPTY_ADDRESS: Address = {
  label: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  country: 'NG',
  landmark: '',
  contactPhone: '',
};

export default function ProfilePage() {
  const { data: profile, isLoading, refetch } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await fetch('/api/me/profile');
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) throw new Error('Could not load your profile');
      return res.json() as Promise<CustomerProfileDto>;
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="h-9 w-44 animate-pulse rounded-full bg-white/70" />
        <div className="surface-panel h-48 animate-pulse" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="state-card mx-auto max-w-md text-center">
        <p className="text-ink-700/80">
          Please{' '}
          <Link href="/account/login" className="font-semibold text-brand-700 hover:underline">
            sign in
          </Link>{' '}
          to manage your account.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <div className="page-eyebrow">Your account</div>
        <h1 className="page-title mt-2">Profile &amp; addresses</h1>
      </div>

      <ProfileSection profile={profile} onSaved={() => refetch()} />
      <EmailSection profile={profile} onChanged={() => refetch()} />
      <AddressSection profile={profile} onSaved={() => refetch()} />
    </div>
  );
}

/* ── Profile (name + email) ── */

function ProfileSection({
  profile,
  onSaved,
}: {
  profile: CustomerProfileDto;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [email, setEmail] = useState(profile.email ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | undefined>();

  async function save() {
    setBusy(true);
    setMsg(undefined);
    const body: Record<string, string> = { firstName, lastName };
    if (email.trim()) body.email = email.trim();
    const res = await fetch('/api/me/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data?.error?.message ?? 'Could not save your profile.' });
      return;
    }
    setMsg({ ok: true, text: 'Profile saved.' });
    onSaved();
  }

  return (
    <section className="surface-panel px-5 py-6 sm:px-7">
      <div className="section-kicker">Personal details</div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pf-first" className="field-label">
            First name
          </label>
          <input id="pf-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="input-field" />
        </div>
        <div>
          <label htmlFor="pf-last" className="field-label">
            Last name
          </label>
          <input id="pf-last" value={lastName} onChange={(e) => setLastName(e.target.value)} className="input-field" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="pf-email" className="field-label">
            Email
          </label>
          <input
            id="pf-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="input-field"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label">Phone</label>
          <div className="input-field tnum flex items-center justify-between bg-paper-50/60 text-ink-700/70">
            <span>{profile.phone}</span>
            <span className="text-xs font-semibold text-brand-700">
              {profile.phoneVerified ? 'Verified' : 'Unverified'}
            </span>
          </div>
        </div>
      </div>
      {msg && (
        <p className={`mt-3 text-sm ${msg.ok ? 'text-brand-700' : 'text-rose-600'}`}>{msg.text}</p>
      )}
      <button onClick={save} disabled={busy} className="primary-button mt-5">
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </section>
  );
}

/* ── Email verification (OTP over email) ── */

function EmailSection({
  profile,
  onChanged,
}: {
  profile: CustomerProfileDto;
  onChanged: () => void;
}) {
  const [step, setStep] = useState<'idle' | 'code'>('idle');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | undefined>();

  if (!profile.email) return null;

  if (profile.emailVerified) {
    return (
      <section className="surface-panel px-5 py-5 sm:px-7">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-700">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" className="fill-brand-100" />
            <path d="m8.5 12.2 2.3 2.3 4.7-4.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Your email is verified
        </div>
      </section>
    );
  }

  async function request() {
    setBusy(true);
    setMsg(undefined);
    const res = await fetch('/api/me/email/verify/request', { method: 'POST' });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data?.error?.message ?? 'Could not send a verification code.' });
      return;
    }
    setDevCode(data?.devCode);
    setStep('code');
  }

  async function confirm() {
    setBusy(true);
    setMsg(undefined);
    const res = await fetch('/api/me/email/verify/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data?.error?.message ?? 'Invalid code.' });
      return;
    }
    onChanged();
  }

  return (
    <section className="surface-panel px-5 py-6 sm:px-7">
      <div className="section-kicker">Verify your email</div>
      <p className="mt-3 text-sm text-ink-700/75">
        Verify <span className="font-semibold text-ink-950">{profile.email}</span> to receive order
        receipts and updates by email.
      </p>
      {step === 'idle' ? (
        <button onClick={request} disabled={busy} className="secondary-button mt-4">
          {busy ? 'Sending…' : 'Send verification code'}
        </button>
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="em-code" className="field-label">
              6-digit code
            </label>
            <input
              id="em-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              className="input-field tnum w-40 text-center tracking-[0.4em]"
            />
          </div>
          <button onClick={confirm} disabled={busy || code.length < 6} className="primary-button">
            {busy ? 'Verifying…' : 'Verify'}
          </button>
        </div>
      )}
      {devCode && (
        <p className="mt-3 rounded-[1rem] border border-paper-200 bg-paper-50/80 px-3 py-2 text-xs text-ink-700/70">
          Dev code: <span className="tnum font-mono font-semibold text-ink-950">{devCode}</span>
        </p>
      )}
      {msg && (
        <p className={`mt-3 text-sm ${msg.ok ? 'text-brand-700' : 'text-rose-600'}`}>{msg.text}</p>
      )}
    </section>
  );
}

/* ── Saved addresses ── */

function AddressSection({
  profile,
  onSaved,
}: {
  profile: CustomerProfileDto;
  onSaved: () => void;
}) {
  const [addresses, setAddresses] = useState<Address[]>(profile.addresses ?? []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | undefined>();

  // Keep local list in sync if the profile reloads.
  useEffect(() => {
    setAddresses(profile.addresses ?? []);
  }, [profile.addresses]);

  function update(i: number, patch: Partial<Address>) {
    setAddresses((list) => list.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }
  function remove(i: number) {
    setAddresses((list) => list.filter((_, idx) => idx !== i));
  }
  function add() {
    setAddresses((list) => [...list, { ...EMPTY_ADDRESS }]);
  }

  async function save() {
    setBusy(true);
    setMsg(undefined);
    // Drop empty optional fields so validation stays clean.
    const cleaned = addresses.map((a) => ({
      label: a.label?.trim() || undefined,
      line1: a.line1.trim(),
      line2: a.line2?.trim() || undefined,
      city: a.city.trim(),
      state: a.state.trim(),
      country: (a.country || 'NG').trim(),
      landmark: a.landmark?.trim() || undefined,
      contactPhone: a.contactPhone?.trim() || undefined,
    }));
    const res = await fetch('/api/me/addresses', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ addresses: cleaned }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data?.error?.message ?? 'Could not save addresses.' });
      return;
    }
    setMsg({ ok: true, text: 'Addresses saved.' });
    onSaved();
  }

  return (
    <section className="surface-panel px-5 py-6 sm:px-7">
      <div className="flex items-center justify-between">
        <div className="section-kicker">Saved addresses</div>
        <button onClick={add} className="text-sm font-semibold text-brand-700 hover:text-brand-800">
          + Add address
        </button>
      </div>

      {addresses.length === 0 ? (
        <p className="mt-4 text-sm text-ink-700/65">
          No saved addresses yet. Add one for faster delivery checkout.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {addresses.map((a, i) => (
            <div key={i} className="rounded-[1.3rem] border border-paper-200 bg-paper-50/60 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-700/55">
                  Address {i + 1}
                </span>
                <button
                  onClick={() => remove(i)}
                  className="text-xs font-semibold text-rose-500 hover:text-rose-600"
                >
                  Remove
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={a.label ?? ''}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder="Label (Home, Work)"
                  className="input-field sm:col-span-2"
                  aria-label={`Address ${i + 1} label`}
                />
                <input
                  value={a.line1}
                  onChange={(e) => update(i, { line1: e.target.value })}
                  placeholder="Address line"
                  className="input-field sm:col-span-2"
                  aria-label={`Address ${i + 1} line`}
                />
                <input
                  value={a.city}
                  onChange={(e) => update(i, { city: e.target.value })}
                  placeholder="City"
                  className="input-field"
                  aria-label={`Address ${i + 1} city`}
                />
                <input
                  value={a.state}
                  onChange={(e) => update(i, { state: e.target.value })}
                  placeholder="State"
                  className="input-field"
                  aria-label={`Address ${i + 1} state`}
                />
                <input
                  value={a.landmark ?? ''}
                  onChange={(e) => update(i, { landmark: e.target.value })}
                  placeholder="Landmark (optional)"
                  className="input-field"
                  aria-label={`Address ${i + 1} landmark`}
                />
                <input
                  value={a.contactPhone ?? ''}
                  onChange={(e) => update(i, { contactPhone: e.target.value })}
                  placeholder="Contact phone (optional)"
                  inputMode="tel"
                  className="input-field tnum"
                  aria-label={`Address ${i + 1} contact phone`}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {msg && (
        <p className={`mt-3 text-sm ${msg.ok ? 'text-brand-700' : 'text-rose-600'}`}>{msg.text}</p>
      )}
      <button onClick={save} disabled={busy} className="primary-button mt-5">
        {busy ? 'Saving…' : 'Save addresses'}
      </button>
    </section>
  );
}
