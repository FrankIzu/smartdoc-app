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

/** Display name for Reach / HMS when API user has no single `name` field. */
export function getReachParticipantDisplayName(
  user: ReachParticipantLike | null | undefined
): string {
  if (!user) return 'Mobile User';

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
    'Mobile User'
  );
}

/** Prefer name from navigation params; otherwise derive from auth user. */
export function resolveReachDisplayName(
  paramUserName: string | string[] | undefined,
  user: ReachParticipantLike | null | undefined
): string {
  const raw = Array.isArray(paramUserName) ? paramUserName[0] : paramUserName;
  const fromParam = typeof raw === 'string' && raw.trim() ? raw.trim() : '';
  return fromParam || getReachParticipantDisplayName(user);
}
