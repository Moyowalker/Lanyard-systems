'use client';

import { useRouter } from 'next/navigation';
import {
  AuthRequiredError,
  useCart,
  useRemoveFromCart,
  useSetCartItemQuantity,
} from '@/lib/client';
import { QuantityStepper } from './QuantityStepper';

export function ProductQuantityControl({
  branchId,
  productId,
  productName,
  available,
  disabled,
}: {
  branchId?: string;
  productId: string;
  productName: string;
  available?: number;
  disabled?: boolean;
}) {
  const router = useRouter();
  const { data: cart } = useCart();
  const setQuantity = useSetCartItemQuantity();
  const remove = useRemoveFromCart();

  const line =
    cart && cart.branchId === branchId
      ? cart.items.find((item) => item.productId === productId)
      : undefined;
  const quantity = line?.quantity ?? 0;
  const max = Math.min(line?.available ?? available ?? 99, 99);
  const isUnavailable = Boolean(disabled);
  const isPending = setQuantity.isPending || remove.isPending;

  function handleAuthError(err: Error) {
    if (err instanceof AuthRequiredError) router.push('/account/login');
  }

  function setProductQuantity(nextQuantity: number) {
    if (!branchId || isUnavailable) return;
    setQuantity.mutate(
      { branchId, productId, quantity: nextQuantity },
      { onError: handleAuthError },
    );
  }

  function decrease() {
    if (quantity <= 1) {
      remove.mutate(productId);
      return;
    }
    setProductQuantity(quantity - 1);
  }

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

  if (quantity > 0) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-100 bg-brand-50/50 px-2 py-1.5">
        <span className="text-xs font-semibold text-brand-800">In cart</span>
        <QuantityStepper
          label={`${productName} quantity`}
          quantity={quantity}
          min={0}
          max={max}
          disabled={isPending || isUnavailable}
          onDecrease={decrease}
          onIncrease={() => setProductQuantity(quantity + 1)}
        />
      </div>
    );
  }

  const label = setQuantity.isPending
    ? 'Adding...'
    : setQuantity.isError
      ? 'Try again'
      : isUnavailable
        ? 'Unavailable'
        : 'Add';

  return (
    <button
      type="button"
      onClick={() => setProductQuantity(1)}
      aria-live="polite"
      disabled={isUnavailable || setQuantity.isPending}
      className={`inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
        setQuantity.isError
          ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
          : isUnavailable
            ? 'border border-paper-200 bg-paper-50 text-ink-900/45'
            : 'bg-brand-600 text-white hover:bg-brand-700'
      }`}
    >
      {setQuantity.isPending ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeOpacity="0.24"
            strokeWidth="2"
          />
          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
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
