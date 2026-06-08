'use client';

import Link from 'next/link';
import { useCart, useRemoveFromCart } from '@/lib/client';
import { formatKobo } from '@/lib/format';

export default function CartPage() {
  const { data: cart, isLoading } = useCart();
  const remove = useRemoveFromCart();

  if (isLoading) return <p className="text-gray-500">Loading your cart…</p>;

  if (!cart) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
        <p className="text-gray-600">
          Please{' '}
          <Link href="/account/login" className="font-medium text-brand-700 hover:underline">
            sign in
          </Link>{' '}
          to view your cart.
        </p>
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-600">
        Your cart is empty.{' '}
        <Link href="/" className="font-medium text-brand-700 hover:underline">
          Browse medicines
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">Your cart</h1>
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {cart.items.map((item) => (
          <li key={item.productId} className="flex items-center justify-between gap-3 p-4">
            <div>
              <div className="font-medium text-gray-900">{item.name}</div>
              <div className="text-sm text-gray-500">
                {item.quantity} × {formatKobo(item.unitPriceKobo)}
                {item.requiresPrescription && (
                  <span className="ml-2 text-amber-700">℞ prescription required</span>
                )}
                {!item.inStock && <span className="ml-2 text-red-600">out of stock</span>}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-semibold text-gray-900">{formatKobo(item.lineTotalKobo)}</span>
              <button
                onClick={() => remove.mutate(item.productId)}
                disabled={remove.isPending}
                className="text-sm text-gray-400 hover:text-red-600"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
        <span className="text-gray-600">Subtotal</span>
        <span className="text-xl font-bold text-gray-900">{formatKobo(cart.subtotalKobo)}</span>
      </div>

      {cart.requiresRxVerification && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Your cart contains prescription-only items. You’ll upload a prescription at checkout, and
          a pharmacist must verify it before dispensing.
        </p>
      )}

      <Link
        href="/checkout"
        className="mt-4 block w-full rounded-lg bg-brand-600 py-3 text-center font-semibold text-white hover:bg-brand-700"
      >
        Proceed to checkout
      </Link>
    </div>
  );
}
