import type { EmailImportEvent, EmailInboxAlias, EmailThread, InboxConnection, ThreadAttention } from '../../services/emailSyncApi';

const TTL_MS = 90_000;

function fresh(at: number) {
  return Date.now() - at < TTL_MS;
}

let workspaceId: number | null = null;
let pending = 0;

const replies = new Map<
  ThreadAttention,
  { threads: EmailThread[]; hasMailbox: boolean; at: number }
>();

let setup: {
  conns: InboxConnection[];
  aliases: EmailInboxAlias[];
  senders: string[];
  patterns: string[];
  needsReplySensitivity?: 'conservative' | 'balanced' | 'aggressive';
  grabdocsResearch?: boolean | null;
  at: number;
} | null = null;

let imports: { items: EmailImportEvent[]; cursor: string | null; at: number } | null = null;

export function emailSyncCacheWorkspace() {
  return workspaceId;
}
export function emailSyncCacheSetWorkspace(id: number | null) {
  workspaceId = id;
}

export function emailSyncCachePending() {
  return pending;
}
export function emailSyncCacheSetPending(n: number) {
  pending = n;
}

export function emailSyncCacheReplies(filter: ThreadAttention) {
  const hit = replies.get(filter);
  if (!hit) return null;
  return { ...hit, stale: !fresh(hit.at) };
}
export function emailSyncCacheSetReplies(
  filter: ThreadAttention,
  data: { threads: EmailThread[]; hasMailbox: boolean }
) {
  replies.set(filter, { ...data, at: Date.now() });
}

export function emailSyncCacheSetup() {
  if (!setup) return null;
  return { ...setup, stale: !fresh(setup.at) };
}
export function emailSyncCacheSetSetup(data: {
  conns: InboxConnection[];
  aliases: EmailInboxAlias[];
  senders: string[];
  patterns: string[];
  needsReplySensitivity?: 'conservative' | 'balanced' | 'aggressive';
  grabdocsResearch?: boolean | null;
}) {
  setup = { ...data, at: Date.now() };
}

export function emailSyncCacheImports() {
  if (!imports) return null;
  return { ...imports, stale: !fresh(imports.at) };
}
export function emailSyncCacheSetImports(data: { items: EmailImportEvent[]; cursor: string | null }) {
  imports = { ...data, at: Date.now() };
}
