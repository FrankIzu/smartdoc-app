/** Decode URL-encoded upload names (e.g. "My%20File.pdf" → "My File.pdf"). */
export function sanitizeDisplayFilename(name: string | null | undefined): string {
  let n = (name || 'Document').trim();
  if (!n) return 'Document';
  try {
    for (let i = 0; i < 2; i++) {
      if (!/%[0-9A-Fa-f]{2}/.test(n) && !n.includes('+')) break;
      const next = decodeURIComponent(n.replace(/\+/g, ' '));
      if (next === n) break;
      n = next;
    }
  } catch {
    // keep raw name
  }
  const base = n.split(/[/\\]/).pop();
  return base?.trim() || n;
}

/** Truncate long labels for list rows; keeps room for the trailing ellipsis. */
export function truncateDisplayText(text: string, maxLength: number): string {
  if (maxLength < 4) return text;
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 3).trimEnd()}...`;
}

/** Default max length for signature envelope titles in list rows. */
export const SIGNATURE_LIST_TITLE_MAX = 48;

/** Default max length for signature titles in screen headers. */
export const SIGNATURE_HEADER_TITLE_MAX = 56;
