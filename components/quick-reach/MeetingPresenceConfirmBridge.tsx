/**
 * Runs after HMS Room Kit completes prejoin Join: notifies parent once the local user is actually
 * in the room, then the app POSTs `/api/v1/video/room/join-by-id/confirm` for GrabDocs presence.
 *
 * Web detects "connected" via `useHMSStore(selectIsConnectedToRoom)`. The native package
 * (`@100mslive/react-native-hms`) does NOT export that selector on RN 1.12.
 *
 * CRITICAL — do NOT call HMSNativeEventListener.addListener with a hardcoded SDK id (e.g. '12345'):
 * Room Kit registers ON_PREVIEW / ON_JOIN on the dynamic id from HMSSDK.build(). The emitter's
 * listenerCount is global per event type, so the first subscriber wins enableEvent({ id }).
 * Subscribing with the wrong id prevents Room Kit from ever receiving ON_PREVIEW (black spinner)
 * or ON_JOIN (stuck Join button).
 *
 * CRITICAL — do NOT attach a raw `new NativeEventEmitter(HMSManagerModule)` either; that breaks
 * ref-counting and stops all SDK events (v1.0.53 regression).
 *
 * Safe path: `useHMSPeerUpdates` — the SDK's dedicated ON_PEER_UPDATE channel (DEFAULT_SDK_ID).
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

type Props = {
  enabled: boolean;
  onEnteredRoom: () => void;
  /**
   * Called when join never completes within {@link STUCK_JOIN_TIMEOUT_MS}. Surfaces an error
   * instead of leaving the HMS prebuilt spinner hanging forever.
   */
  onConnectionStuck?: () => void;
};

/** Max time from bridge enable until we treat the join as failed (no room-entry signal). */
const STUCK_JOIN_TIMEOUT_MS = 90000;

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

  useEffect(() => {
    if (!enabled) return;
    doneRef.current = false;
    firedRef.current = false;
    stuckFiredRef.current = false;
  }, [enabled]);

  // Absolute join timeout — no native RECONNECTING subscription (would race Room Kit event enable).
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;

    const stuckTimer = setTimeout(() => {
      if (doneRef.current || stuckFiredRef.current) return;
      stuckFiredRef.current = true;
      onConnectionStuckRef.current?.();
    }, STUCK_JOIN_TIMEOUT_MS);

    return () => clearTimeout(stuckTimer);
  }, [enabled]);

  const useHMSPeerUpdates = (
    typeof hmsPkg?.useHMSPeerUpdates === 'function'
      ? (hmsPkg.useHMSPeerUpdates as (handler: (...args: unknown[]) => void, deps: unknown[]) => void)
      : (_h: (...args: unknown[]) => void, _d: unknown[]) => {}
  );

  useHMSPeerUpdates(
    (...args: unknown[]) => {
      if (!enabled || doneRef.current) return;
      const data = args[0] as {
        type?: string;
        peer?: { peerID?: string; isLocal?: boolean };
      } | undefined;
      // Any peer update (local or remote) is only delivered once we are connected to the room —
      // never during the prejoin/preview phase. So the first one we see means the local user has
      // fully joined, which is what triggers POST /join-by-id/confirm. That confirm links the
      // meeting to the user (invited_participants) so it appears in their Reach list afterward.
      //
      // Do NOT narrow this to PEER_JOINED: that event is emitted for REMOTE peers, not the local
      // user's own join. A user who joins a meeting alone would never get PEER_JOINED, so confirm
      // would never fire and the meeting would be missing from their list (regression fix).
      const hasUpdate = !!data?.peer || !!data?.type;
      if (hasUpdate) {
        fireOnce();
      }
    },
    [enabled, fireOnce],
  );

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

