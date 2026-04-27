/**
 * Models sometimes emit [Open](file-url) instead of [Open Document](file-url).
 * Normalize the display label for file view links only.
 */
export function formatDocumentOpenLinkLabel(linkText: string, linkUrl: string): string {
  const t = linkText.trim();
  if (!/^open$/i.test(t)) return linkText;
  const u = linkUrl.trim();
  if (u.includes('/api/v1/web/files/') && (u.includes('/view') || /\/v\//.test(u))) {
    return 'Open Document';
  }
  return linkText;
}
