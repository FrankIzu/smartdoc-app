import type { Router } from 'expo-router';
import { Alert } from 'react-native';
import {
  extractMeetingIdFromJoinUrl,
  isGrabDocsReachJoinUrl,
  navigateGrabDocsJoinFromUrl,
} from './grabdocsJoinUrl';
import { openMeetingUrl } from './openMeetingUrl';

export {
  extractMeetingIdFromJoinUrl,
  isGrabDocsReachJoinUrl,
  navigateGrabDocsJoinFromUrl,
} from './grabdocsJoinUrl';

/** Passed through join-meeting → HMS so leave/back returns to Calendar instead of Reach. */
export const CALENDAR_MEETING_RETURN_TO = 'calendar';

/** 8-digit room code, or encoded meeting id (base64url). Not a DB primary key. */
function looksLikeReachMeetingId(raw: unknown): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  if (/^\d{8}$/.test(s)) return true;
  // Encoded ids from encode_meeting_id (base64url, typically longer than a small PK)
  if (/^[A-Za-z0-9_-]{12,}$/.test(s)) return true;
  return false;
}

/** Resolve Reach `meeting_id` for join-meeting from URL, meeting payload, or event.video_call_id. */
export function resolveJoinMeetingId(
  meetingUrl: string | undefined,
  meetingPayload: Record<string, unknown> | null | undefined,
  videoCallId: unknown
): string | null {
  const fromUrl = extractMeetingIdFromJoinUrl(meetingUrl);
  if (fromUrl) return fromUrl;

  const m = meetingPayload;
  if (m && typeof m === 'object') {
    const mid =
      (m as Record<string, unknown>).meeting_id ??
      (m as Record<string, unknown>).meetingId ??
      (m as Record<string, unknown>).room_meeting_id;
    if (mid != null && String(mid).trim() !== '') return String(mid).trim();
  }

  // video_call_id on calendar events is often the VideoCall DB PK — only use it when it
  // already looks like a Reach room code / encoded id (not a small integer PK).
  if (looksLikeReachMeetingId(videoCallId)) return String(videoCallId).trim();

  return null;
}

function pushJoinMeeting(router: Router, meetingId: string, returnTo?: string): void {
  const params: Record<string, string> = { meeting_id: meetingId };
  if (returnTo?.trim()) params.returnTo = returnTo.trim();
  router.push({ pathname: '/join-meeting', params } as any);
}

/** Same join path as calendar event detail (`/join-meeting` or external `meeting_url`). */
export function navigateJoinMeeting(
  router: Router,
  meetingUrl: string | undefined,
  meetingPayload: Record<string, unknown> | null | undefined,
  videoCallId: unknown
): void {
  const mid = resolveJoinMeetingId(meetingUrl, meetingPayload, videoCallId);
  if (mid) {
    pushJoinMeeting(router, mid, CALENDAR_MEETING_RETURN_TO);
    return;
  }

  const url = meetingUrl?.trim();
  if (!url) return;

  // GrabDocs Reach links must never open in the system browser (that causes the
  // "open in browser → choose phone app" hop). Stay in-app or show an error.
  if (isGrabDocsReachJoinUrl(url)) {
    if (navigateGrabDocsJoinFromUrl(url, { router, returnTo: CALENDAR_MEETING_RETURN_TO })) {
      return;
    }
    Alert.alert(
      'Join meeting',
      'Could not open this GrabDocs meeting link. Try again from Reach or ask the host for a new link.'
    );
    return;
  }

  void openMeetingUrl(url);
}

/**
 * From a calendar list row: join when ids/URLs exist; otherwise open event detail (meeting may load there).
 */
export function navigateReachJoinFromCalendarListRow(router: Router, ev: Record<string, unknown>): void {
  const meetingUrl = ev.meeting_url != null ? String(ev.meeting_url) : undefined;
  const videoCallId = ev.video_call_id;
  const mid = resolveJoinMeetingId(meetingUrl, undefined, videoCallId);
  if (mid) {
    pushJoinMeeting(router, mid, CALENDAR_MEETING_RETURN_TO);
    return;
  }
  if (meetingUrl?.trim()) {
    if (isGrabDocsReachJoinUrl(meetingUrl)) {
      if (navigateGrabDocsJoinFromUrl(meetingUrl, { router, returnTo: CALENDAR_MEETING_RETURN_TO })) {
        return;
      }
      Alert.alert(
        'Join meeting',
        'Could not open this GrabDocs meeting link. Open the event for details.'
      );
      return;
    }
    void openMeetingUrl(meetingUrl.trim());
    return;
  }
  const pendingLocal = ev._offlinePendingLocalId;
  if (ev._offlinePendingCreate && pendingLocal != null) {
    router.push(`/calendar/pending/${pendingLocal}` as any);
    return;
  }
  const id = ev.id;
  if (id != null && String(id).trim() !== '') {
    router.push(`/calendar/${id}` as any);
  }
}
