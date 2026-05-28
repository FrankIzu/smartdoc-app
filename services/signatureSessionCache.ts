import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { PendingSubmission, WizardStep } from '../types/signature';
import {
  signatureDraftStorageKey,
  signatureSessionStorageKey,
  userCacheScope,
} from './userScopedCache';

const SESSION_PREFIX = '@grabdocs_sig_session:';
const DRAFT_PREFIX = '@grabdocs_sig_draft:';
const MAX_SESSIONS = 15;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionCacheData {
  sessionKey: string;
  envelopeId?: string;
  tokenKey?: string;
  fieldValues: Record<string, unknown>;
  updatedAt: string;
  sessionGeneratedAtRevision: number;
  attachmentViewedKeys: string[];
  currentDocumentKey?: string;
  currentPage?: number;
  completedFieldKeys: string[];
  pendingSubmission?: PendingSubmission;
  autosaveSeq: number;
}

function sessionKey(userId: string | number | null | undefined, sessionKeyValue: string) {
  return signatureSessionStorageKey(userId, sessionKeyValue);
}

function draftKey(userId: string | number | null | undefined, envelopeId: string) {
  return signatureDraftStorageKey(userId, envelopeId);
}

export async function loadSessionCache(
  userId: string | number | null | undefined,
  sessionKeyValue: string,
): Promise<SessionCacheData | null> {
  const key = sessionKey(userId, sessionKeyValue);
  if (!key) return null;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as SessionCacheData;
  } catch {
    return null;
  }
}

export async function saveSessionCache(
  userId: string | number | null | undefined,
  data: SessionCacheData,
): Promise<void> {
  const key = sessionKey(userId, data.sessionKey);
  if (!key) return;
  await AsyncStorage.setItem(
    key,
    JSON.stringify({ ...data, updatedAt: new Date().toISOString() }),
  );
  await enforceSessionCap(userId);
}

export async function clearSessionCache(
  userId: string | number | null | undefined,
  sessionKeyValue: string,
): Promise<void> {
  const key = sessionKey(userId, sessionKeyValue);
  if (!key) return;
  await AsyncStorage.removeItem(key);
}

export async function loadDraftStep(
  userId: string | number | null | undefined,
  envelopeId: string,
): Promise<WizardStep | null> {
  const key = draftKey(userId, envelopeId);
  if (!key) return null;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lastCompletedStep?: WizardStep };
    return parsed.lastCompletedStep ?? null;
  } catch {
    return null;
  }
}

export async function saveDraftStep(
  userId: string | number | null | undefined,
  envelopeId: string,
  step: WizardStep,
): Promise<void> {
  const key = draftKey(userId, envelopeId);
  if (!key) return;
  await AsyncStorage.setItem(key, JSON.stringify({ lastCompletedStep: step }));
}

export async function clearDraftStep(
  userId: string | number | null | undefined,
  envelopeId: string,
): Promise<void> {
  const key = draftKey(userId, envelopeId);
  if (!key) return;
  await AsyncStorage.removeItem(key);
}

export function signatureImagePath(sessionKeyValue: string, fieldKey: string): string {
  const safe = fieldKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${FileSystem.cacheDirectory}sig_${sessionKeyValue}_${safe}.png`;
}

export function compositePagePath(
  sessionKeyValue: string,
  docKey: string,
  pageIndex: number,
): string {
  const safe = docKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${FileSystem.cacheDirectory}sig_comp_${sessionKeyValue}_${safe}_p${pageIndex}.jpg`;
}

async function enforceSessionCap(userId: string | number | null | undefined): Promise<void> {
  const scope = userCacheScope(userId);
  if (!scope) return;
  const prefix = `${SESSION_PREFIX}${scope}:`;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const sessionKeys = keys.filter((k) => k.startsWith(prefix));
    if (sessionKeys.length <= MAX_SESSIONS) return;
    const entries: Array<{ key: string; updatedAt: number }> = [];
    for (const key of sessionKeys) {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      try {
        const d = JSON.parse(raw) as SessionCacheData;
        entries.push({ key, updatedAt: new Date(d.updatedAt).getTime() || 0 });
      } catch {
        entries.push({ key, updatedAt: 0 });
      }
    }
    entries.sort((a, b) => a.updatedAt - b.updatedAt);
    const toRemove = entries.slice(0, entries.length - MAX_SESSIONS);
    for (const e of toRemove) {
      await AsyncStorage.removeItem(e.key);
    }
  } catch {
    // ignore
  }
}

export async function evictStaleSessions(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const now = Date.now();
    for (const key of keys) {
      if (!key.startsWith(SESSION_PREFIX)) continue;
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      try {
        const d = JSON.parse(raw) as SessionCacheData;
        if (now - new Date(d.updatedAt).getTime() > TTL_MS) {
          await AsyncStorage.removeItem(key);
        }
      } catch {
        await AsyncStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }
}

export async function readFileBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

export async function writeSignatureImage(
  sessionKeyValue: string,
  fieldKey: string,
  base64: string,
): Promise<string> {
  const path = signatureImagePath(sessionKeyValue, fieldKey);
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
  return path;
}
