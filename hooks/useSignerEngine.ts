import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../app/context/auth';
import {
  EnvelopeApiError,
  getSignSession,
  getSignView,
  isPhoneVerificationRequiredError,
  makeIdempotencyKey,
  sessionAutosave,
  sessionDecline,
  sessionSubmit,
  tokenAutosave,
  tokenDecline,
  tokenSubmit,
} from '../services/envelopeApi';
import {
  createManifest,
  finalizeManifest,
  isManifestComplete,
  manifestMatchesFillableDocs,
  stripDataUrlPrefix,
  writeCompositePage,
} from '../services/compositingEngine';
import { gcSessionFiles } from '../services/signatureFileGC';
import {
  clearSessionCache,
  loadSessionCache,
  saveSessionCache,
  writeSignatureImage,
  type SessionCacheData,
} from '../services/signatureSessionCache';
import type {
  CompositingManifest,
  NormalizedSignerSession,
  PendingSubmission,
  SessionState,
} from '../types/signature';
import { isFieldEditable, normalizeSignerPayload, shapeSignerValuesForApi } from '../utils/signatureRuntime';
import { errorLogger } from '../services/errorLogger';

const AUTOSAVE_DEBOUNCE_MS = 800;

export interface UseSignerEngineOptions {
  envelopeId?: string;
  token?: string;
  sessionKey: string;
  onCompleted?: () => void;
  onDeclined?: () => void;
  /** Legacy per-page capture from visible PdfFieldRenderer. */
  compositePage?: (docKey: string, pageIndex: number) => Promise<string | null>;
  /** Preferred: capture all pages for a fillable doc off-screen (FillCaptureHost). */
  compositeDocument?: (docKey: string) => Promise<string[] | null>;
}

function mergeFieldValuesIfAllowed(
  local: Record<string, unknown>,
  session: NormalizedSignerSession,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(local)) {
    if (!isFieldEditable(session.editableFieldKeys, key)) continue;
    const stillExists = session.documents.some((d) => d.fields.some((f) => f.key === key));
    if (!stillExists) continue;
    merged[key] = value;
  }
  return merged;
}

async function normalizeFieldValueForCache(
  sessionKey: string,
  key: string,
  value: unknown,
): Promise<unknown> {
  if (!value || typeof value !== 'object') return value;
  const o = value as Record<string, unknown>;
  const img = o.image;
  if (typeof img === 'string' && img.startsWith('data:')) {
    const base64 = img.replace(/^data:image\/\w+;base64,/, '');
    const uri = await writeSignatureImage(sessionKey, key, base64);
    return { image: img, imageUri: uri };
  }
  if (typeof o.imageUri === 'string') return value;
  return value;
}

