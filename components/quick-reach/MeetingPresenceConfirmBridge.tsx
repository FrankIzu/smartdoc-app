/**
 * Runs after HMS Room Kit completes prejoin Join: notifies parent once the local user is actually
 * in the room, then the app POSTs `/api/v1/video/room/join-by-id/confirm` for GrabDocs presence.
 *
 * Web detects "connected" via `useHMSStore(selectIsConnectedToRoom)`. The native package
 * (`@100mslive/react-native-hms`) does NOT export that selector, so the RN equivalent is the native
 * `ON_JOIN` / `RECONNECTED` event.
 *
 * CRITICAL: We must NOT attach our own `new NativeEventEmitter(HMSManagerModule)`. Doing so creates a
 * second emitter over the shared native module; its add/remove churn drives the module's listener
 * ref-count to zero and silently stops the SDK from forwarding events to JS — including the `ON_JOIN`
 * that Room Kit's prebuilt relies on to leave the "Join" spinner. (This was the v1.0.53 regression:
 * the native peer joined the 100ms room — `peer.join.success` server-side — but the RN prebuilt hung
 * on prejoin and `/join-by-id/confirm` was never sent.)
 *
 * Instead we reuse the SDK's own managed event channel: the singleton `HMSNativeEventListener` (the
 * exact instance `useHMSPeerUpdates` and Room Kit use) keyed by `DEFAULT_SDK_ID`. Room Kit registers
 * its own `ON_JOIN` listener on that same singleton, so its listener count never reaches zero on our
 * account and our subscribe/unsubscribe can never disable its event delivery.
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';

let hmsPkgCache: Record<string, unknown> | null | undefined;

function getHmsPkg(): Record<string, unknown> | null {
  if (hmsPkgCache !== undefined) return hmsPkgCache;
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    hmsPkgCache = require('@100mslive/react-native-hms') as Record<string, unknown>;
    /* eslint-enable @typescript-eslint/no-require-imports */
  } catch {
    hmsPkgCache = null;
  }
  return hmsPkgCache;
}

/** Minimal shape of the SDK's managed native-event singleton (HMSNativeEventEmitter). */
type ManagedNativeListener = {
  addListener: (
    id: string,
    eventType: string,
    listener: (...args: unknown[]) => void
  ) => { remove: () => void };
};

let nativeListenerCache: ManagedNativeListener | null | undefined;

/**
 * Returns the SDK's shared `HMSNativeEventListener` singleton. We deep-import the `src/` entry on
 * purpose: Metro resolves `@100mslive/react-native-hms` via its `react-native` field (`src/index`)
 * with package exports disabled, so this is the SAME module instance Room Kit loads — guaranteeing we
 * share its listener bookkeeping rather than spawning a competing emitter. Native-only; never touched
 * on web (the require is runtime-guarded so Metro never evaluates the native module in the web bundle).
 */
function getNativeEventListener(): ManagedNativeListener | null {
  if (nativeListenerCache !== undefined) return nativeListenerCache;
  if (Platform.OS === 'web') {
    nativeListenerCache = null;
    return null;
  }
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const mod = require('@100mslive/react-native-hms/src/classes/HMSNativeEventListener');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const singleton = (mod && (mod.default ?? mod)) as ManagedNativeListener | null;
    nativeListenerCache =
      singleton && typeof singleton.addListener === 'function' ? singleton : null;
  } catch {
    nativeListenerCache = null;
  }
  return nativeListenerCache;
}

/** HMSConstants.DEFAULT_SDK_ID — the single shared native SDK instance id Room Kit uses. */
const DEFAULT_SDK_ID = '12345';

type Props = {
  enabled: boolean;
  onEnteredRoom: () => void;
  /**
   * Called when a join/connection attempt is detected (the SDK starts (re)connecting) but never
   * completes within {@link STUCK_CONNECT_TIMEOUT_MS}. Lets the caller surface a "couldn't connect"
   * error instead of leaving the HMS prebuilt "Join" spinner hanging forever.
   */
  onConnectionStuck?: () => void;
};

/** How long after the SDK starts struggling to (re)connect before we treat the join as failed. */
const STUCK_CONNECT_TIMEOUT_MS = 30000;

