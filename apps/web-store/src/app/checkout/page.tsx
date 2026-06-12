'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { OrderDto, PaymentInitDto, PrescriptionDto } from '@lanyard/contracts';
import { useCart } from '@/lib/client';
import { formatKobo } from '@/lib/format';

type Fulfillment = 'pickup' | 'delivery';

export default function CheckoutPage() {
  const { data: cart, isLoading } = useCart();
  const router = useRouter();

  const [fulfillment, setFulfillment] = useState<Fulfillment>('pickup');
  const [address, setAddress] = useState({ line1: '', city: '', state: '' });
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState<string | undefined>();

  if (isLoading) return <p className="text-ink-700/60">Loading…</p>;
  if (!cart)
    return (
      <div className="state-card mx-auto max-w-md text-center">
        <p className="text-ink-700/80">
          Please{' '}
          <Link href="/account/login" className="font-semibold text-brand-700 hover:underline">
            sign in
          </Link>{' '}
          to check out.
        </p>
      </div>
    );
  if (cart.items.length === 0)
    return (
      <div className="state-card mx-auto max-w-md text-center">
        <p className="text-ink-700/80">
          Your cart is empty.{' '}
          <Link href="/" className="font-semibold text-brand-700 hover:underline">
            Browse medicines
          </Link>
          .
        </p>
      </div>
    );

  const needsRx = cart.requiresRxVerification;

  async function placeOrder() {
    setError(undefined);
    if (needsRx && (!files || files.length === 0)) {
      setError('This order needs a prescription. Please upload one.');
      return;
    }
    if (fulfillment === 'delivery' && (!address.line1 || !address.city || !address.state)) {
      setError('Please complete the delivery address.');
      return;
    }
    setBusy(true);
    try {
      // 1. Upload prescription(s) if required.
      let prescriptionIds: string[] = [];
      if (needsRx && files && cart) {
        setStep('Uploading prescription…');
        const form = new FormData();
        form.append('branchId', cart.branchId ?? '');
        Array.from(files).forEach((f) => form.append('files', f));
        const upRes = await fetch('/api/prescriptions', { method: 'POST', body: form });
        if (!upRes.ok) throw new Error('Prescription upload failed');
        const rx = (await upRes.json()) as PrescriptionDto;
        prescriptionIds = [rx.id];
      }

      // 2. Create the order.
      setStep('Placing order…');
      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fulfillment: {
            type: fulfillment,
            address: fulfillment === 'delivery' ? { ...address, country: 'NG' } : undefined,
          },
          prescriptionIds,
        }),
      });
      const order = (await orderRes.json()) as OrderDto & { error?: { message: string } };
      if (!orderRes.ok) throw new Error(order.error?.message ?? 'Could not place order');

      // 3. Rx orders pause for pharmacist verification before payment.
      if (order.status === 'AWAITING_RX_VERIFICATION') {
        router.push(`/orders/${order.id}`);
        return;
      }

      // 4. Initialize payment.
      setStep('Starting payment…');
      const payRes = await fetch('/api/payments/intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      });
      const intent = (await payRes.json()) as PaymentInitDto & { error?: { message: string } };
      if (!payRes.ok) throw new Error(intent.error?.message ?? 'Could not start payment');

      // 5. Dev mock has no hosted page — settle directly; real Paystack → redirect.
      if (intent.authorizationUrl.includes('mock-checkout.local')) {
        setStep('Confirming payment…');
        await fetch(`/api/payments/dev-confirm/${intent.intentId}`, { method: 'POST' });
        router.push(`/orders/${order.id}`);
      } else {
        window.location.href = intent.authorizationUrl;
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const fileNames = files && files.length > 0 ? Array.from(files).map((f) => f.name) : [];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <div className="page-eyebrow">Secure checkout</div>
        <h1 className="page-title mt-2">Complete your order</h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Left: choices */}
        <div className="space-y-5">
          {/* Fulfillment */}
          <section className="surface-panel px-5 py-6 sm:px-7">
            <div className="section-kicker">Fulfilment</div>
            <h2 className="mt-3 font-display text-xl text-ink-950">How would you like to receive it?</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Fulfilment method">
              {(['pickup', 'delivery'] as Fulfillment[]).map((opt) => {
                const active = fulfillment === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setFulfillment(opt)}
                    className={`flex items-start gap-3 rounded-[1.3rem] border p-4 text-left transition duration-200 ${
                      active
                        ? 'border-brand-400 bg-brand-50/70 shadow-card'
                        : 'border-paper-200 bg-white hover:border-brand-200'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${
                        active ? 'border-brand-600 bg-brand-600' : 'border-paper-200'
                      }`}
                    >
                      {active ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                    </span>
                    <span>
                      <span className="block font-semibold capitalize text-ink-950">{opt}</span>
                      <span className="mt-0.5 block text-sm text-ink-700/70">
                        {opt === 'pickup'
                          ? 'Collect from your selected branch.'
                          : 'Delivered to your address by the branch.'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {fulfillment === 'delivery' && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="addr-line1" className="field-label">
                    Address line
                  </label>
                  <input
                    id="addr-line1"
                    autoComplete="address-line1"
                    value={address.line1}
                    onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                    placeholder="e.g. 12 Allen Avenue"
                    className="input-field"
                  />
                </div>
                <div>
                  <label htmlFor="addr-city" className="field-label">
                    City
                  </label>
                  <input
                    id="addr-city"
                    autoComplete="address-level2"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    placeholder="e.g. Ikeja"
                    className="input-field"
                  />
                </div>
                <div>
                  <label htmlFor="addr-state" className="field-label">
                    State
                  </label>
                  <input
                    id="addr-state"
                    autoComplete="address-level1"
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    placeholder="e.g. Lagos"
                    className="input-field"
                  />
                </div>
              </div>
            )}
          </section>

          {/* Prescription upload */}
          {needsRx && (
            <section className="surface-panel px-5 py-6 sm:px-7">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-[0.85rem] bg-seal-200/70 font-display text-sm font-bold text-ink-900">
                  Rx
                </span>
                <div className="section-kicker before:hidden">Prescription required</div>
              </div>
              <p className="mt-3 text-sm leading-6 text-ink-700/80">
                Your cart contains prescription-only medicine. Upload a clear photo or PDF of your
                prescription — a pharmacist will verify it before your order is dispensed.
              </p>

              <label
                htmlFor="rx-files"
                className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[1.3rem] border-2 border-dashed border-seal-200/80 bg-seal-100/40 px-4 py-8 text-center transition hover:border-seal-300 hover:bg-seal-100/70"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-white text-seal-400 shadow-sm">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 16V4m0 0L8 8m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="text-sm font-semibold text-ink-950">
                  {fileNames.length > 0 ? 'Change files' : 'Tap to upload prescription'}
                </span>
                <span className="text-xs text-ink-700/60">JPG, PNG, or PDF · up to 10MB each</span>
                <input
                  id="rx-files"
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  onChange={(e) => setFiles(e.target.files)}
                  className="sr-only"
                />
              </label>

              {fileNames.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {fileNames.map((name) => (
                    <li
                      key={name}
                      className="flex items-center gap-2 rounded-[1rem] border border-paper-200 bg-white px-3 py-2 text-sm text-ink-800"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none text-brand-700" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="truncate">{name}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          )}
        </div>

        {/* Right: summary */}
        <div className="space-y-4 summary-sticky">
          <div className="surface-panel px-5 py-6">
            <div className="section-kicker">Order summary</div>
            <ul className="mt-4 divide-y divide-paper-200/70">
              {cart.items.map((i) => (
                <li key={i.productId} className="flex justify-between gap-3 py-2.5 text-sm">
                  <span className="text-ink-800">
                    {i.name} <span className="text-ink-700/55">× {i.quantity}</span>
                    {i.requiresPrescription && <span className="ml-1 text-seal-400">℞</span>}
                  </span>
                  <span className="tnum flex-none font-medium text-ink-950">
                    {formatKobo(i.lineTotalKobo)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-2 border-t border-paper-200 pt-3 text-sm">
              <div className="flex justify-between text-ink-700/75">
                <span>Subtotal</span>
                <span className="tnum font-medium text-ink-900">{formatKobo(cart.subtotalKobo)}</span>
              </div>
              <div className="flex justify-between text-ink-700/60">
                <span>Delivery</span>
                <span>{fulfillment === 'delivery' ? 'Added by branch' : 'Free pickup'}</span>
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between border-t border-paper-200 pt-4">
              <span className="font-semibold text-ink-950">Total due</span>
              <span className="tnum font-display text-2xl text-ink-950">
                {formatKobo(cart.subtotalKobo)}
              </span>
            </div>

            {error && (
              <p className="mt-4 flex items-start gap-2 rounded-[1rem] border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5m0 3h.01" strokeLinecap="round" />
                </svg>
                {error}
              </p>
            )}

            <button onClick={placeOrder} disabled={busy} className="primary-button mt-5 w-full">
              {busy
                ? step || 'Working…'
                : needsRx
                  ? 'Submit order for verification'
                  : 'Place order & pay'}
            </button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-700/55">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              Encrypted, pharmacist-reviewed checkout
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
