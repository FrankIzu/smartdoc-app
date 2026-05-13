import { calendarCreateEvent } from '../services/calendarApi';
import { isCalendarFetchOfflineError } from './calendarCache';
import { getCalendarEncryptedBlob, removeCalendarEncryptedBlob, setCalendarEncryptedBlob } from './calendarEncryptedStorage';
import { defaultCalendarListWindow, parseUTC } from './calendarTime';

/**
 * Pending calendar creates (mutation queue, not list cache).
 *
 * Queue ownership: each row is tied to `userId` at enqueue time; `flushPendingCalendarCreates(userId)`
 * only touches rows with that id. Logout clears the store via `clearAllPendingCalendarCreates` from auth.
 *
 * Serialized replay: chained `flushTail` ensures at most one flush pipeline runs at a time per process.
 *
 * Retry: `classifyCalendarFlushError` — transient = offline/network/5xx/429; permanent = other 4xx.
 * After `MAX_FLUSH_ATTEMPTS`, transient rows become `failed_permanent`.
 */

const STORAGE_KEY = '@grabdocs_calendar_pending_creates_v1';

const MAX_FLUSH_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 2000;

export type PendingStatus = 'queued' | 'syncing' | 'failed_transient' | 'failed_permanent';

export type PendingCalendarCreate = {
  localId: string;
  clientRequestId: string;
  userId: number;
  queuedAt: number;
  body: Record<string, unknown>;
  status: PendingStatus;
  attemptCount: number;
  lastError?: string;
  lastAttemptAt?: number;
};

export type PendingEventRow = Record<string, any> & {
  _offlinePendingCreate?: boolean;
  _offlinePendingLocalId?: string;
  _needsAttention?: boolean;
};

export type FlushResult = { synced: number; failed: number; permanent: number };

