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

  const isUnavailable = disabled || !branchId;
  const isPending = add.isPending;
  const isSuccess = add.isSuccess;
  const isError = add.isError;

  if (!branchId) {
    return (
      <div className="space-y-2">
        <button
          disabled
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-paper-200 bg-paper-100 px-4 py-3 text-sm font-semibold text-ink-700/45"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
            <path
              d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11Z"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          Select a branch to continue
        </button>
        <p className="px-1 text-xs leading-5 text-ink-700/62">
          Branch selection keeps pricing, stock, and fulfilment promises accurate.
        </p>
      </div>
    );
  }

  const label = isPending
    ? 'Adding to cart'
    : isSuccess
      ? 'Added to cart'
      : isError
        ? 'Try again'
        : 'Add to cart';

  return (
    <div className="space-y-2">
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
        aria-live="polite"
        disabled={isUnavailable || isPending}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition duration-300 disabled:cursor-not-allowed disabled:opacity-50 ${
          isSuccess
            ? 'bg-brand-600 text-white shadow-[0_18px_30px_-22px_rgba(11,33,28,0.8)]'
            : isError
              ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:-translate-y-0.5 hover:bg-rose-100'
              : 'bg-ink-950 text-white shadow-[0_18px_30px_-22px_rgba(11,33,28,0.9)] hover:-translate-y-0.5 hover:bg-brand-800'
        }`}
      >
        {isPending ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.24" strokeWidth="2" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : isSuccess ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
            <path
              d="m6.5 12.5 3.4 3.4 7.6-8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : isError ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M12 8v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="16.5" r="1" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
        <span>{label}</span>
      </button>
      {isError ? (
        <p className="px-1 text-xs leading-5 text-rose-700">
          We could not add this item right now. Try again or refresh your session.
        </p>
      ) : null}
    </div>
  );
}
