import type { Href } from 'expo-router';
import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/Config';
import { apiClient } from '../services/api';

/**
 * Mobile-only sentinel for the main dashboard (`/(tabs)`). Stored locally when the user picks "Home"; not sent on PUT.
 *
 * Web `/upload` is the ChatGD composer screen; Expo has no `/upload` pathname — navigate to chats with `openStartNew`
 * so users land on the ask-a-question composer, not only the history list.
 */
export const MOBILE_MAIN_HOME_WEB_ALIAS = '/';

/**
 * Persisted when the user chooses "No default screen" so we can show that in Settings even though
 * the server stores NULL (same as an old unset row). Not a web path — do not send to the API.
 */
export const MOBILE_NO_DEFAULT_SCREEN_STORAGE = '__grabdocs_no_default_screen__' as const;

const ALLOWED_WEB_PATHS = [
  MOBILE_MAIN_HOME_WEB_ALIAS,
  '/upload',
  '/files',
  '/calendar',
  '/quick-links',
  '/forms',
  '/video-meeting',
  '/drafts',
  '/chat',
  '/workspaces',
  '/analysis',
  '/signatures',
] as const;

export type WebDefaultHomePath = (typeof ALLOWED_WEB_PATHS)[number];

export type PersistedDefaultHomePreference = WebDefaultHomePath | typeof MOBILE_NO_DEFAULT_SCREEN_STORAGE;

/** Mobile settings + API: explicit database null — open main dashboard only after sign-in (same navigation as Home). */
export const NO_DEFAULT_SCREEN_LABEL = 'None';

export type ParsedDefaultHomeFromApi =
  | { kind: 'absent' }
  | { kind: 'none' }
  | { kind: 'path'; path: WebDefaultHomePath };

/** Interpret `defaultHomePath` / `default_home_path` on an API payload (auth-check, user, etc.). */
export function parseDefaultHomeFields(payload: Record<string, unknown>): ParsedDefaultHomeFromApi {
  const hasKey = 'defaultHomePath' in payload || 'default_home_path' in payload;
  if (!hasKey) return { kind: 'absent' };
  const raw = payload.defaultHomePath ?? payload.default_home_path;
  if (raw === null || raw === undefined) return { kind: 'none' };
  if (typeof raw === 'string' && !raw.trim()) return { kind: 'none' };
  if (typeof raw === 'string') return { kind: 'path', path: normalizeWebDefaultHomePath(raw) };
  return { kind: 'none' };
}

/**
 * Settings picker paths that exist as Android/iOS destinations.
 * ChatGD aligns with web `/upload` while opening the Chats (ChatGD) tab on mobile.
 */
export const DEFAULT_HOME_SCREEN_OPTIONS: ReadonlyArray<{ webPath: WebDefaultHomePath; label: string }> = [
  { webPath: MOBILE_MAIN_HOME_WEB_ALIAS, label: 'Home' },
  { webPath: '/upload', label: 'ChatGD' },
  { webPath: '/files', label: 'Files + AI' },
  { webPath: '/calendar', label: 'Calendar' },
  { webPath: '/quick-links', label: 'File Request' },
  { webPath: '/forms', label: 'Forms' },
  { webPath: '/video-meeting', label: 'Reach' },
  { webPath: '/drafts', label: 'Notes' },
  { webPath: '/workspaces', label: 'Workspace' },
  { webPath: '/analysis', label: 'Financials' },
  { webPath: '/signatures', label: 'Signatures' },
];

/** Web slug → Expo route (there is no `app/upload` stack screen; `/upload` = ChatGD → chats tab + composer). */
const WEB_TO_EXPO_HREF: Record<WebDefaultHomePath, Href> = {
  '/': '/(tabs)',
  '/upload': '/(tabs)/chats?openStartNew=1',
  '/files': '/(tabs)/documents',
  '/calendar': '/calendar',
  '/quick-links': '/upload-links',
  '/forms': '/forms' as Href,
  '/video-meeting': '/quick-reach' as Href,
  '/drafts': '/drafts',
  '/chat': '/(tabs)/chats?openStartNew=1',
  '/workspaces': '/workspaces',
  '/analysis': '/analytics/dashboard',
  '/signatures': '/signatures' as Href,
};

/** Map web-only default-home segments to routes the mobile app supports. */
function coerceWebOnlyPaths(withSlash: string): string {
  if (withSlash === '/signatures' || withSlash.startsWith('/signatures/')) {
    return '/signatures';
  }
  if (withSlash === '/trend-insights' || withSlash.startsWith('/trend-insights')) {
    return '/analysis';
  }
  return withSlash;
}

