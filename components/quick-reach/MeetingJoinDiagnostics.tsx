/**
 * HMS join instrumentation — console-only milestones. Does NOT subscribe to native HMS events:
 * HMSNativeEventListener.addListener with a hardcoded SDK id races Room Kit's ON_PREVIEW/ON_JOIN
 * registration and causes a permanent black FullScreenIndicator (prejoin never loads).
 *
 * Re-enable native event logging only after subscribing via the live HMSSDK instance id.
 */
import React from 'react';

type Props = {
  enabled: boolean;
  meetingId?: string;
};

/** Intentionally inert — kept so call sites stay stable while we fix the join regression. */
export function MeetingJoinDiagnostics(_props: Props) {
  return null;
}
