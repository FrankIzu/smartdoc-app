/** Fetch window & navigation for mobile calendar views (aligned with local timezone). */

export type CalendarSubView = 'month' | 'week' | 'day' | 'agenda';

export function toYMDLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday-start week containing `cursor`. */
export function weekRangeMonday(cursor: Date): { start: Date; end: Date } {
  const y = cursor.getFullYear();
  const mo = cursor.getMonth();
  const day = cursor.getDate();
  const d = new Date(y, mo, day);
  const dow = d.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

/** API `start_date` / `end_date` window for the active calendar mode. */
export function calendarFetchRange(cursor: Date, sub: CalendarSubView): { start: Date; end: Date } {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const day = cursor.getDate();

  if (sub === 'day') {
    const s = new Date(y, m, day, 0, 0, 0, 0);
    const e = new Date(y, m, day, 23, 59, 59, 999);
    return { start: s, end: e };
  }

  if (sub === 'week') {
    return weekRangeMonday(cursor);
  }

  if (sub === 'month') {
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0, 23, 59, 59, 999);
    first.setDate(first.getDate() - 14);
    last.setDate(last.getDate() + 14);
    return { start: first, end: last };
  }

  // agenda: surrounding months for smooth scrolling
  const first = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const last = new Date(y, m + 2, 0, 23, 59, 59, 999);
  return { start: first, end: last };
}

export function addCalendarPeriod(cursor: Date, sub: CalendarSubView, delta: number): Date {
  const x = new Date(cursor.getTime());
  if (sub === 'month' || sub === 'agenda') {
    x.setMonth(x.getMonth() + delta);
    return x;
  }
  if (sub === 'week') {
    x.setDate(x.getDate() + 7 * delta);
    return x;
  }
  x.setDate(x.getDate() + delta);
  return x;
}

export function formatCalendarTitle(cursor: Date, sub: CalendarSubView): string {
  if (sub === 'month' || sub === 'agenda') {
    return cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  }
  if (sub === 'week') {
    const { start, end } = weekRangeMonday(cursor);
    const sameYear = start.getFullYear() === end.getFullYear();
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    const a = start.toLocaleString(undefined, sameYear ? opts : { ...opts, year: 'numeric' });
    const b = end.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${a} – ${b}`;
  }
  return cursor.toLocaleString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
