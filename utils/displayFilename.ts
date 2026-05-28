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
