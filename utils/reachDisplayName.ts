/**
 * Only fields used for the label. Intentionally separate from `types/User` so auth
 * context users (e.g. `id: string`) are assignable without conflicting with API types.
 */
export interface ReachParticipantLike {
  name?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  email?: string;
}

/**
 * Generic param values that should never be treated as a real display name.
 * These are fallback strings that may have been baked into a navigation URL
 * when the auth profile was not yet available — prefer the live user profile instead.
 */
const GENERIC_PARAM_FALLBACKS = new Set([
  'mobile user',
  'guest',
  'participant',
  'user',
]);

/** Display name for Reach / HMS when API user has no single `name` field. */
export function getReachParticipantDisplayName(
  user: ReachParticipantLike | null | undefined
): string {
  if (!user) return '';

  const name = typeof user.name === 'string' ? user.name.trim() : '';
  const first = (user.first_name || '').trim();
  const last = (user.last_name || '').trim();
  const fromParts = [first, last].filter(Boolean).join(' ').trim();
  const username = (user.username || '').trim();
  const email = (user.email || '').trim();
  const localPart = email ? email.split('@')[0] : '';

  return (
    name ||
    fromParts ||
    username ||
    localPart ||
    email ||
    ''
  );
}

/** Trim, bound length, strip control chars, collapse whitespace — empty means unusable. */
export function sanitizeReachDisplayName(raw: string): string {
  return raw
    .trim()
    .slice(0, 100)
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Prefer name from navigation params; otherwise derive from auth user. */
export function resolveReachDisplayName(
  paramUserName: string | string[] | undefined,
  user: ReachParticipantLike | null | undefined
): string {
  const raw = Array.isArray(paramUserName) ? paramUserName[0] : paramUserName;
  const fromParam =
    typeof raw === 'string' ? sanitizeReachDisplayName(raw) : '';
  const paramIsGeneric = GENERIC_PARAM_FALLBACKS.has(fromParam.toLowerCase());
  const fromUser = getReachParticipantDisplayName(user);
  return (paramIsGeneric ? '' : fromParam) || fromUser || fromParam || 'Guest';
}

const warnedHmsMissingUserName = new Set<string>();

/**
 * HMS / join-by-id: sanitized param first, then auth-derived label.
 * In __DEV__, logs once per meetingId when the route param did not yield a usable name (navigator gap).
 */
export function getHmsDisplayUserName(
  paramUserName: string | string[] | undefined,
  user: ReachParticipantLike | null | undefined,
  meetingId?: string | number
): string {
  const raw = Array.isArray(paramUserName) ? paramUserName[0] : paramUserName;
  const fromParam = typeof raw === 'string' ? sanitizeReachDisplayName(raw) : '';
  if (typeof __DEV__ !== 'undefined' && __DEV__ && !fromParam && meetingId != null) {
    const key = String(meetingId).trim();
    if (key && !warnedHmsMissingUserName.has(key)) {
      warnedHmsMissingUserName.add(key);
      console.warn(
        `HMS: fallback display name used (missing userName param) for meetingId=${key}`
      );
    }
  }
  const paramIsGeneric = GENERIC_PARAM_FALLBACKS.has(fromParam.toLowerCase());
  const fromUser = getReachParticipantDisplayName(user);
  return (paramIsGeneric ? '' : fromParam) || fromUser || fromParam || 'Guest';
}
