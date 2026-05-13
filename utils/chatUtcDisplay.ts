/**
 * Rewrite UTC-looking datetimes embedded in ChatGD assistant text into the device timezone.
 * Skips fenced ``` code blocks so snippets stay verbatim.
 */

import { formatUtcIsoForDevice } from './calendarTime';

/** ISO / SQL-style datetime with time component (UTC stored in DB, shown local). */
const UTC_LIKE_DATETIME =
  /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2}(?::\d{2})?)?/g;

function replaceIsoTimesInPlainText(segment: string): string {
  return segment.replace(UTC_LIKE_DATETIME, (match) => {
    const trimmed = match.trim();
    const localized = formatUtcIsoForDevice(trimmed, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    return localized.trim() ? localized : match;
  });
}

export function localizeUtcDatesInAssistantText(text: string): string {
  if (!text || text.length < 16) return text;

  let result = '';
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('```', i);
    if (open === -1) {
      result += replaceIsoTimesInPlainText(text.slice(i));
      break;
    }
    result += replaceIsoTimesInPlainText(text.slice(i, open));
    const close = text.indexOf('```', open + 3);
    if (close === -1) {
      result += text.slice(open);
      break;
    }
    result += text.slice(open, close + 3);
    i = close + 3;
  }
  return result;
}
