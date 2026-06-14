'use client';

type QuantityStepperProps = {
  label: string;
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  disabled?: boolean;
  min?: number;
  max?: number;
};

export function QuantityStepper({
  label,
  quantity,
  onDecrease,
  onIncrease,
  disabled = false,
  min = 1,
  max = 99,
}: QuantityStepperProps) {
  const canDecrease = !disabled && quantity > min;
  const canIncrease = !disabled && quantity < max;

  return (
    <div
      className="inline-flex h-9 items-center overflow-hidden rounded-full border border-paper-200 bg-white shadow-sm"
      aria-label={label}
    >
      <button
        type="button"
        onClick={onDecrease}
        disabled={!canDecrease}
        className="flex h-full w-9 items-center justify-center text-ink-700/65 transition hover:bg-paper-50 hover:text-ink-950 disabled:cursor-not-allowed disabled:text-ink-700/25"
        aria-label={`${label}: decrease quantity`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden="true"
        >
          <path d="M6 12h12" strokeLinecap="round" />
        </svg>
      </button>
      <span className="tnum min-w-8 border-x border-paper-200 px-2 text-center text-sm font-semibold text-ink-950">
        {quantity}
      </span>
      <button
        type="button"
        onClick={onIncrease}
        disabled={!canIncrease}
        className="flex h-full w-9 items-center justify-center text-ink-700/65 transition hover:bg-paper-50 hover:text-ink-950 disabled:cursor-not-allowed disabled:text-ink-700/25"
        aria-label={`${label}: increase quantity`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden="true"
        >
          <path d="M12 6v12M6 12h12" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
