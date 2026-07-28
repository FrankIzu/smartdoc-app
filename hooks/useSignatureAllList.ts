import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../app/context/auth';
import { listFillSubmissions } from '../services/fillApi';
import { listFillableTemplates, type FillableTemplateListItem } from '../services/fillableApi';
import {
  invalidateSignatureActivityCache,
  isSignatureActivityStale,
  readSignatureActivityMemory,
  readSignatureActivityStorage,
  writeSignatureActivityMemory,
  type SignatureActivityCacheEntry,
} from '../services/signatureActivityCache';
import type { Envelope } from '../types/signature';
import { mergeSignatureActivity, type SignatureActivityItem } from '../utils/signatureActivity';

export { invalidateSignatureActivityCache };

function applyEntry(entry: SignatureActivityCacheEntry) {
  return {
    templates: entry.templates,
    submissions: entry.submissions,
  };
}

export function useSignatureAllList(enabled: boolean, envelopes: Envelope[]) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [templates, setTemplates] = useState<FillableTemplateListItem[]>([]);
  const [submissions, setSubmissions] = useState<Awaited<ReturnType<typeof listFillSubmissions>>>([]);
  // Start loading when the All tab is active so the hub never paints a partial list.
  const [loading, setLoading] = useState(enabled);
  const loadSeqRef = useRef(0);
  const userIdRef = useRef(userId);

  const commitEntry = useCallback(
    (nextTemplates: FillableTemplateListItem[], nextSubmissions: Awaited<ReturnType<typeof listFillSubmissions>>, ownerId: string | number) => {
      const entry: SignatureActivityCacheEntry = {
        templates: nextTemplates,
        submissions: nextSubmissions,
        fetchedAt: Date.now(),
      };
      writeSignatureActivityMemory(ownerId, entry);
      setTemplates(nextTemplates);
      setSubmissions(nextSubmissions);
    },
    [],
  );

  const fetchAll = useCallback(
    async (ownerId: string | number, seq: number) => {
      const [templateRows, submissionRows] = await Promise.all([
        listFillableTemplates(),
        listFillSubmissions(),
      ]);
      if (seq !== loadSeqRef.current || userIdRef.current !== ownerId) return;
      commitEntry(templateRows, submissionRows, ownerId);
    },
    [commitEntry],
  );

  const loadAll = useCallback(
    async (opts?: { force?: boolean; background?: boolean }) => {
      if (!enabled || !userId) return;
      const seq = ++loadSeqRef.current;
      const ownerId = userId;
      const hit = !opts?.force ? readSignatureActivityMemory(ownerId) : null;

      if (hit && !opts?.background) {
        const applied = applyEntry(hit);
        setTemplates(applied.templates);
        setSubmissions(applied.submissions);
        setLoading(false);
      } else if (!opts?.background && !hit) {
        setLoading(true);
      }

      try {
        await fetchAll(ownerId, seq);
      } catch {
        if (seq !== loadSeqRef.current || userIdRef.current !== ownerId) return;
        if (!hit) {
          commitEntry([], [], ownerId);
        }
      } finally {
        if (seq === loadSeqRef.current && userIdRef.current === ownerId) {
          setLoading(false);
        }
      }
    },
    [commitEntry, enabled, fetchAll, userId],
  );

  const revalidateIfStale = useCallback(async () => {
    if (!enabled || !userId) return;
    const hit = readSignatureActivityMemory(userId);
    if (hit && !isSignatureActivityStale(hit)) return;
    await loadAll({ background: Boolean(hit) });
  }, [enabled, loadAll, userId]);

  const refreshAll = useCallback(async () => {
    if (!enabled || !userId) return;
    invalidateSignatureActivityCache();
    await loadAll({ force: true, background: true });
  }, [enabled, loadAll, userId]);

  useEffect(() => {
    userIdRef.current = userId;
    loadSeqRef.current += 1;

    if (!enabled || !userId) {
      setTemplates([]);
      setSubmissions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    // Apply memory cache before clearing — avoids an empty paint while envelopes already show.
    const hit = readSignatureActivityMemory(userId);
    if (hit) {
      const applied = applyEntry(hit);
      setTemplates(applied.templates);
      setSubmissions(applied.submissions);
      setLoading(false);
      if (!isSignatureActivityStale(hit)) return;
      void loadAll({ background: true });
      return;
    }

    setTemplates([]);
    setSubmissions([]);
    setLoading(true);
    void (async () => {
      const stored = await readSignatureActivityStorage(userId);
      if (cancelled || userIdRef.current !== userId) return;
      if (stored) {
        const applied = applyEntry(stored);
        setTemplates(applied.templates);
        setSubmissions(applied.submissions);
        setLoading(false);
        writeSignatureActivityMemory(userId, stored);
      }
      await loadAll({ background: Boolean(stored) });
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, userId, loadAll]);

  const items = useMemo(
    () => (enabled ? mergeSignatureActivity(envelopes, templates, submissions) : []),
    [enabled, envelopes, templates, submissions],
  );

  return {
    items,
    loading: enabled && loading,
    revalidateIfStale,
    refreshAll,
    refreshTemplates: refreshAll,
  };
}

export type { SignatureActivityItem };
