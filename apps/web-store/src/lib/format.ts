/** Format integer minor units (kobo) as Naira currency. */
export function formatKobo(kobo?: number, currency = 'NGN'): string {
  if (kobo == null) return '—';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(kobo / 100);
}
