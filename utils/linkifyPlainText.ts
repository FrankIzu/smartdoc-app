export type PlainTextPart =
  | { type: 'text'; text: string }
  | { type: 'url'; raw: string };

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
const TRAILING_PUNCT = /[.,;:!?)}\]'"]+$/;

/** Split plain text into segments, detecting http(s) and www. URLs. */
export function splitTextByUrls(text: string): PlainTextPart[] {
  if (!text) return [];

  const parts: PlainTextPart[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: 'text', text: text.slice(lastIndex, index) });
    }

    let raw = match[0];
    const trailing = raw.match(TRAILING_PUNCT)?.[0] ?? '';
    if (trailing) raw = raw.slice(0, -trailing.length);

    if (raw) parts.push({ type: 'url', raw });
    if (trailing) parts.push({ type: 'text', text: trailing });

    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return parts.length ? parts : [{ type: 'text', text }];
}