export function useSignerEngine(opts: UseSignerEngineOptions) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<SessionState>('initializing');
  const [session, setSession] = useState<NormalizedSignerSession | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission | null>(null);

  const autosaveSeqRef = useRef(0);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightAutosaveRef = useRef<AbortController | null>(null);
  const pendingDeltaRef = useRef<Record<string, unknown>>({});
  const envelopeSessionIdRef = useRef(`sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const fieldValuesRef = useRef(fieldValues);
  const pendingSubmissionRef = useRef(pendingSubmission);
  const sessionRef = useRef(session);
  const optsRef = useRef(opts);
  const userIdRef = useRef(userId);
  const hydrateInFlightRef = useRef(false);
  fieldValuesRef.current = fieldValues;
  pendingSubmissionRef.current = pendingSubmission;
  sessionRef.current = session;
  optsRef.current = opts;
  userIdRef.current = userId;

  const isTokenMode = Boolean(opts.token);
  // Prefer real envelope/token ids only — never fall back to a placeholder sessionKey.
  const rawLoadId = opts.token ?? opts.envelopeId;
  const loadId = Array.isArray(rawLoadId) ? String(rawLoadId[0] ?? '') : String(rawLoadId ?? '');
  // Do NOT include userId — auth refreshes were recreating hydrate and re-fetching in a loop.
  const loadKey =
    loadId && loadId !== 'undefined' ? `${isTokenMode ? 'token' : 'session'}:${loadId}` : '';

  const persistCache = useCallback(async (patch: Partial<SessionCacheData>) => {
    const o = optsRef.current;
    const uid = userIdRef.current;
    const rev = sessionRef.current?.sessionGeneratedAtRevision ?? 1;
    const existing = (await loadSessionCache(uid, o.sessionKey)) ?? {
      sessionKey: o.sessionKey,
      fieldValues: {},
      updatedAt: new Date().toISOString(),
      sessionGeneratedAtRevision: rev,
      attachmentViewedKeys: [],
      completedFieldKeys: [],
      autosaveSeq: 0,
      envelopeId: o.envelopeId,
      tokenKey: o.token,
    };
    await saveSessionCache(uid, {
      ...existing,
      ...patch,
      fieldValues: patch.fieldValues ?? fieldValuesRef.current,
      sessionGeneratedAtRevision: patch.sessionGeneratedAtRevision ?? rev,
    });
  }, []);

  const persistPendingSubmission = useCallback(
    async (pending: PendingSubmission | null) => {
      setPendingSubmission(pending);
      pendingSubmissionRef.current = pending;
      await persistCache({ pendingSubmission: pending ?? undefined });
    },
    [persistCache],
  );

  const hydrate = useCallback(async () => {
    const o = optsRef.current;
    const uid = userIdRef.current;
    const tokenMode = Boolean(o.token);
    const id = String(o.envelopeId ?? o.token ?? o.sessionKey ?? '');
    if (!id || id === 'undefined') {
      setError('Missing envelope id or token');
      return;
    }
    if (hydrateInFlightRef.current) return;
    hydrateInFlightRef.current = true;

    // Never blank the phone OTP gate with a full-screen loader on re-hydrate.
    setState((prev) => (prev === 'initializing' && !sessionRef.current ? 'hydrating' : prev));
    setError(null);
    try {
      const cached = await loadSessionCache(uid, o.sessionKey);
      let payload;
      if (tokenMode && o.token) {
        payload = await getSignView(o.token);
      } else if (o.envelopeId) {
        payload = await getSignSession(o.envelopeId);
      } else {
        throw new Error('Missing envelope id or token');
      }
      const normalized = normalizeSignerPayload(id, payload);
      setSession(normalized);
      sessionRef.current = normalized;

      const serverValues: Record<string, unknown> = {};
      const recipientFields = payload.fields ?? payload.field_assignments ?? [];
      for (const a of recipientFields) {
        if (a.signed_value_json != null) {
          serverValues[a.field_key] = a.signed_value_json;
        } else if (a.draft_value_json != null) {
          serverValues[a.field_key] = a.draft_value_json;
        }
      }

      let merged = { ...serverValues };
      if (cached?.fieldValues) {
        merged = { ...merged, ...mergeFieldValuesIfAllowed(cached.fieldValues, normalized) };
      }
      setFieldValues(merged);
      fieldValuesRef.current = merged;

      let pending = cached?.pendingSubmission ?? null;
      if (pending?.manifest) {
        const fillableRows = normalized.documents
          .filter((d) => d.sourceType === 'fillable' && d.interactive && d.pages.length > 0)
          .map((d) => ({ documentKey: d.documentKey, totalPages: d.pages.length }));
        if (
          fillableRows.length > 0 &&
          !manifestMatchesFillableDocs(pending.manifest, fillableRows)
        ) {
          pending = null;
          await persistCache({ pendingSubmission: undefined });
        }
      }

      if (pending) {
        setState('checking_submission');
        setPendingSubmission(pending);
        pendingSubmissionRef.current = pending;
        const recipientSigned =
          payload.recipient?.status === 'signed' ||
          payload.recipient?.status === 'declined' ||
          payload.envelope?.status === 'completed';
        if (recipientSigned) {
          await clearSessionCache(uid, o.sessionKey);
          setPendingSubmission(null);
          setState('completed');
          optsRef.current.onCompleted?.();
          return;
        }
        setState('active');
      } else {
        setState('active');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load signing session';
      setError(msg);
      // Keep existing session (e.g. phone gate) mounted — do not bounce back to initializing.
      if (!sessionRef.current) {
        setState('initializing');
      } else {
        setState('active');
      }
    } finally {
      hydrateInFlightRef.current = false;
    }
  }, []);

  // Load once per envelope/token. Do not depend on hydrate identity.
  useEffect(() => {
    if (!loadKey) return;
    void hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: stable loadKey only
  }, [loadKey]);

  const flushAutosave = useCallback(async () => {
    if (!session) return;
    if (session.phoneVerificationRequired && !session.phoneVerified) return;
    const delta = { ...pendingDeltaRef.current };
    if (Object.keys(delta).length === 0) return;
    const seq = ++autosaveSeqRef.current;
    inFlightAutosaveRef.current?.abort();
    const controller = new AbortController();
    inFlightAutosaveRef.current = controller;
    setState((s) => (s === 'active' || s === 'offline_dirty' ? 'autosaving' : s));
    try {
      const o = optsRef.current;
      const shaped = await shapeSignerValuesForApi(session, delta);
      if (Object.keys(shaped).length === 0) return;
      if (isTokenMode && o.token) {
        await tokenAutosave(o.token, shaped, session.sessionGeneratedAtRevision, controller.signal);
      } else if (o.envelopeId) {
        await sessionAutosave(o.envelopeId, shaped, session.sessionGeneratedAtRevision, controller.signal);
      }
      if (controller.signal.aborted || seq < autosaveSeqRef.current) return;
      pendingDeltaRef.current = {};
      await persistCache({ fieldValues: fieldValuesRef.current, autosaveSeq: seq });
      setState((s) => (s === 'autosaving' ? 'active' : s));
    } catch (e: unknown) {
      if (controller.signal.aborted) return;
      pendingDeltaRef.current = { ...delta, ...pendingDeltaRef.current };
      if (e instanceof EnvelopeApiError && e.staleRevision) {
        setState('conflict_409');
        setError('This envelope was updated. Reload to continue.');
        errorLogger.logError(e, {
          errorType: 'signature_revision_conflict',
          metadata: { envelopeSessionId: envelopeSessionIdRef.current, autosaveSeq: seq },
        });
        return;
      }
      if (isPhoneVerificationRequiredError(e)) {
        setError('Phone verification required before continuing.');
        await hydrate();
        return;
      }
      setState('offline_dirty');
      errorLogger.logError(e instanceof Error ? e : new Error(String(e)), {
        errorType: 'signature_autosave_failed',
        metadata: { envelopeSessionId: envelopeSessionIdRef.current },
      });
    }
  }, [hydrate, isTokenMode, persistCache, session]);

  const scheduleAutosave = useCallback(
    (key: string, value: unknown) => {
      pendingDeltaRef.current[key] = value;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        void flushAutosave();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [flushAutosave],
  );

  const setFieldValue = useCallback(
    (key: string, value: unknown) => {
      if (session?.phoneVerificationRequired && !session.phoneVerified) return;
      void (async () => {
        const stored = await normalizeFieldValueForCache(optsRef.current.sessionKey, key, value);
        setFieldValues((prev) => {
          const next = { ...prev, [key]: stored };
          fieldValuesRef.current = next;
          return next;
        });
        await persistCache({ fieldValues: { ...fieldValuesRef.current, [key]: stored } });
        scheduleAutosave(key, stored);
      })();
    },
    [persistCache, scheduleAutosave, session?.phoneVerificationRequired, session?.phoneVerified],
  );

  const runCompositing = useCallback(
    async (manifest: CompositingManifest, idempotencyKey: string): Promise<CompositingManifest> => {
      const o = optsRef.current;
      let current = manifest;

      if (o.compositeDocument) {
        for (const doc of current.docs) {
          const captured = await o.compositeDocument(doc.documentKey);
          if (!captured || captured.length < doc.totalPages) {
            throw new Error(`Failed to prepare ${doc.documentKey}. Please try again.`);
          }
          for (let p = 0; p < doc.totalPages; p++) {
            const pageData = captured[p];
            if (!pageData) {
              throw new Error(`Failed to render page ${p + 1} of ${doc.documentKey}`);
            }
            current = await writeCompositePage(
              o.sessionKey,
              current,
              doc.documentKey,
              p,
              stripDataUrlPrefix(pageData),
            );
            await persistPendingSubmission({
              envelopeId: String(loadId),
              idempotencyKey,
              step: 'compositing',
              manifest: current,
              lastCompletedOp: { docKey: doc.documentKey, pageIndex: p },
              startedAt: pendingSubmissionRef.current?.startedAt ?? new Date().toISOString(),
            });
          }
        }
        return current;
      }

      if (!o.compositePage) return manifest;
      for (const doc of current.docs) {
        for (let p = doc.completedPages; p < doc.totalPages; p++) {
          const b64 = await o.compositePage(doc.documentKey, p);
          if (!b64) {
            throw new Error(`Failed to render page ${p + 1} of ${doc.documentKey}`);
          }
          current = await writeCompositePage(o.sessionKey, current, doc.documentKey, p, b64);
          await persistPendingSubmission({
            envelopeId: String(loadId),
            idempotencyKey,
            step: 'compositing',
            manifest: current,
            lastCompletedOp: { docKey: doc.documentKey, pageIndex: p },
            startedAt: pendingSubmissionRef.current?.startedAt ?? new Date().toISOString(),
          });
        }
      }
      return current;
    },
    [loadId, persistPendingSubmission],
  );

  const submit = useCallback(async () => {
    if (!session) return;
    if (session.phoneVerificationRequired && !session.phoneVerified) {
      setError('Phone verification required before continuing.');
      return;
    }
    const o = optsRef.current;
    setState('compositing');
    setError(null);
    const idempotencyKey =
      pendingSubmissionRef.current?.idempotencyKey ?? makeIdempotencyKey();
    const startedAt = pendingSubmissionRef.current?.startedAt ?? new Date().toISOString();
    try {
      await flushAutosave();

      const fillableDocRows = session.documents
        .filter((d) => d.sourceType === 'fillable' && d.interactive && d.pages.length > 0)
        .map((d) => ({ documentKey: d.documentKey, totalPages: d.pages.length }));

      let manifest = createManifest({
        sessionKey: o.sessionKey,
        envelopeId: String(loadId),
        idempotencyKey,
        docs: fillableDocRows,
      });

      const pendingManifest = pendingSubmissionRef.current?.manifest;
      if (pendingManifest && manifestMatchesFillableDocs(pendingManifest, fillableDocRows)) {
        manifest = pendingManifest;
      }

      await persistPendingSubmission({
        envelopeId: String(loadId),
        idempotencyKey,
        step: 'compositing',
        manifest,
        startedAt,
      });

      const canComposite = Boolean(o.compositeDocument || o.compositePage);
      if (!isManifestComplete(manifest) && canComposite && fillableDocRows.length > 0) {
        manifest = await runCompositing(manifest, idempotencyKey);
      }

      if (fillableDocRows.length > 0 && !isManifestComplete(manifest)) {
        throw new Error('Document preparation incomplete. Please try again.');
      }

      const doc_pages = await finalizeManifest(manifest);
      if (fillableDocRows.length > 0 && Object.keys(doc_pages).length === 0) {
        throw new Error('Could not prepare signed document pages. Please try again.');
      }
      await persistPendingSubmission({
        envelopeId: String(loadId),
        idempotencyKey,
        step: 'uploading',
        manifest,
        startedAt,
      });
      setState('uploading');
      const shapedValues = await shapeSignerValuesForApi(session, fieldValuesRef.current);
      const payload = {
        values: shapedValues,
        doc_pages,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        session_generated_at_revision: session.sessionGeneratedAtRevision,
      };
      setState('awaiting_server');
      if (isTokenMode && o.token) {
        await tokenSubmit(o.token, payload, idempotencyKey);
      } else if (o.envelopeId) {
        await sessionSubmit(o.envelopeId, payload, idempotencyKey);
      }
      await clearSessionCache(userIdRef.current, o.sessionKey);
      await gcSessionFiles(
        o.sessionKey,
        Object.keys(fieldValuesRef.current),
        manifest.docs.map((d) => d.documentKey),
      );
      setPendingSubmission(null);
      setState('completed');
      optsRef.current.onCompleted?.();
    } catch (e: unknown) {
      if (e instanceof EnvelopeApiError && e.staleRevision) {
        setState('conflict_409');
        setError('Session outdated. Please reload and try again.');
      } else if (isPhoneVerificationRequiredError(e)) {
        setState('active');
        setError('Phone verification required before continuing.');
        await hydrate();
      } else {
        setState('active');
        setError(e instanceof Error ? e.message : 'Submit failed');
      }
      errorLogger.logError(e instanceof Error ? e : new Error(String(e)), {
        errorType: 'signature_submit_retry',
        metadata: { envelopeSessionId: envelopeSessionIdRef.current },
      });
    }
  }, [
    flushAutosave,
    hydrate,
    isTokenMode,
    loadId,
    persistPendingSubmission,
    runCompositing,
    session,
  ]);

  const decline = useCallback(
    async (reason?: string) => {
      if (!session) return;
      if (session.phoneVerificationRequired && !session.phoneVerified) {
        setError('Phone verification required before continuing.');
        return;
      }
      const o = optsRef.current;
      const key = makeIdempotencyKey();
      try {
        if (isTokenMode && o.token) {
          await tokenDecline(o.token, reason, key);
        } else if (o.envelopeId) {
          await sessionDecline(o.envelopeId, reason, key);
        }
        await clearSessionCache(userIdRef.current, o.sessionKey);
        setPendingSubmission(null);
        setState('declined');
        optsRef.current.onDeclined?.();
      } catch (e: unknown) {
        if (isPhoneVerificationRequiredError(e)) {
          setError('Phone verification required before continuing.');
          await hydrate();
        } else {
          setError(e instanceof Error ? e.message : 'Decline failed');
        }
      }
    },
    [hydrate, isTokenMode, session],
  );

  const reloadAfterConflict = useCallback(async () => {
    pendingDeltaRef.current = {};
    await hydrate();
    setState('active');
  }, [hydrate]);

  const retryAutosave = useCallback(async () => {
    if (Object.keys(pendingDeltaRef.current).length > 0) {
      await flushAutosave();
    }
  }, [flushAutosave]);

  return {
    state,
    session,
    fieldValues,
    error,
    pendingSubmission,
    setFieldValue,
    submit,
    decline,
    reloadAfterConflict,
    hydrate,
    retryAutosave,
    flushAutosave,
    envelopeSessionId: envelopeSessionIdRef.current,
  };
}