/** Uses the SDK's managed HMS event channel to detect room entry (no-op if package missing). */
function InnerPresenceBridge({ enabled, onEnteredRoom, onConnectionStuck }: Props) {
  const doneRef = useRef(false);
  const firedRef = useRef(false);
  const stuckFiredRef = useRef(false);
  const onConnectionStuckRef = useRef<(() => void) | undefined>(undefined);
  onConnectionStuckRef.current = onConnectionStuck;
  const hmsPkg = useMemo(() => getHmsPkg(), []);

  const fireOnce = useCallback(() => {
    if (doneRef.current || firedRef.current) return;
    firedRef.current = true;
    queueMicrotask(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      onEnteredRoom();
    });
  }, [onEnteredRoom]);

  // Reset guards whenever the bridge is (re)enabled for a fresh join attempt.
  useEffect(() => {
    if (!enabled) return;
    doneRef.current = false;
    firedRef.current = false;
    stuckFiredRef.current = false;
  }, [enabled]);

  // Primary signal: native ON_JOIN / RECONNECTED events (RN equivalent of selectIsConnectedToRoom),
  // received through the SDK's managed listener singleton (NOT a raw NativeEventEmitter — see header).
  //
  // We also watch RECONNECTING as a "join is struggling" signal: it only fires after an actual
  // connection attempt (never while the user simply sits on the prejoin screen). If we never reach
  // the room within STUCK_CONNECT_TIMEOUT_MS of the SDK starting to (re)connect, we report the join
  // as stuck so the caller can show an error instead of an endless spinner.
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    const listener = getNativeEventListener();
    if (!listener) return;

    const actions = hmsPkg?.HMSUpdateListenerActions as Record<string, string> | undefined;
    const ON_JOIN = actions?.ON_JOIN ?? 'ON_JOIN';
    const RECONNECTED = actions?.RECONNECTED ?? 'RECONNECTED';
    const RECONNECTING = actions?.RECONNECTING ?? 'RECONNECTING';

    let stuckTimer: ReturnType<typeof setTimeout> | null = null;
    const clearStuckTimer = () => {
      if (stuckTimer) {
        clearTimeout(stuckTimer);
        stuckTimer = null;
      }
    };

    const enteredHandler = () => {
      clearStuckTimer();
      if (!enabled || doneRef.current) return;
      fireOnce();
    };

    const reconnectingHandler = () => {
      // Already in the room (mid-call blip) or we already reported stuck — ignore.
      if (doneRef.current || stuckFiredRef.current || stuckTimer) return;
      stuckTimer = setTimeout(() => {
        stuckTimer = null;
        if (doneRef.current || stuckFiredRef.current) return;
        stuckFiredRef.current = true;
        onConnectionStuckRef.current?.();
      }, STUCK_CONNECT_TIMEOUT_MS);
    };

    const subs = [
      [ON_JOIN, enteredHandler],
      [RECONNECTED, enteredHandler],
      [RECONNECTING, reconnectingHandler],
    ].map(([evt, handler]) => {
      try {
        return listener.addListener(DEFAULT_SDK_ID, evt as string, handler as () => void);
      } catch {
        return null;
      }
    });

    return () => {
      clearStuckTimer();
      subs.forEach((s) => {
        try {
          s?.remove();
        } catch {
          /* ignore */
        }
      });
    };
  }, [enabled, hmsPkg, fireOnce]);

  // Secondary signal: any peer update is only delivered once we are connected to the room.
  // Covers builds/cases where ON_JOIN is missed but other peers are present.
  const useHMSPeerUpdates = (
    typeof hmsPkg?.useHMSPeerUpdates === 'function'
      ? (hmsPkg.useHMSPeerUpdates as (handler: (...args: unknown[]) => void, deps: unknown[]) => void)
      : (_h: (...args: unknown[]) => void, _d: unknown[]) => {}
  );

  useHMSPeerUpdates(
    (...args: unknown[]) => {
      if (!enabled || doneRef.current) return;
      const data = args[0] as { type?: string; peer?: { peerID?: string; isLocal?: boolean } } | undefined;
      // Any peer update (local or remote) is only delivered once connected to the room.
      const hasUpdate = !!data?.peer || !!data?.type;
      if (hasUpdate) {
        fireOnce();
      }
    },
    [enabled, fireOnce],
  );

  // NOTE: We intentionally do NOT confirm presence on a blind timer. Doing so created a phantom
  // ActiveParticipant ("1 person in the meeting") even when the HMS join never actually completed.
  // Presence is now confirmed only on a genuine room-connection signal (ON_JOIN / RECONNECTED /
  // peer update); a stuck attempt is reported via onConnectionStuck instead.

  return null;
}

export function MeetingPresenceConfirmBridge(props: Props) {
  if (Platform.OS === 'web' || !props.enabled) return null;
  return (
    <InnerPresenceBridge
      enabled={props.enabled}
      onEnteredRoom={props.onEnteredRoom}
      onConnectionStuck={props.onConnectionStuck}
    />
  );
}
