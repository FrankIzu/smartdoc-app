/**
 * Detect GrabDocs API file-view URLs from chat markdown so we open in-app instead of the system browser.
 */

export type ParsedFileViewLink = {
  fileId: number;
  /** Full URL for WebView when link is signed (path /v/... or ?sig=&exp=&uid=). */
  pdfUri?: string;
};

function hasSignedQuery(search: string): boolean {
  const qs = search.startsWith('?') ? search.slice(1) : search;
  const p = new URLSearchParams(qs);
  return p.has('sig') && p.has('exp') && p.has('uid');
}

/**
 * Parse production or local API URLs for file view endpoints.
 */
export function parseGrabDocsFileViewUrl(rawUrl: string): ParsedFileViewLink | null {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return null;
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }
  const path = u.pathname;
  const signedQs = hasSignedQuery(u.search);

  // .../files/123/view OR .../files/123/v/<signed-token>
  const webRe =
    /^\/api\/v1\/web\/files\/(\d+)\/(?:view\/?$|v\/([^/?#]+))/;
  const wm = path.match(webRe);
  if (wm) {
    const fileId = parseInt(wm[1], 10);
    if (Number.isNaN(fileId)) return null;
    const pathToken = wm[2];
    if (pathToken || signedQs) {
      return { fileId, pdfUri: trimmed.split('#')[0] };
    }
    return { fileId };
  }

  const mobRe = /\/api\/v1\/mobile\/files\/(\d+)\/view/;
  const mm = path.match(mobRe);
  if (mm) {
    const fileId = parseInt(mm[1], 10);
    if (Number.isNaN(fileId)) return null;
    if (signedQs) {
      return { fileId, pdfUri: trimmed.split('#')[0] };
    }
    return { fileId };
  }

  return null;
}
