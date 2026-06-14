export function RxBadge() {
  return (
    <span
      title="Prescription required — released only after pharmacist review"
      className="inline-flex items-center gap-1 rounded-md bg-seal-100 px-2 py-1 text-[0.66rem] font-semibold text-amber-900"
    >
      <span aria-hidden="true">℞</span> Rx
    </span>
  );
}
