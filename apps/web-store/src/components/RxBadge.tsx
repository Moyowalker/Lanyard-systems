export function RxBadge() {
  return (
    <span
      title="Prescription required - released only after pharmacist review"
      className="inline-flex items-center gap-1.5 rounded-full border border-white/75 bg-white/[0.94] px-3 py-1.5 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-brand-900 shadow-sm backdrop-blur-sm"
    >
      <span
        aria-hidden="true"
        className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-[0.72rem] font-bold uppercase leading-none text-brand-800"
      >
        Rx
      </span>
      Review required
    </span>
  );
}
