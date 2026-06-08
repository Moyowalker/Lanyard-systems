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

  if (isLoading) return <p className="text-gray-500">Loading…</p>;
  if (!cart)
    return (
      <p className="text-gray-600">
        Please{' '}
        <Link href="/account/login" className="font-medium text-brand-700 hover:underline">
          sign in
        </Link>{' '}
        to check out.
      </p>
    );
  if (cart.items.length === 0)
    return (
      <p className="text-gray-600">
        Your cart is empty.{' '}
        <Link href="/" className="font-medium text-brand-700 hover:underline">
          Browse medicines
        </Link>
        .
      </p>
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Checkout</h1>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Order summary</h2>
        <ul className="divide-y divide-gray-100 text-sm">
          {cart.items.map((i) => (
            <li key={i.productId} className="flex justify-between py-2">
              <span>
                {i.name} × {i.quantity}
                {i.requiresPrescription && <span className="ml-1 text-amber-700">℞</span>}
              </span>
              <span>{formatKobo(i.lineTotalKobo)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between border-t border-gray-100 pt-2 font-semibold">
          <span>Subtotal</span>
          <span>{formatKobo(cart.subtotalKobo)}</span>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Fulfillment</h2>
        <div className="flex gap-4">
          {(['pickup', 'delivery'] as Fulfillment[]).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm capitalize">
              <input
                type="radio"
                name="fulfillment"
                checked={fulfillment === opt}
                onChange={() => setFulfillment(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
        {fulfillment === 'delivery' && (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <input
              placeholder="Address line"
              value={address.line1}
              onChange={(e) => setAddress({ ...address, line1: e.target.value })}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm sm:col-span-3"
            />
            <input
              placeholder="City"
              value={address.city}
              onChange={(e) => setAddress({ ...address, city: e.target.value })}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
            <input
              placeholder="State"
              value={address.state}
              onChange={(e) => setAddress({ ...address, state: e.target.value })}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
        )}
      </section>

      {needsRx && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-1 font-semibold text-amber-900">Prescription required</h2>
          <p className="mb-3 text-sm text-amber-800">
            Your cart contains prescription-only medicine. Upload your prescription — a pharmacist
            will verify it before your order is dispensed.
          </p>
          <input
            type="file"
            accept="image/*,application/pdf"
            multiple
            onChange={(e) => setFiles(e.target.files)}
            className="text-sm"
          />
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={placeOrder}
        disabled={busy}
        className="w-full rounded-lg bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {busy
          ? step || 'Working…'
          : needsRx
            ? 'Submit order for verification'
            : 'Place order & pay'}
      </button>
    </div>
  );
}
