import type { WizardField } from '../types/signature';
import { apiClient } from './api';

export interface FillDocumentResponse {
  template_id: number;
  template_name: string;
  page_images: string[];
  page_count: number;
  link_type: 'edit' | 'view';
  json_fields?: WizardField[];
  submission_id?: number;
  annotation_json?: unknown[];
  filled_by_name_prefill?: string;
  filled_by_email_prefill?: string;
  is_template_owner?: boolean;
  can_store_for_chat?: boolean;
  store_token?: string;
}

export interface FillSubmission {
  id: number;
  template_id: number;
  template_name?: string;
  filled_file_id?: number | null;
  filled_by_name?: string | null;
  filled_by_email?: string | null;
  filled_by_user_id?: number | null;
  filled_at: string;
  source_type: string;
  status: string;
}

export interface SubmitFilledDocumentPayload {
  token: string;
  annotation_json?: unknown[];
  page_images?: string[];
  filled_by_name: string;
  filled_by_email?: string;
  submission_id?: number;
  template_field_values?: Record<string, unknown>;
  store_for_chat?: boolean;
  store_token?: string;
}

export interface SubmitFilledDocumentResponse {
  success?: boolean;
  submission_id?: number;
  filled_file_id?: number;
  message?: string;
}

/** Match web fill submit: raw base64 only (no data-URL prefix). */
export function normalizePageImagesBase64(images: string[]): string[] {
  return images
    .map((img) => {
      const s = String(img ?? '').trim();
      if (!s) return '';
      const m = /^data:image\/[\w+.-]+;base64,(.+)$/i.exec(s);
      return (m ? m[1] : s).trim();
    })
    .filter(Boolean);
}

function fillApiError(err: unknown, fallback: string): Error {
  if (err && typeof err === 'object' && 'response' in err) {
    const ax = err as { response?: { data?: { message?: string }; status?: number } };
    const msg = ax.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return new Error(msg.trim());
    if (ax.response?.status === 401) return new Error('Please sign in again.');
    if (ax.response?.status === 403) return new Error('You do not have access to this document.');
  }
  if (err instanceof Error && err.message && !/status code \d{3}/.test(err.message)) {
    return err;
  }
  return new Error(fallback);
}

function extractFillLinkToken(data: Record<string, unknown>): string | null {
  const direct = data.token ?? data.share_token;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const link = data.link;
  if (link && typeof link === 'object') {
    const o = link as Record<string, unknown>;
    const nested = o.token ?? o.share_token;
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }
  return null;
}

/** Load a shared fill document (plain fill link — Mode A). */
export async function getFillDocument(
  token: string,
  submissionId?: number,
): Promise<FillDocumentResponse> {
  const { data } = await apiClient.client.get<FillDocumentResponse & { success?: boolean }>(
    '/api/v1/web/share/fill-document',
    {
      params: {
        token,
        submission_id: submissionId,
      },
    },
  );
  return data;
}

/** Create an edit/view share link for owner or recipient fill sessions. */
export async function createFillLink(
  templateId: number | string,
  options?: { link_type?: 'edit' | 'view'; expires_in_days?: number },
): Promise<{ token: string }> {
  try {
    const { data } = await apiClient.client.post<Record<string, unknown>>(
      `/api/v1/web/fillable-templates/${templateId}/create-fill-link`,
      {
        link_type: options?.link_type ?? 'edit',
        expires_in_days: options?.expires_in_days ?? 7,
        notify_on_submit: false,
      },
    );
    const token = extractFillLinkToken(data);
    if (!token) {
      throw new Error('Could not create fill link');
    }
    return { token };
  } catch (e: unknown) {
    throw fillApiError(e, 'Could not create fill link');
  }
}

export async function submitFilledDocument(
  payload: SubmitFilledDocumentPayload,
): Promise<SubmitFilledDocumentResponse> {
  const body = {
    ...payload,
    page_images: payload.page_images
      ? normalizePageImagesBase64(payload.page_images)
      : undefined,
  };
  try {
    const { data } = await apiClient.client.post<SubmitFilledDocumentResponse>(
      '/api/v1/web/share/submit-filled-document',
      body,
    );
    return data ?? {};
  } catch (e: unknown) {
    throw fillApiError(e, 'Could not finish document');
  }
}

/** All completed fill submissions for the current user (matches web Completed tab). */
export async function listFillSubmissions(): Promise<FillSubmission[]> {
  const { data } = await apiClient.client.get<{ success?: boolean; submissions?: FillSubmission[] }>(
    '/api/v1/web/fillable-templates/submissions',
  );
  return data?.submissions ?? [];
}

/** Completed submissions for one template. */
export async function listTemplateSubmissions(
  templateId: number | string,
): Promise<FillSubmission[]> {
  const { data } = await apiClient.client.get<{ success?: boolean; submissions?: FillSubmission[] }>(
    `/api/v1/web/fillable-templates/${templateId}/submissions`,
  );
  return data?.submissions ?? [];
}
