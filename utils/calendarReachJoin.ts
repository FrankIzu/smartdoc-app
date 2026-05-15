import type { Router } from 'expo-router';
import * as Linking from 'expo-linking';

/** Resolve Reach `meeting_id` for join-meeting from URL, meeting payload, or event.video_call_id. */
export function resolveJoinMeetingId(
  meetingUrl: string | undefined,
  meetingPayload: Record<string, unknown> | null | undefined,
  videoCallId: unknown
): string | null {
  const url = meetingUrl?.trim();
  if (url) {
    const q = url.match(/[?&]meeting_id=([^&]+)/i);
    if (q?.[1]) return decodeURIComponent(q[1]).trim();
    const q2 = url.match(/[?&]meetingId=([^&]+)/i);
    if (q2?.[1]) return decodeURIComponent(q2[1]).trim();
  }
  const m = meetingPayload;
  if (m && typeof m === 'object') {
    const mid =
      (m as Record<string, unknown>).meeting_id ??
      (m as Record<string, unknown>).meetingId ??
      (m as Record<string, unknown>).hms_room_id ??
      (m as Record<string, unknown>).room_meeting_id;
    if (mid != null && String(mid).trim() !== '') return String(mid).trim();
  }
  if (videoCallId != null && String(videoCallId).trim() !== '') return String(videoCallId).trim();
  return null;
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
    router.push({ pathname: '/join-meeting', params: { meeting_id: mid } } as any);
    return;
  }
  if (meetingUrl?.trim()) Linking.openURL(meetingUrl.trim()).catch(() => {});
}

/**
 * From a calendar list row: join when ids/URLs exist; otherwise open event detail (meeting may load there).
 */
export function navigateReachJoinFromCalendarListRow(router: Router, ev: Record<string, unknown>): void {
  const meetingUrl = ev.meeting_url != null ? String(ev.meeting_url) : undefined;
  const videoCallId = ev.video_call_id;
  const mid = resolveJoinMeetingId(meetingUrl, undefined, videoCallId);
  if (mid) {
    router.push({ pathname: '/join-meeting', params: { meeting_id: mid } } as any);
    return;
  }
  if (meetingUrl?.trim()) {
    Linking.openURL(meetingUrl.trim()).catch(() => {});
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
