/**
 * Passive HMS join instrumentation — logs every native event and peer update so we can
 * build a JS-side timeline and compare it to server webhooks (peer.join.success, etc.).
 *
 * Does NOT modify join behavior. Uses the SDK-managed HMSNativeEventListener singleton
 * (same channel as Room Kit) — read-only subscriptions.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import {
  logHmsEvent,
  logJoinMilestone,
  logJoinState,
  MEETING_JOIN_DIAGNOSTICS_ENABLED,
} from '../../utils/meetingJoinDiagnostics';

type ManagedNativeListener = {
  addListener: (
    id: string,
    eventType: string,
    listener: (...args: unknown[]) => void
  ) => { remove: () => void };
};

const DEFAULT_SDK_ID = '12345';

let nativeListenerCache: ManagedNativeListener | null | undefined;

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

function getHmsActions(): Record<string, string> {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const hmsPkg = require('@100mslive/react-native-hms') as Record<string, unknown>;
    /* eslint-enable @typescript-eslint/no-require-imports */
    return (hmsPkg?.HMSUpdateListenerActions as Record<string, string>) ?? {};
  } catch {
    return {};
  }
}

type Props = {
  enabled: boolean;
  meetingId?: string;
};

export function MeetingJoinDiagnostics({ enabled, meetingId }: Props) {
  const mountCountRef = useRef(0);
  const eventCountsRef = useRef<Record<string, number>>({});
  const hmsActions = useMemo(() => getHmsActions(), []);

  useEffect(() => {
    if (!MEETING_JOIN_DIAGNOSTICS_ENABLED || !enabled || Platform.OS === 'web') return;

    mountCountRef.current += 1;
    logJoinMilestone('diagnostics_attached', {
      meetingId,
      mountCount: mountCountRef.current,
    });

    const listener = getNativeEventListener();
    if (!listener) {
      logJoinMilestone('diagnostics_no_native_listener', { meetingId });
      return;
    }

    const eventTypes = [
      'ON_PREVIEW',
      'ON_JOIN',
      'ON_ROOM_UPDATE',
      'ON_ERROR',
      'RECONNECTING',
      'RECONNECTED',
      'ON_REMOVED_FROM_ROOM',
      'ON_PEER_LIST_UPDATED',
    ].map((key) => hmsActions[key] ?? key);

    const subs = eventTypes.map((eventType) => {
      try {
        return listener.addListener(DEFAULT_SDK_ID, eventType, (...args: unknown[]) => {
          eventCountsRef.current[eventType] = (eventCountsRef.current[eventType] ?? 0) + 1;
          logHmsEvent(eventType, args[0]);
          logJoinState('event_counts', { ...eventCountsRef.current });
        });
      } catch {
        return null;
      }
    });

    // Summary if join appears stuck: no ON_JOIN within 45s after diagnostics attach
    const stuckSummaryTimer = setTimeout(() => {
      const counts = { ...eventCountsRef.current };
      const sawOnJoin = (counts[hmsActions.ON_JOIN ?? 'ON_JOIN'] ?? 0) > 0;
      logJoinState('diagnostics_45s_summary', {
        meetingId,
        sawOnJoin,
        eventCounts: counts,
        interpretation: sawOnJoin
          ? 'JS received ON_JOIN — if UI still on prejoin spinner, Room Kit state machine bug'
          : 'JS never received ON_JOIN — native→JS event gap (compare to server peer.join.success)',
      });
    }, 45000);

    return () => {
      clearTimeout(stuckSummaryTimer);
      subs.forEach((s) => {
        try {
          s?.remove();
        } catch {
          /* ignore */
        }
      });
      logJoinMilestone('diagnostics_detached', {
        meetingId,
        eventCounts: { ...eventCountsRef.current },
      });
    };
  }, [enabled, meetingId, hmsActions]);

  // useHMSPeerUpdates — only hook exported for peer-level updates in hms 1.12
  const useHMSPeerUpdates = useMemo(() => {
    try {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const hmsPkg = require('@100mslive/react-native-hms') as Record<string, unknown>;
      /* eslint-enable @typescript-eslint/no-require-imports */
      return typeof hmsPkg?.useHMSPeerUpdates === 'function'
        ? (hmsPkg.useHMSPeerUpdates as (handler: (...args: unknown[]) => void, deps: unknown[]) => void)
        : (_h: (...args: unknown[]) => void, _d: unknown[]) => {};
    } catch {
      return (_h: (...args: unknown[]) => void, _d: unknown[]) => {};
    }
  }, []);

  useHMSPeerUpdates(
    (...args: unknown[]) => {
      if (!MEETING_JOIN_DIAGNOSTICS_ENABLED || !enabled) return;
      const data = args[0] as
        | { type?: string; peer?: { peerID?: string; name?: string; isLocal?: boolean } }
        | undefined;
      logHmsEvent('PEER_UPDATE_HOOK', data);
    },
    [enabled],
  );

  return null;
}
