export type PlainTextPart =
  | { type: 'text'; text: string }
  | { type: 'url'; raw: string };

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
const TRAILING_PUNCT = /[.,;:!?)}\]'"]+$/;

/** Strip HTML / markdown wrappers so bare URLs can be detected and opened. */
export function normalizeLinkifySource(text: string): string {
  if (!text) return '';

  let s = text;
  s = s.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi, (_, label: string, url: string) => {
    const trimmed = label.trim();
    return trimmed && trimmed !== url ? `${trimmed} ${url}` : url;
  });
  s = s.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi, '$1');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  return s;
}

/** Split plain text into segments, detecting http(s) and www. URLs. */
export function splitTextByUrls(text: string): PlainTextPart[] {
  const normalized = normalizeLinkifySource(text);
  if (!normalized) return [];

  const parts: PlainTextPart[] = [];
  let lastIndex = 0;

  for (const match of normalized.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: 'text', text: normalized.slice(lastIndex, index) });
    }

    let raw = match[0];
    const trailing = raw.match(TRAILING_PUNCT)?.[0] ?? '';
    if (trailing) raw = raw.slice(0, -trailing.length);

    if (raw) parts.push({ type: 'url', raw });
    if (trailing) parts.push({ type: 'text', text: trailing });

    lastIndex = index + match[0].length;
  }

  if (lastIndex < normalized.length) {
    parts.push({ type: 'text', text: normalized.slice(lastIndex) });
  }

  return parts.length ? parts : [{ type: 'text', text: normalized }];
}