function randomLocalId(): string {
  return `pc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function newClientRequestId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizePendingRow(raw: Record<string, unknown>): PendingCalendarCreate | null {
  const localId = typeof raw.localId === 'string' ? raw.localId : null;
  const userId = typeof raw.userId === 'number' ? raw.userId : Number(raw.userId);
  const body = raw.body && typeof raw.body === 'object' && !Array.isArray(raw.body) ? (raw.body as Record<string, unknown>) : null;
  if (!localId || !Number.isFinite(userId) || !body) return null;
  const clientRequestIdRaw =
    typeof raw.clientRequestId === 'string'
      ? raw.clientRequestId
      : typeof body.client_request_id === 'string'
        ? (body.client_request_id as string)
        : '';
  const clientRequestId = clientRequestIdRaw || newClientRequestId();
  const status = (raw.status as PendingStatus) || 'queued';
  const safeStatus: PendingStatus =
    status === 'failed_transient' || status === 'failed_permanent' || status === 'queued'
      ? status
      : 'queued';
  return {
    localId,
    clientRequestId,
    userId,
    queuedAt: typeof raw.queuedAt === 'number' ? raw.queuedAt : Date.now(),
    body: { ...body, client_request_id: clientRequestId },
    status: status === 'syncing' ? 'queued' : safeStatus,
    attemptCount: typeof raw.attemptCount === 'number' ? raw.attemptCount : 0,
    lastError: typeof raw.lastError === 'string' ? raw.lastError : undefined,
    lastAttemptAt: typeof raw.lastAttemptAt === 'number' ? raw.lastAttemptAt : undefined,
  };
}

async function readAll(): Promise<PendingCalendarCreate[]> {
  try {
    const raw = await getCalendarEncryptedBlob(STORAGE_KEY);
    if (!raw) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await removeCalendarEncryptedBlob(STORAGE_KEY);
      return [];
    }
    if (!Array.isArray(parsed)) {
      await removeCalendarEncryptedBlob(STORAGE_KEY);
      return [];
    }
    const out: PendingCalendarCreate[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const n = normalizePendingRow(item as Record<string, unknown>);
      if (n) out.push(n);
    }
    return out;
  } catch {
    return [];
  }
}

async function writeAll(list: PendingCalendarCreate[]): Promise<void> {
  try {
    await setCalendarEncryptedBlob(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

let flushTail: Promise<unknown> = Promise.resolve();

export function classifyCalendarFlushError(e: unknown): 'transient' | 'permanent' {
  if (isCalendarFetchOfflineError(e)) return 'transient';
  const err = e as { response?: { status?: number } };
  const status = err?.response?.status;
  if (status === 429) return 'transient';
  if (typeof status === 'number' && status >= 500) return 'transient';
  if (typeof status === 'number' && status >= 400 && status < 500) return 'permanent';
  return 'transient';
}

export async function enqueuePendingCalendarCreate(
  body: Record<string, unknown>,
  userId: number | undefined
): Promise<string> {
  if (userId == null) throw new Error('Missing user id');
  const localId = randomLocalId();
  const clientRequestId = newClientRequestId();
  const queuedAt = Date.now();
  const bodyWith: Record<string, unknown> = {
    ...body,
    client_request_id: clientRequestId,
    created_from_offline_queue: true,
    original_client_timestamp: new Date(queuedAt).toISOString(),
  };
  const list = await readAll();
  list.push({
    localId,
    clientRequestId,
    userId,
    queuedAt,
    body: bodyWith,
    status: 'queued',
    attemptCount: 0,
  });
  await writeAll(list);
  return localId;
}

export async function getPendingCalendarCreates(): Promise<PendingCalendarCreate[]> {
  return readAll();
}

export async function getPendingCalendarCreate(localId: string): Promise<PendingCalendarCreate | null> {
  const list = await readAll();
  return list.find((p) => p.localId === localId) ?? null;
}

export async function removePendingCalendarCreate(localId: string): Promise<void> {
  const list = await readAll();
  await writeAll(list.filter((p) => p.localId !== localId));
}

export async function clearAllPendingCalendarCreates(): Promise<void> {
  try {
    await removeCalendarEncryptedBlob(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export async function resetPendingCalendarToQueued(localId: string): Promise<void> {
  const list = await readAll();
  const next = list.map((p) =>
    p.localId === localId ? { ...p, status: 'queued' as const, lastError: undefined, attemptCount: 0 } : p
  );
  await writeAll(next);
}

export function localPendingNumericId(localId: string): number {
  let h = 2166136261;
  for (let i = 0; i < localId.length; i++) {
    h ^= localId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = Math.abs(h % 2147483647);
  return -n - 1;
}

export function pendingCreatesToEventRows(
  pending: PendingCalendarCreate[],
  opts: {
    userId: number | undefined;
    viewUserId: number | null;
    isAdmin: boolean;
    debouncedSearch: string;
    showPersonal: boolean;
    showCompany: boolean;
    isPersonalAccount: boolean;
  }
): PendingEventRow[] {
  const uid = opts.userId ?? 0;
  const { start, end } = defaultCalendarListWindow();
  const startMs = start.getTime();
  const endMs = end.getTime();
  const q = opts.debouncedSearch.trim().toLowerCase();

  if (opts.viewUserId != null && opts.isAdmin && opts.viewUserId !== uid) {
    return [];
  }

  const rows: PendingEventRow[] = [];
  for (const p of pending) {
    if (p.userId !== uid) continue;
    const body = p.body;
    const et = String(body.event_type ?? 'personal').toLowerCase();
    if (opts.isPersonalAccount) {
      if (et !== 'personal') continue;
    } else {
      if (!opts.showPersonal && !opts.showCompany) continue;
      if (!opts.showPersonal && opts.showCompany && et !== 'company') continue;
      if (opts.showPersonal && !opts.showCompany && et !== 'personal') continue;
    }

    const st = body.start_time ? String(body.start_time) : '';
    let startT = NaN;
    try {
      startT = st ? parseUTC(st).getTime() : NaN;
    } catch {
      startT = NaN;
    }
    if (!Number.isFinite(startT) || startT < startMs || startT > endMs) continue;

    if (q) {
      const title = String(body.title ?? '').toLowerCase();
      const desc = String(body.description ?? '').toLowerCase();
      const loc = String(body.location ?? '').toLowerCase();
      if (!title.includes(q) && !desc.includes(q) && !loc.includes(q)) continue;
    }

    const numericId = localPendingNumericId(p.localId);
    const needsAttention = p.status === 'failed_permanent' || p.attemptCount >= MAX_FLUSH_ATTEMPTS;
    rows.push({
      id: numericId,
      title: body.title,
      description: body.description,
      notes: body.notes,
      start_time: body.start_time,
      end_time: body.end_time,
      timezone: body.timezone,
      location: body.location,
      meeting_url: body.meeting_url,
      event_type: body.event_type,
      status: needsAttention ? 'needs_attention' : 'pending_sync',
      participants: body.participants,
      _offlinePendingCreate: true,
      _offlinePendingLocalId: p.localId,
      _needsAttention: needsAttention,
    });
  }
  return rows;
}

export async function flushPendingCalendarCreates(userId: number): Promise<FlushResult> {
  const run = flushTail.then(async (): Promise<FlushResult> => {
    const list = await readAll();
    const mine = list
      .filter((p) => p.userId === userId)
      .filter((p) => p.status === 'queued' || p.status === 'failed_transient')
      .sort((a, b) => a.queuedAt - b.queuedAt);

    let synced = 0;
    let failed = 0;
    let permanent = 0;

    for (const p of mine) {
      if (p.attemptCount >= MAX_FLUSH_ATTEMPTS) {
        const next = (await readAll()).map((x) =>
          x.localId === p.localId
            ? { ...x, status: 'failed_permanent' as const, lastError: x.lastError || 'Max retries exceeded' }
            : x
        );
        await writeAll(next);
        permanent++;
        continue;
      }

      const now = Date.now();
      if (p.lastAttemptAt && p.status === 'failed_transient') {
        const backoff = Math.min(60000, BASE_BACKOFF_MS * Math.pow(2, Math.min(p.attemptCount, 5)));
        if (now - p.lastAttemptAt < backoff) continue;
      }

      let nextList = await readAll();
      const idx = nextList.findIndex((x) => x.localId === p.localId);
      if (idx < 0) continue;

      nextList[idx] = { ...nextList[idx], status: 'syncing', lastAttemptAt: now };
      await writeAll(nextList);

      try {
        await calendarCreateEvent(nextList[idx].body);
        const after = (await readAll()).filter((x) => x.localId !== p.localId);
        await writeAll(after);
        synced++;
      } catch (e: unknown) {
        const kind = classifyCalendarFlushError(e);
        const msg =
          (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ||
          (e as Error)?.message ||
          'Sync failed';
        nextList = await readAll();
        const i = nextList.findIndex((x) => x.localId === p.localId);
        if (i < 0) continue;
        const prev = nextList[i];
        const attemptCount = prev.attemptCount + 1;
        if (kind === 'permanent' || attemptCount >= MAX_FLUSH_ATTEMPTS) {
          nextList[i] = {
            ...prev,
            status: 'failed_permanent',
            attemptCount,
            lastError: String(msg),
            lastAttemptAt: Date.now(),
          };
          permanent++;
        } else {
          nextList[i] = {
            ...prev,
            status: 'failed_transient',
            attemptCount,
            lastError: String(msg),
            lastAttemptAt: Date.now(),
          };
          failed++;
        }
        await writeAll(nextList);
        if (isCalendarFetchOfflineError(e)) break;
        if (kind === 'permanent') break;
      }
    }

    return { synced, failed, permanent };
  });
  flushTail = run.catch(() => {});
  return run as Promise<FlushResult>;
}
