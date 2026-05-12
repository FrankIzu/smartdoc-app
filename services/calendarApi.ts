import { API_BASE_URL } from '../constants/Config';
import { apiClient } from './api';

const client = () => apiClient.client;

export type CalendarParticipantInput = { email: string; name?: string; type?: string };

/** Event object from list/detail/create/update (fields depend on endpoint). */
export type CalendarEvent = {
  id: number;
  title?: string;
  description?: string;
  notes?: string | null;
  start_time?: string;
  end_time?: string;
  timezone?: string;
  location?: string;
  meeting_url?: string;
  video_call_id?: number | string | null;
  status?: string;
  event_type?: string;
  user_id?: number;
  organizer?: { id?: number; name?: string; email?: string };
  participants?: {
    id?: number;
    email?: string;
    name?: string;
    status?: string;
    is_organizer?: boolean;
    type?: string;
  }[];
  linked_category_id?: number | null;
  linked_category_record_id?: number | null;
  [key: string]: unknown;
};

export type CalendarStats = Record<string, number>;

export interface CalendarListParams {
  start_date?: string;
  end_date?: string;
  search?: string;
  event_type?: 'personal' | 'company';
  view_user_id?: number;
  workspace_id?: number;
  status?: string;
  include_cancelled?: boolean;
}

export async function calendarListEvents(params: CalendarListParams): Promise<CalendarEvent[]> {
  const { data } = await client().get<{ events?: CalendarEvent[] }>('/api/v1/calendar/events', { params });
  return data?.events ?? [];
}

export async function calendarGetStats(
  params?: { view_user_id?: number; start_date?: string; end_date?: string }
): Promise<CalendarStats> {
  const { data } = await client().get<{ stats?: CalendarStats }>('/api/v1/calendar/stats', { params });
  return data?.stats ?? {};
}

export async function calendarGetEvent(id: number): Promise<CalendarEvent> {
  const { data } = await client().get<{ event: CalendarEvent }>(`/api/v1/calendar/events/${id}`);
  return data.event;
}

export async function calendarCreateEvent(body: Record<string, unknown>): Promise<CalendarEvent> {
  const { data } = await client().post<{ event: CalendarEvent }>('/api/v1/calendar/events', body);
  return data.event;
}

export async function calendarUpdateEvent(id: number, body: Record<string, unknown>): Promise<CalendarEvent> {
  const { data } = await client().put<{ event: CalendarEvent }>(`/api/v1/calendar/events/${id}`, body);
  return data.event;
}

export async function calendarDeleteEvent(id: number) {
  await client().delete(`/api/v1/calendar/events/${id}`);
}

export async function calendarRsvp(eventId: number, status: 'accepted' | 'declined' | 'tentative', response_comment?: string) {
  await client().post(`/api/v1/calendar/events/${eventId}/rsvp`, { status, response_comment: response_comment ?? '' });
}

export async function calendarRsvpFromEmail(eventId: number, token: string, status: 'accepted' | 'declined') {
  const { data } = await client().post(`/api/v1/calendar/events/${eventId}/rsvp-from-email`, { token, status });
  return data;
}

export async function calendarResendInvite(eventId: number, participantId: number) {
  await client().post(`/api/v1/calendar/events/${eventId}/participants/${participantId}/resend`);
}

export async function calendarSearchCompanyMembers(q: string, limit = 10) {
  const { data } = await client().get<{ success?: boolean; members?: any[] }>('/api/v1/calendar/company-members/search', {
    params: { q, limit },
  });
  return data?.members ?? [];
}

export async function calendarCategoriesWithRecords() {
  const { data } = await client().get<{ success?: boolean; categories?: any[] }>('/api/v1/calendar/categories-with-records');
  return data?.categories ?? [];
}

export async function calendarConnections() {
  const { data } = await client().get<{ connections?: any[] }>('/api/v1/calendar/connections');
  return data?.connections ?? [];
}

export async function calendarDeleteConnection(connectionId: number) {
  await client().delete(`/api/v1/calendar/connections/${connectionId}`);
}

export async function calendarResetConnection(connectionId: number) {
  await client().post(`/api/v1/calendar/connections/${connectionId}/reset`);
}

/** Runs sync for active Google + Microsoft connections (same as web). */
export async function calendarSyncGoogle() {
  await client().post('/api/v1/calendar/google/sync');
}

export async function calendarGoogleCalendars() {
  const { data } = await client().get('/api/v1/calendar/google/calendars');
  return data;
}

export async function calendarMicrosoftCalendars() {
  const { data } = await client().get('/api/v1/calendar/microsoft/calendars');
  return data;
}

export async function calendarAvailabilityCheck(body: Record<string, unknown>) {
  const { data } = await client().post('/api/v1/calendar/availability/check', body);
  return data;
}

export async function calendarAvailabilitySuggest(body: Record<string, unknown>) {
  const { data } = await client().post('/api/v1/calendar/availability/suggest', body);
  return data;
}

export function calendarIcsUrl(token: string) {
  return `${API_BASE_URL.replace(/\/$/, '')}/api/v1/calendar/ics/${encodeURIComponent(token)}`;
}

export async function scheduleReachMeeting(body: Record<string, unknown>) {
  const { data } = await client().post('/api/v1/video/room/schedule', body);
  return data;
}

export async function calendarEventMeeting(eventId: number) {
  const { data } = await client().get(`/api/v1/calendar/events/${eventId}/meeting`);
  return data;
}

export async function calendarMeetingAssets(eventId: number) {
  const { data } = await client().get(`/api/v1/calendar/events/${eventId}/meeting/assets`);
  return data;
}

export async function calendarAssetContent(eventId: number, assetType: 'transcript' | 'summary' | 'chat', url: string) {
  const { data } = await client().get(`/api/v1/calendar/events/${eventId}/meeting/asset-content`, {
    params: { asset_type: assetType, url },
  });
  return data;
}

export async function calendarAssetsMetadata(eventIds: number[], start_date?: string, end_date?: string) {
  const params: Record<string, string> =
    eventIds.length > 0
      ? { event_ids: eventIds.join(',') }
      : {};
  if (start_date) params.start_date = start_date;
  if (end_date) params.end_date = end_date;
  const { data } = await client().get('/api/v1/calendar/events/assets-metadata', { params });
  return data;
}

// —— Notes (notebook on event) ——

export type CalendarNotebookNote = {
  id: number;
  title?: string;
  content?: string;
  user_id?: number;
  [key: string]: unknown;
};

export async function notesForCalendarEvent(eventId: number): Promise<CalendarNotebookNote[]> {
  const { data } = await client().get<{ notes?: CalendarNotebookNote[] }>(`/api/v1/notes/source/calendar_event/${eventId}`);
  return data?.notes ?? [];
}

export async function noteCreate(body: {
  source_type: 'calendar_event';
  source_id: number;
  title: string;
  content: string;
  workspace_id?: number;
}): Promise<CalendarNotebookNote | undefined> {
  const { data } = await client().post<{ note?: CalendarNotebookNote }>('/api/v1/notes', body);
  return data?.note;
}

export async function noteUpdate(
  id: number,
  body: { title?: string; content?: string }
): Promise<CalendarNotebookNote | undefined> {
  const { data } = await client().put<{ note?: CalendarNotebookNote }>(`/api/v1/notes/${id}`, body);
  return data?.note;
}

export async function noteDelete(id: number) {
  await client().delete(`/api/v1/notes/${id}`);
}
