export function RxBadge() {
  return (
    <span
      title="Prescription required — released only after pharmacist review"
      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-brand-800"
    >
      <span aria-hidden="true" className="font-display text-[0.95rem] leading-none">
        ℞
      </span>
      Prescription
    </span>
  );
}
