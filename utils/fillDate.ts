/** Format a date for fill-field display and storage (locale-friendly). */
export function formatFillDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Parse a stored fill date string; falls back to today when invalid. */
export function parseFillDate(value: string | undefined | null): Date {
  if (!value?.trim()) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
