const CURRENCY = import.meta.env.VITE_CURRENCY ?? 'INR';
const LOCALE = import.meta.env.VITE_LOCALE ?? 'en-IN';

/** Prices are stored in the smallest unit (paise/cents); this formats them for display. */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
}
