import type { CalendarConnection, CalendarProvider } from '../services/calendarApi';

export function calendarConnectionProvider(c: CalendarConnection): CalendarProvider | null {
  const p = String(c.provider ?? '').toLowerCase();
  if (p.includes('google')) return 'google';
  if (p.includes('microsoft') || p.includes('outlook')) return 'microsoft';
  return null;
}

export function isActiveCalendarConnection(c: CalendarConnection): boolean {
  return String(c.status ?? '').toLowerCase() === 'active';
}

export function hasCalendarProvider(connections: CalendarConnection[], provider: CalendarProvider): boolean {
  return connections.some((c) => calendarConnectionProvider(c) === provider && isActiveCalendarConnection(c));
}

export function hasAnyCalendarProvider(connections: CalendarConnection[], provider: CalendarProvider): boolean {
  return connections.some((c) => calendarConnectionProvider(c) === provider);
}

/** False when Google and Microsoft are both already linked (hide "+ Add another"). */
export function canConnectMoreCalendarProviders(connections: CalendarConnection[]): boolean {
  return !(hasAnyCalendarProvider(connections, 'google') && hasAnyCalendarProvider(connections, 'microsoft'));
}

/** Short chip/list label — "Google" / "Microsoft" (not full product names). */
export function connectionDisplayLabel(c: CalendarConnection): string {
  const p = calendarConnectionProvider(c);
  if (p === 'google') return 'Google';
  if (p === 'microsoft') return 'Microsoft';
  const raw = String(c.provider_display_name ?? '').trim();
  if (/google/i.test(raw)) return 'Google';
  if (/microsoft|outlook/i.test(raw)) return 'Microsoft';
  return raw || 'Calendar';
}
