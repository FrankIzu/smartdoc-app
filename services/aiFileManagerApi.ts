import type { AxiosInstance } from 'axios';
import type {
  AiFmConfig,
  ExecuteRequestBody,
  ExecuteResponse,
  HistoryRow,
  PlanRequestBody,
  PlanResponse,
  ScheduleRequestBody,
  ScheduledRow,
} from '../types/aiFileManager';

const WEB = '/api/v1/web/ai-file-manager';

function unwrap<T>(data: unknown): T {
  if (data && typeof data === 'object' && 'data' in (data as object)) {
    return (data as { data: T }).data;
  }
  return data as T;
}

export async function getAiFileManagerConfig(client: AxiosInstance): Promise<AiFmConfig> {
  const res = await client.get(`${WEB}/config`);
  return unwrap<AiFmConfig>(res.data) ?? (res.data as AiFmConfig);
}

export async function postAiFileManagerPlan(
  client: AxiosInstance,
  body: PlanRequestBody
): Promise<PlanResponse> {
  const res = await client.post(`${WEB}/plan`, body);
  return (res.data ?? {}) as PlanResponse;
}

export async function postAiFileManagerExecute(
  client: AxiosInstance,
  body: ExecuteRequestBody
): Promise<ExecuteResponse> {
  const res = await client.post(`${WEB}/execute`, body);
  return (res.data ?? {}) as ExecuteResponse;
}

export async function postAiFileManagerSchedule(
  client: AxiosInstance,
  body: ScheduleRequestBody
): Promise<{ success?: boolean; schedule_id?: number; message?: string }> {
  const res = await client.post(`${WEB}/schedule`, body);
  return (res.data ?? {}) as { success?: boolean; schedule_id?: number; message?: string };
}

export async function getAiFileManagerHistory(
  client: AxiosInstance,
  limit = 50
): Promise<HistoryRow[]> {
  const res = await client.get(`${WEB}/history`, { params: { limit } });
  const data = res.data as { history?: HistoryRow[] };
  return data?.history ?? [];
}

export async function abandonAiFileManagerHistory(
  client: AxiosInstance,
  historyId: number
): Promise<{ success?: boolean; message?: string }> {
  const res = await client.post(`${WEB}/history/${historyId}/abandon`);
  return (res.data ?? {}) as { success?: boolean; message?: string };
}

export async function deleteAiFileManagerHistory(
  client: AxiosInstance,
  historyId: number
): Promise<{ success?: boolean; message?: string }> {
  const res = await client.delete(`${WEB}/history/${historyId}`);
  return (res.data ?? {}) as { success?: boolean; message?: string };
}

export async function undoAiFileManagerHistory(
  client: AxiosInstance,
  historyId: number
): Promise<{ success?: boolean; message?: string }> {
  const res = await client.post(`${WEB}/undo/${historyId}`);
  return (res.data ?? {}) as { success?: boolean; message?: string };
}

export async function getAiFileManagerScheduled(client: AxiosInstance): Promise<ScheduledRow[]> {
  const res = await client.get(`${WEB}/scheduled`);
  const data = res.data as { scheduled?: ScheduledRow[] };
  return data?.scheduled ?? [];
}

export async function patchAiFileManagerScheduled(
  client: AxiosInstance,
  id: number,
  status: 'active' | 'paused'
): Promise<{ success?: boolean; message?: string }> {
  const res = await client.patch(`${WEB}/scheduled/${id}`, { status });
  return (res.data ?? {}) as { success?: boolean; message?: string };
}

export async function deleteAiFileManagerScheduled(
  client: AxiosInstance,
  id: number
): Promise<{ success?: boolean; message?: string }> {
  const res = await client.delete(`${WEB}/scheduled/${id}`);
  return (res.data ?? {}) as { success?: boolean; message?: string };
}