export function normalizeWebDefaultHomePath(path: unknown): WebDefaultHomePath {
  if (typeof path !== 'string') return MOBILE_MAIN_HOME_WEB_ALIAS;
  const trimmed = path.trim();
  if (!trimmed) return MOBILE_MAIN_HOME_WEB_ALIAS;
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const mapped = coerceWebOnlyPaths(withSlash);
  if ((ALLOWED_WEB_PATHS as readonly string[]).includes(mapped)) {
    return mapped as WebDefaultHomePath;
  }
  return MOBILE_MAIN_HOME_WEB_ALIAS;
}

export function expoHrefForWebDefaultHome(webPath: string): Href {
  const key = normalizeWebDefaultHomePath(webPath);
  return WEB_TO_EXPO_HREF[key];
}

/** True when the resolved preference is the main dashboard only (`/(tabs)`). */
export function isMobileMainHomePath(webPath: string): boolean {
  return normalizeWebDefaultHomePath(webPath) === MOBILE_MAIN_HOME_WEB_ALIAS;
}

/**
 * From login/profile user object: `undefined` = field absent (fall back to auth-check/cache),
 * `null` = DB NULL / no path (reconcile stale paths; land on main home), path = stored preference string.
 */
export function extractDefaultHomePathFromUser(user: unknown): WebDefaultHomePath | null | undefined {
  if (!user || typeof user !== 'object') return undefined;
  const p = parseDefaultHomeFields(user as Record<string, unknown>);
  if (p.kind === 'absent') return undefined;
  if (p.kind === 'none') return null;
  return p.path;
}

/**
 * Read default-home hints from GET /api/v1/mobile/auth-check (preferred on native) or legacy web auth-check payloads.
 */
export function extractDefaultHomeFromAuthPayload(raw: unknown): ParsedDefaultHomeFromApi | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const data = o.data;
  if (data && typeof data === 'object') {
    const fromData = parseDefaultHomeFields(data as Record<string, unknown>);
    if (fromData.kind !== 'absent') return fromData;
  }
  return parseDefaultHomeFields(o);
}

async function applyParsedDefaultHome(p: ParsedDefaultHomeFromApi | null): Promise<WebDefaultHomePath | null> {
  if (!p || p.kind === 'absent') return null;
  if (p.kind === 'none') {
    await reconcilePersistenceWithServerNoDefault();
    return null;
  }
  await persistDefaultHomeWebPath(p.path);
  return p.path;
}

export async function clearPersistedDefaultHomeWebPath(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.DEFAULT_HOME_WEB_PATH);
}

export async function persistExplicitNoDefaultScreenPreference(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.DEFAULT_HOME_WEB_PATH, MOBILE_NO_DEFAULT_SCREEN_STORAGE);
}

export async function persistDefaultHomeWebPath(webPath: string): Promise<void> {
  const n = normalizeWebDefaultHomePath(webPath);
  await AsyncStorage.setItem(STORAGE_KEYS.DEFAULT_HOME_WEB_PATH, n);
}

export async function loadPersistedDefaultHomeWebPath(): Promise<PersistedDefaultHomePreference | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.DEFAULT_HOME_WEB_PATH);
  if (!raw?.trim()) return null;
  if (raw === MOBILE_NO_DEFAULT_SCREEN_STORAGE) return MOBILE_NO_DEFAULT_SCREEN_STORAGE;
  return normalizeWebDefaultHomePath(raw);
}

/**
 * Server default home is NULL: clear a stored path from a previous session, but keep mobile-only "Home"
 * (`/`, no PUT) or the explicit no-default sentinel.
 */
export async function reconcilePersistenceWithServerNoDefault(): Promise<void> {
  const cached = await loadPersistedDefaultHomeWebPath();
  if (cached === MOBILE_MAIN_HOME_WEB_ALIAS || cached === MOBILE_NO_DEFAULT_SCREEN_STORAGE) return;
  await clearPersistedDefaultHomeWebPath();
}

export async function refreshDefaultHomePathFromWebAuthCheck(): Promise<WebDefaultHomePath | null> {
  try {
    const raw = await apiClient.checkAuth();
    return await applyParsedDefaultHome(extractDefaultHomeFromAuthPayload(raw));
  } catch {
    // unauthenticated / network — ignore
  }
  return null;
}

