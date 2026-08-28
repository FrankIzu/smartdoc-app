import type { EmailMessage } from '../../../services/emailSyncApi';

export type AnalysisRequest = { label: string; type: string };
export type AnalysisQuery = { query: string; type: string; confidence?: number };
export type ThreadAnalysis = {
  intent_summary: string;
  requests: AnalysisRequest[];
  thread_summary?: string;
  search_queries?: AnalysisQuery[];
  auto_suggest_eligible?: boolean;
  confidence?: number;
};

export const REPLY_TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'concise', label: 'Concise' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'firm', label: 'Firm' },
] as const;

export type ReplyTone = (typeof REPLY_TONES)[number]['value'];
export const DEFAULT_REPLY_TONE: ReplyTone = 'professional';

export function restoreTone(raw?: string | null): ReplyTone {
  const t = (raw || '').toLowerCase();
  if (t === 'formal') return 'professional';
  if ((REPLY_TONES as readonly { value: string }[]).some((x) => x.value === t)) return t as ReplyTone;
  return DEFAULT_REPLY_TONE;
}

export function requestIcon(type: string) {
  const t = (type || '').toLowerCase();
  if (t === 'document' || t === 'attachment') return '📎';
  if (t === 'calendar') return '📅';
  return '✓';
}

function normEmail(addr?: string | null) {
  const raw = (addr || '').trim().toLowerCase();
  const lt = raw.lastIndexOf('<');
  const gt = raw.lastIndexOf('>');
  if (lt >= 0 && gt > lt) return raw.slice(lt + 1, gt).trim();
  return raw;
}

export function canReplyAll(messages: EmailMessage[]) {
  const inbound = [...messages].reverse().find((m) => m.direction === 'inbound') || messages[messages.length - 1];
  if (!inbound) return false;
  const sender = normEmail((inbound as { reply_to_address?: string }).reply_to_address || inbound.from_address);
  const others = new Set<string>();
  for (const addr of [...(inbound.to_addresses || []), ...(inbound.cc_addresses || [])]) {
    const n = normEmail(addr);
    if (n && n !== sender) others.add(n);
  }
  return others.size > 0;
}

export function prepopulateResearchQuestion(analysis: ThreadAnalysis): { text: string; aiSuggested: boolean } {
  const requestLabels = new Set(
    (analysis.requests || []).map((r) => (r.label || '').trim().toLowerCase()).filter(Boolean),
  );
  const qs = (analysis.search_queries || [])
    .map((q) => (q.query || '').trim())
    .filter((q) => q && !requestLabels.has(q.toLowerCase()));
  if (qs.length) return { text: qs.join('\n'), aiSuggested: true };
  return { text: '', aiSuggested: false };
}
