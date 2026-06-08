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
        className="rounded-md bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-500"
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
      className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
    >
      {add.isPending ? 'Adding…' : add.isSuccess ? 'Added ✓' : 'Add to cart'}
    </button>
  );
}