/** Refresh from server using mobile auth-check (Bearer-aware). Avoids /api/v1/web/user which can 401 without a web session and trigger a global logout. */
export async function refreshDefaultHomePathFromWebUser(): Promise<WebDefaultHomePath | null> {
  try {
    const raw = await apiClient.checkAuth();
    return await applyParsedDefaultHome(extractDefaultHomeFromAuthPayload(raw));
  } catch {
    // ignore
  }
  return null;
}

/**
 * Resolve preference: login/user → web auth-check → persisted AsyncStorage → main Home (`/`).
 */
export async function resolveDefaultHomeWebPath(loginUser?: unknown): Promise<WebDefaultHomePath> {
  const fromLogin = loginUser ? extractDefaultHomePathFromUser(loginUser) : undefined;
  if (fromLogin !== undefined) {
    if (fromLogin === null) {
      await reconcilePersistenceWithServerNoDefault();
      return MOBILE_MAIN_HOME_WEB_ALIAS;
    }
    await persistDefaultHomeWebPath(fromLogin);
    return fromLogin;
  }

  try {
    const raw = await apiClient.checkAuth();
    const p = extractDefaultHomeFromAuthPayload(raw);
    if (p?.kind === 'none') {
      await reconcilePersistenceWithServerNoDefault();
      return MOBILE_MAIN_HOME_WEB_ALIAS;
    }
    if (p?.kind === 'path') {
      await persistDefaultHomeWebPath(p.path);
      return p.path;
    }
  } catch {
    // fall through to cache
  }

  const cached = await loadPersistedDefaultHomeWebPath();
  if (cached === MOBILE_NO_DEFAULT_SCREEN_STORAGE) return MOBILE_MAIN_HOME_WEB_ALIAS;
  if (cached) return cached;

  return MOBILE_MAIN_HOME_WEB_ALIAS;
}

/** Minimal router surface used after login (avoids tight coupling to expo-router types). */
export type PostLoginRouter = {
  replace: (href: Href) => void;
  push: (href: Href) => void;
  dismissAll?: () => void;
  canDismiss?: () => boolean;
  dismissTo?: (href: Href) => void;
};

/**
 * Pop nested auth screens (e.g. sign-in → OTP) before leaving the auth stack.
 *
 * `dismissAll()` removes every stacked screen in a single call, so it must NOT be
 * looped: `router.canDismiss()` reflects navigation state that only updates on the
 * next render, so a `while (canDismiss()) dismissAll()` loop never observes the
 * dismissal within the same tick and spins forever — freezing the JS thread and
 * stranding the user on the OTP screen even though sign-in already succeeded.
 */
function clearAuthStackBeforeMainApp(router: PostLoginRouter): void {
  try {
    if (router.canDismiss?.()) {
      router.dismissAll?.();
    }
  } catch {
    // dismissAll throws if there is nothing to dismiss — safe to ignore.
  }
}

/** Replace must commit before a follow-up push; push was racing and left login under the stack. */
function afterRootNavigationSettles(fn: () => void): void {
  queueMicrotask(() => {
    requestAnimationFrame(() => {
      InteractionManager.runAfterInteractions(fn);
    });
  });
}

function landOnMainTabs(router: PostLoginRouter): void {
  if (router.dismissTo) {
    try {
      router.dismissTo('/(tabs)');
      return;
    } catch {
      // dismissTo throws when (tabs) is not in the current navigation history
      // (e.g. navigating from the (auth) stack). Fall through to replace.
    }
  }
  router.replace('/(tabs)');
}

/** Cold start: user lands here then immediately routes into the shell — never rely on Redirect to a tab leaf. */
export async function bootstrapAuthenticatedNavigation(router: PostLoginRouter): Promise<void> {
  try {
    const webPath = await resolveDefaultHomeWebPath();
    navigateTabsThenDefaultHome(router, webPath);
  } catch {
    clearAuthStackBeforeMainApp(router);
    landOnMainTabs(router);
  }
}

/**
 * Land on tabs home first so the stack can pop back to the main dashboard; then optionally push the chosen tab/screen.
 * Clears the auth stack first so back from the default-home screen never returns to sign-in.
 */
export function navigateTabsThenDefaultHome(router: PostLoginRouter, webPath: string): void {
  const normalized = normalizeWebDefaultHomePath(webPath);
  clearAuthStackBeforeMainApp(router);

  if (isMobileMainHomePath(normalized)) {
    landOnMainTabs(router);
    return;
  }

  const href = expoHrefForWebDefaultHome(normalized);
  landOnMainTabs(router);
  afterRootNavigationSettles(() => {
    router.push(href);
  });
}
