/**
 * Runs after HMS Room Kit completes prejoin Join: notifies parent once the local user is actually
 * in the room, then the app POSTs `/api/v1/video/room/join-by-id/confirm` for GrabDocs presence.
 *
 * Web detects "connected" via `useHMSStore(selectIsConnectedToRoom)`. The native package
 * (`@100mslive/react-native-hms`) does NOT export `useHMSSelectors`, so the RN equivalent is the
 * native `ON_JOIN` / `RECONNECTED` event. We listen for those directly (the SDK emits them globally
 * via its NativeEventEmitter), with peer updates and a short timeout as fallbacks.
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { NativeEventEmitter, Platform } from 'react-native';

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

/** Uses HMS native join events to detect room entry (no-op stubs if package missing). */
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

  // Primary signal: native ON_JOIN / RECONNECTED events (RN equivalent of selectIsConnectedToRoom).
  // We attach a passive NativeEventEmitter listener so we don't toggle the SDK's event enablement;
  // Room Kit already enables these events, and all JS listeners receive them.
  //
  // We also watch RECONNECTING as a "join is struggling" signal: it only fires after an actual
  // connection attempt (never while the user simply sits on the prejoin screen). If we never reach
  // the room within STUCK_CONNECT_TIMEOUT_MS of the SDK starting to (re)connect, we report the join
  // as stuck so the caller can show an error instead of an endless spinner.
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    const nativeModule = hmsPkg?.HMSManagerModule as object | undefined;
    if (!nativeModule) return;

    let emitter: NativeEventEmitter;
    try {
      emitter = new NativeEventEmitter(nativeModule as never);
    } catch {
      return;
    }

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
      ['ON_JOIN', enteredHandler],
      ['RECONNECTED', enteredHandler],
      ['RECONNECTING', reconnectingHandler],
    ].map(([evt, handler]) => {
      try {
        return emitter.addListener(evt as string, handler as () => void);
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
    (data: { type?: string; peer?: { peerID?: string; isLocal?: boolean } }) => {
      if (!enabled || doneRef.current) return;
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
