/**
 * Runs after HMS Room Kit completes prejoin Join: notifies parent once the local user is in the room,
 * then the app POSTs `/api/v1/video/room/join-by-id/confirm` for GrabDocs presence.
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

/** Safe no-op hook when HMS SDK is unavailable (Expo Go, etc.). */
function useSelectorsNull<S>(_selector: (s: S) => unknown): unknown {
  return null;
}

type Props = {
  enabled: boolean;
  onEnteredRoom: () => void;
};

function pickLocalPeerId(state: Record<string, unknown>): string | null {
  try {
    const lp =
      (state?.localPeer as { peerID?: string } | undefined)?.peerID ??
      (((state?.peerState as Record<string, unknown>)?.localPeer as { peerID?: string })?.peerID ?? null);
    return lp ?? null;
  } catch {
    return null;
  }
}

/** Uses HMS hooks unconditionally (no-op stubs if package missing). */
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

  const useHMSSelectors = (
    typeof hmsPkg?.useHMSSelectors === 'function'
      ? (hmsPkg.useHMSSelectors as typeof useSelectorsNull)
      : useSelectorsNull
  ) as <S>(selector: (s: S) => unknown) => unknown;

  const useHMSPeerUpdates = (
    typeof hmsPkg?.useHMSPeerUpdates === 'function'
      ? (hmsPkg.useHMSPeerUpdates as (handler: (...args: unknown[]) => void, deps: unknown[]) => void)
      : (_h: (...args: unknown[]) => void, _d: unknown[]) => {}
  );

  const localPeerId =
    useHMSSelectors((s: Record<string, unknown>) => pickLocalPeerId(s ?? {})) ??
    null;

  const roomStateSelector = useMemo(
    () =>
      (typeof hmsPkg?.selectHMSRoomState === 'function'
        ? (hmsPkg.selectHMSRoomState as (s: unknown) => unknown)
        : typeof hmsPkg?.selectRoomState === 'function'
          ? (hmsPkg.selectRoomState as (s: unknown) => unknown)
          : (s: unknown) => {
              const st = (s ?? {}) as Record<string, unknown>;
              const r =
                (((st?.hmsSdk as Record<string, unknown>)?.room ?? st?.room) as Record<string, unknown>) ??
                {};
              return r?.rtcState ?? r?.roomState ?? r?.sessionState ?? st?.roomState ?? null;
            }) as (s: unknown) => unknown,
    [hmsPkg],
  );

  const roomStateStr = useHMSSelectors(roomStateSelector);

  useEffect(() => {
    if (!enabled || doneRef.current || !roomStateStr) return;
    const rstr = String(roomStateStr).toLowerCase();
    if (rstr.includes('connected') || rstr.includes('joined') || rstr.includes('meeting')) {
      fireOnce();
    }
  }, [enabled, roomStateStr, fireOnce]);

  useHMSPeerUpdates(
    (data: { type?: string; peer?: { peerID?: string; isLocal?: boolean } }) => {
      if (!enabled || doneRef.current) return;
      const t = String(data?.type ?? '');
      const pid = String(data?.peer?.peerID ?? '');
      const isJoined =
        t === 'PEER_JOINED' || t === 'HMSPeerJoined' || (t.includes('JOINED') && t.includes('PEER'));
      if (!isJoined) return;
      const lpId = typeof localPeerId === 'string' ? localPeerId : null;
      if (data?.peer?.isLocal || (lpId && pid && lpId === pid)) {
        fireOnce();
      }
    },
    [enabled, localPeerId, fireOnce],
  );

  useEffect(() => {
    if (!enabled) return;
    doneRef.current = false;
    firedRef.current = false;
  }, [enabled]);

  /** Last resort if HMS exposes no recognizable room state / events on some builds. */
  useEffect(() => {
    if (!enabled) return;
    const fallback = setTimeout(() => fireOnce(), 90000);
    return () => clearTimeout(fallback);
  }, [enabled, fireOnce]);

  return null;
}

export function MeetingPresenceConfirmBridge(props: Props) {
  if (Platform.OS === 'web' || !props.enabled) return null;
  return <InnerPresenceBridge enabled={props.enabled} onEnteredRoom={props.onEnteredRoom} />;
}
