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

  const isPending = add.isPending;
  const isSuccess = add.isSuccess;
  const isError = add.isError;

  if (!branchId) {
    return (
      <button
        disabled
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-paper-200 bg-paper-50 px-3 py-2.5 text-sm font-semibold text-ink-900/45"
      >
        Select a branch
      </button>
    );
  }

  const isUnavailable = Boolean(disabled);

  const label = isPending
    ? 'Adding…'
    : isSuccess
      ? 'Added'
      : isError
        ? 'Try again'
        : isUnavailable
          ? 'Unavailable'
          : 'Add';

  return (
    <button
      type="button"
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
      aria-live="polite"
      disabled={isUnavailable || isPending}
      className={`inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
        isError
          ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
          : isUnavailable
            ? 'border border-paper-200 bg-paper-50 text-ink-900/45'
            : 'bg-brand-600 text-white hover:bg-brand-700'
      }`}
    >
      {isPending ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.24" strokeWidth="2" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : isSuccess ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
          <path d="m6.5 12.5 3.4 3.4 7.6-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : isUnavailable ? null : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
      <span>{label}</span>
    </button>
  );
}
