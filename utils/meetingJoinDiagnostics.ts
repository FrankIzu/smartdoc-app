/**
 * HMS join-flow instrumentation. Console-only timeline when enabled.
 */
import { Platform } from 'react-native';

/** Set true for verbose console join timeline (never posts to backend — avoids HMSJoinDiag flood). */
export const MEETING_JOIN_DIAGNOSTICS_ENABLED = false;

const LOG_PREFIX = '[HMS-DIAG]';
const sessionStartedAt = Date.now();
let sequence = 0;

function elapsedMs(): number {
  return Date.now() - sessionStartedAt;
}

/** Avoid huge payloads / circular refs in logs. */
export function safeSerialize(value: unknown, maxLen = 1200): string {
  try {
    const seen = new WeakSet<object>();
    const json = JSON.stringify(
      value,
      (_key, v) => {
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        if (typeof v === 'string' && v.length > 200) {
          return `${v.slice(0, 200)}…(${v.length} chars)`;
        }
        return v;
      },
      2
    );
    if (json.length <= maxLen) return json;
    return `${json.slice(0, maxLen)}…(truncated)`;
  } catch {
    return String(value);
  }
}

function emit(
  kind: 'milestone' | 'hms_event' | 'state',
  name: string,
  detail?: Record<string, unknown>
) {
  if (!MEETING_JOIN_DIAGNOSTICS_ENABLED) return;

  sequence += 1;
  const elapsed = elapsedMs();
  const line = `${LOG_PREFIX} +${elapsed}ms #${sequence} ${kind.toUpperCase()} ${name}`;

  console.log(line, detail ?? '');
  if (detail && Object.keys(detail).length > 0) {
    console.log(`${LOG_PREFIX} detail:`, safeSerialize(detail));
  }
}

/** App-level join milestones (token fetch, prebuilt mount, presence confirm, etc.). */
export function logJoinMilestone(name: string, detail?: Record<string, unknown>) {
  emit('milestone', name, detail);
}

/** Native HMS events received in JS (ON_JOIN, ON_ERROR, …). */
export function logHmsEvent(eventName: string, payload?: unknown) {
  const detail: Record<string, unknown> = {
    event: eventName,
    payloadPreview: safeSerialize(payload, 800),
  };
  if (payload && typeof payload === 'object' && payload !== null) {
    const p = payload as Record<string, unknown>;
    if ('id' in p) detail.sdkInstanceId = p.id;
    if ('room' in p && p.room && typeof p.room === 'object') {
      const room = p.room as Record<string, unknown>;
      detail.roomId = room.roomID ?? room.id;
      detail.roomName = room.name;
    }
    if ('code' in p) detail.errorCode = p.code;
    if ('message' in p) detail.errorMessage = p.message;
    if ('description' in p) detail.errorDescription = p.description;
  }
  emit('hms_event', eventName, detail);
}

/** Periodic or one-off state snapshots (peer counts, flags). */
export function logJoinState(name: string, detail?: Record<string, unknown>) {
  emit('state', name, detail);
}

/** Log installed HMS package versions once per join attempt. */
export function logHmsPackageVersions() {
  if (!MEETING_JOIN_DIAGNOSTICS_ENABLED || Platform.OS === 'web') return;
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const hmsPkg = require('@100mslive/react-native-hms/package.json') as { version?: string };
    const roomKitPkg = require('@100mslive/react-native-room-kit/package.json') as { version?: string };
    const rnPkg = require('react-native/package.json') as { version?: string };
    const expoPkg = require('expo/package.json') as { version?: string };
    /* eslint-enable @typescript-eslint/no-require-imports */
    logJoinMilestone('sdk_versions', {
      reactNativeHms: hmsPkg?.version,
      reactNativeRoomKit: roomKitPkg?.version,
      reactNative: rnPkg?.version,
      expo: expoPkg?.version,
      note: 'useHMSStore/selectHMSRoomState not exported in react-native-hms 1.12 — event logging only',
    });
  } catch (e) {
    logJoinMilestone('sdk_versions_error', { error: String(e) });
  }
}
