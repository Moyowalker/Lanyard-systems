'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { QuantityStepper } from '@/components/QuantityStepper';
import { useCart, useRemoveFromCart, useSetCartItemQuantity } from '@/lib/client';
import { formatKobo } from '@/lib/format';

function CartShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="state-card mx-auto max-w-md text-center">
      <div className="flex flex-col items-center gap-4 py-6">{children}</div>
    </div>
  );
}

function CartContent() {
  const searchParams = useSearchParams();
  const { data: cart, isLoading } = useCart();
  const remove = useRemoveFromCart();
  const setQuantity = useSetCartItemQuantity();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-full bg-white/70" />
        <div className="surface-panel h-56 animate-pulse" />
      </div>
    );
  }

  if (!cart) {
    return (
      <CartShell>
        <span className="flex h-14 w-14 items-center justify-center rounded-[1.4rem] bg-brand-100 text-brand-800">
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <path d="M4 5h2l1.6 10.2a1.5 1.5 0 0 0 1.5 1.3h7.7a1.5 1.5 0 0 0 1.5-1.2L20 8H7" />
            <circle cx="9.5" cy="20" r="1.2" />
            <circle cx="18" cy="20" r="1.2" />
          </svg>
        </span>
        <div>
          <div className="font-display text-xl text-ink-950">Sign in to view your cart</div>
          <p className="mt-1.5 text-sm text-ink-700/75">
            Your basket stays tied to your account so pricing and stock stay accurate.
          </p>
        </div>
        <Link href="/account/login" className="primary-button">
          Sign in
        </Link>
      </CartShell>
    );
  }

  if (cart.items.length === 0) {
    return (
      <CartShell>
        <span className="flex h-14 w-14 items-center justify-center rounded-[1.4rem] bg-brand-100 text-brand-800">
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <path d="M4 5h2l1.6 10.2a1.5 1.5 0 0 0 1.5 1.3h7.7a1.5 1.5 0 0 0 1.5-1.2L20 8H7" />
            <circle cx="9.5" cy="20" r="1.2" />
            <circle cx="18" cy="20" r="1.2" />
          </svg>
        </span>
        <div>
          <div className="font-display text-xl text-ink-950">Your cart is empty</div>
          <p className="mt-1.5 text-sm text-ink-700/75">
            Browse the catalogue and add the medicines you need.
          </p>
        </div>
        <Link href="/" className="primary-button">
          Browse medicines
        </Link>
      </CartShell>
    );
  }

  const itemCount = cart.items.reduce((n, i) => n + i.quantity, 0);
  const reordered = searchParams.get('reordered') === '1';
  const unavailable = searchParams.get('unavailable');

  function updateLineQuantity(productId: string, quantity: number) {
    const branchId = cart?.branchId;
    if (!branchId) return;
    setQuantity.mutate({ branchId, productId, quantity });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <div className="page-eyebrow">Your basket</div>
        <h1 className="page-title mt-2">Cart</h1>
      </div>

      {reordered ? (
        <div className="rx-note mb-5">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[0.9rem] bg-brand-100 font-display text-sm font-bold text-brand-800">
            ↻
          </span>
          <div>
            <div className="font-semibold text-ink-950">Order items added back to your cart</div>
            <p className="mt-1 text-ink-700/80">
              {unavailable
                ? `Some items need review before checkout: ${unavailable}.`
                : 'Prices and availability were refreshed for your selected branch.'}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <div className="surface-panel overflow-hidden">
            <ul className="divide-y divide-paper-200/70">
              {cart.items.map((item) => (
                <li key={item.productId} className="line-row hover:bg-paper-50/60">
                  <div className="min-w-0">
                    <div className="font-semibold text-ink-950">{item.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-700/70">
                      <span className="tnum">{formatKobo(item.unitPriceKobo)} each</span>
                      {item.requiresPrescription ? (
                        <span className="inline-flex items-center gap-1 font-medium text-seal-400">
                          <span aria-hidden="true">℞</span> Prescription required
                        </span>
                      ) : null}
                      {!item.inStock ? (
                        <span className="font-medium text-rose-600">Out of stock</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-none items-center gap-4">
                    <QuantityStepper
                      label={`${item.name} quantity`}
                      quantity={item.quantity}
                      disabled={setQuantity.isPending || !cart.branchId}
                      onDecrease={() => updateLineQuantity(item.productId, item.quantity - 1)}
                      onIncrease={() => updateLineQuantity(item.productId, item.quantity + 1)}
                    />
                    <span className="tnum font-semibold text-ink-950">
                      {formatKobo(item.lineTotalKobo)}
                    </span>
                    <button
                      onClick={() => remove.mutate(item.productId)}
                      disabled={remove.isPending}
                      className="rounded-full p-2 text-ink-700/45 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                      aria-label={`Remove ${item.name}`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                      >
                        <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 transition hover:text-brand-800"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
            >
              <path d="M19 12H5m6-6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Continue shopping
          </Link>
        </div>

        {/* Summary */}
        <div className="space-y-4 summary-sticky">
          <div className="surface-panel px-5 py-6">
            <div className="section-kicker">Order summary</div>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between text-ink-700/75">
                <dt>Items</dt>
                <dd className="tnum font-medium text-ink-900">{itemCount}</dd>
              </div>
              <div className="flex justify-between text-ink-700/75">
                <dt>Subtotal</dt>
                <dd className="tnum font-medium text-ink-900">{formatKobo(cart.subtotalKobo)}</dd>
              </div>
              <div className="flex justify-between text-ink-700/60">
                <dt>Delivery</dt>
                <dd>Calculated at checkout</dd>
              </div>
            </dl>
            <div className="mt-4 flex items-baseline justify-between border-t border-paper-200 pt-4">
              <span className="font-semibold text-ink-950">Subtotal</span>
              <span className="tnum font-display text-2xl text-ink-950">
                {formatKobo(cart.subtotalKobo)}
              </span>
            </div>

            <Link href="/checkout" className="primary-button mt-5 w-full">
              Proceed to checkout
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
              >
                <path d="M5 12h14m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>

          {cart.requiresRxVerification ? (
            <div className="rx-note">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[0.9rem] bg-seal-200/70 font-display text-sm font-bold text-ink-900">
                Rx
              </span>
              <div>
                <div className="font-semibold text-ink-950">Prescription required</div>
                <p className="mt-1 text-ink-700/80">
                  You&apos;ll upload a prescription at checkout. A pharmacist verifies it before
                  dispensing.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-[1.3rem] border border-paper-200 bg-paper-50/70 p-4 text-sm text-ink-700/75">
              <span className="font-semibold text-ink-900">Secure checkout.</span> Pay by card, bank
              transfer, or USSD. Pickup or delivery at your branch.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CartPage() {
  return (
    <Suspense fallback={<p className="text-ink-700/60">Loading...</p>}>
      <CartContent />
    </Suspense>
  );
}
