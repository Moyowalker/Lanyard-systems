export function RxBadge() {
  return (
    <span
      title="Prescription required — released only after pharmacist review"
      className="inline-flex items-center gap-1.5 rounded-full border border-brand-200/90 bg-white/90 px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-brand-800 shadow-sm backdrop-blur-sm"
    >
      <span
        aria-hidden="true"
        className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 font-display text-[0.92rem] leading-none text-brand-800"
      >
        ℞
      </span>
      Prescription only
    </span>
  );
}
