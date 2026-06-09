'use client';

import { useRouter } from 'next/navigation';
import { AuthRequiredError, useAddToCart } from '@/lib/client';

export function AddToCartButton({
  branchId,
  productId,
  disabled,
}: {
  branchId?: string;
  productId: string;
  disabled?: boolean;
}) {
  const add = useAddToCart();
  const router = useRouter();

  if (!branchId) {
    return (
      <button
        disabled
        className="inline-flex w-full items-center justify-center rounded-xl border border-paper-200 bg-paper-100 px-4 py-3 text-sm font-semibold text-ink-700/45"
      >
        Select a branch
      </button>
    );
  }

  return (
    <button
      onClick={() =>
        add.mutate(
          { branchId, productId, quantity: 1 },
          {
            onError: (err) => {
              if (err instanceof AuthRequiredError) router.push('/account/login');
            },
          },
        )
      }
      disabled={disabled || add.isPending}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
        add.isSuccess
          ? 'bg-brand-600 shadow-[0_14px_26px_-18px_rgba(11,33,28,0.8)]'
          : 'bg-ink-900 shadow-[0_14px_26px_-18px_rgba(11,33,28,0.9)] hover:-translate-y-0.5 hover:bg-brand-800'
      }`}
    >
      {add.isPending ? 'Adding…' : add.isSuccess ? 'Added to cart ✓' : 'Add to cart'}
    </button>
  );
}
