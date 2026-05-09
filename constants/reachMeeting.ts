/** AsyncStorage key: set while user is connected to a Reach (HMS) call; cleared on leave/end. */
export const REACH_CURRENT_MEETING_KEY = 'reach_current_meeting_id';

/**
 * Normalize join links / room codes so the same meeting merges in lists and matches storage.
 * - Composite "40740018:..." uses the numeric GrabDocs meeting id.
 * - Base64 payloads that decode to that shape (common in shared links) map to the same id.
 */
export function canonicalizeReachMeetingId(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return s;

  const plainComposite = s.match(/^(\d{1,20})(?::|$)/);
  if (plainComposite) return plainComposite[1];

  if (/^[A-Za-z0-9+/=_-]+$/.test(s) && s.length >= 8) {
    try {
      const normalized = s.replace(/-/g, '+').replace(/_/g, '/');
      const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
      const decoded =
        typeof atob === 'function' ? atob(normalized + pad) : '';
      const m = decoded.match(/^(\d{1,20})(?::|$)/);
      if (m) return m[1];
    } catch {
      // ignore invalid base64
    }
  }

  return s;
}
