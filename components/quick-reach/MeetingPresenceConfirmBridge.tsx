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
};

/** Uses HMS native join events to detect room entry (no-op stubs if package missing). */
function InnerPresenceBridge({ enabled, onEnteredRoom }: Props) {
  const doneRef = useRef(false);
  const firedRef = useRef(false);
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
  }, [enabled]);

  // Primary signal: native ON_JOIN / RECONNECTED events (RN equivalent of selectIsConnectedToRoom).
  // We attach a passive NativeEventEmitter listener so we don't toggle the SDK's event enablement;
  // Room Kit already enables these events, and all JS listeners receive them.
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

    const subs = ['ON_JOIN', 'RECONNECTED'].map((evt) => {
      try {
        return emitter.addListener(evt, () => {
          if (!enabled || doneRef.current) return;
          fireOnce();
        });
      } catch {
        return null;
      }
    });

    return () => {
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

  // Final safety net if no recognizable native event arrives on some builds.
  useEffect(() => {
    if (!enabled) return;
    const fallback = setTimeout(() => fireOnce(), 25000);
    return () => clearTimeout(fallback);
  }, [enabled, fireOnce]);

  return null;
}

export function MeetingPresenceConfirmBridge(props: Props) {
  if (Platform.OS === 'web' || !props.enabled) return null;
  return <InnerPresenceBridge enabled={props.enabled} onEnteredRoom={props.onEnteredRoom} />;
}
