/** Shared helpers for Reach prepare → HMS → confirm (mirrors web meetingJoinPresence.ts). */

export function isActiveMeetingConflict(error: unknown): boolean {
  const e = error as { response?: { status?: number; data?: { error_code?: string } } };
  const code = e?.response?.data?.error_code;
  return (
    e?.response?.status === 409 &&
    (code === 'ALREADY_IN_MEETING' || code === 'ACTIVE_MEETING_EXISTS')
  );
}

export type ParsedJoinByIdResponse = {
  token?: string;
  meetingId?: string;
  roomId?: number;
  guestId?: string;
  joinPhase?: string;
  roomName?: string;
  userRole?: string;
};

/** Normalize join-by-id / join-by-id/confirm response payload. */
export function parseJoinByIdResponse(raw: unknown): ParsedJoinByIdResponse {
  const top = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const data =
    top.data && typeof top.data === 'object' && top.data != null
      ? (top.data as Record<string, unknown>)
      : top;

  const token = typeof data.token === 'string' ? data.token.trim() : undefined;

  const meetingIdRaw = data.meeting_id ?? data.meetingId ?? data.scheduled_meeting_id;
  const meetingId =
    meetingIdRaw != null && String(meetingIdRaw).trim() !== ''
      ? String(meetingIdRaw).trim()
      : undefined;

  const roomIdRaw = data.room_id ?? data.roomId;
  const roomId =
    roomIdRaw != null && !Number.isNaN(Number(roomIdRaw)) ? Number(roomIdRaw) : undefined;

  const guestRaw = data.guest_id ?? data.guestId;
  const guestId =
    typeof guestRaw === 'string' && guestRaw.startsWith('guest_') ? guestRaw : undefined;

  const joinPhaseRaw = data.join_phase ?? data.joinPhase;
  const joinPhase = typeof joinPhaseRaw === 'string' ? joinPhaseRaw : undefined;

  const roomNameRaw = data.room_name ?? data.roomName;
  const roomName = typeof roomNameRaw === 'string' ? roomNameRaw : undefined;

  const userRoleRaw = data.user_role ?? data.userRole;
  const userRole = typeof userRoleRaw === 'string' ? userRoleRaw : undefined;

  return { token, meetingId, roomId, guestId, joinPhase, roomName, userRole };
}

/** Confirm is required when backend returns join_phase=prepare (web Prebuilt parity). */
export function needsJoinConfirm(joinPhase: string | undefined): boolean {
  if (!joinPhase) return true;
  return joinPhase === 'prepare';
}

/**
 * Mobile GET /mobile/meetings/{id}/info wraps room in `{ success, data }` and may omit
 * `metadata_tier` from the web get_video_room response. Detect reduced public lobby payloads
 * heuristically when the tier is not forwarded.
 */
export function parseMobileMeetingInfoResponse(response: Record<string, unknown>): {
  room: Record<string, unknown> | null;
  isPublicJoinSafe: boolean;
} {
  if (response.metadata_tier === 'public_join_safe') {
    const room = response.room;
    return {
      room: room && typeof room === 'object' ? (room as Record<string, unknown>) : null,
      isPublicJoinSafe: true,
    };
  }

  const data =
    response.data && typeof response.data === 'object'
      ? (response.data as Record<string, unknown>)
      : response;

  const nested =
    data.data && typeof data.data === 'object' ? (data.data as Record<string, unknown>) : data;

  const room =
    nested.room && typeof nested.room === 'object'
      ? (nested.room as Record<string, unknown>)
      : nested;

  return {
    room,
    isPublicJoinSafe: isReducedPublicJoinSafePayload(nested, room),
  };
}

function isReducedPublicJoinSafePayload(
  data: Record<string, unknown>,
  room: Record<string, unknown>,
): boolean {
  if (data.metadata_tier === 'public_join_safe') return true;

  const hasInvited =
    (Array.isArray(data.invited_participants) && data.invited_participants.length > 0) ||
    (Array.isArray(room.invited_participants) && room.invited_participants.length > 0);

  const hasFullHostMeta =
    data.creator != null ||
    room.creator != null ||
    (Array.isArray(data.meeting_hosts) && data.meeting_hosts.length > 0);

  const passcodeRequired =
    data.passcode_required === true || room.passcode_required === true;

  const hasRoomIdentity =
    room.id != null ||
    room.meeting_id != null ||
    data.id != null ||
    data.meeting_id != null;

  return hasRoomIdentity && !hasInvited && !hasFullHostMeta && !passcodeRequired;
}
