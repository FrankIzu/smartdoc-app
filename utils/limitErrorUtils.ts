/**
 * Limit error utilities for mobile app.
 * Matches backend format from limit_error_utils.py and mobile_routes.py.
 * Use to detect and display subscription limit errors (storage, tokens, meetings, etc.)
 */

export interface LimitErrorDetails {
  current_usage_mb?: number;
  limit_mb?: number;
  file_size_mb?: number;
  available_space_mb?: number;
  used?: number;
  limit?: number;
  remaining?: number;
  tokens_used?: number;
  tokens_limit?: number;
  meetings_conducted?: number;
  max_meetings_per_month?: number;
  [key: string]: unknown;
}

export interface LimitErrorData {
  errorCode?: string;
  message: string;
  limitType?: string;
  details?: LimitErrorDetails;
  actionUrl?: string;
}

const LIMIT_ERROR_CODES = [
  'storage_limit_exceeded',
  'insufficient_tokens',
  'meeting_limit_exceeded',
  'workspace_limit_exceeded',
  'workspace_member_limit_exceeded',
  'monthly_token_limit_exceeded',
] as const;

/**
 * Check if API response data indicates a subscription/limit error
 */
export function isLimitErrorResponse(data: unknown): data is Record<string, unknown> {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (d.upgrade_required === true) return true;
  const code = (d.error_code ?? d.error) as string | undefined;
  return typeof code === 'string' && LIMIT_ERROR_CODES.includes(code as any);
}

/**
 * Extract limit error data from API response for use with showLimitError
 */
export function extractLimitErrorData(data: unknown): LimitErrorData | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (!isLimitErrorResponse(data)) return null;
  const errorCode = (d.error_code ?? d.error) as string | undefined;
  const message = (d.message ?? 'A subscription limit has been reached.') as string;
  const limitType = (d.limit_type ?? d.limitType) as string | undefined;
  const details = (d.details ?? d.usage_info ?? d.member_info) as LimitErrorDetails | undefined;
  const actionUrl = (d.action_url ?? d.actionUrl) as string | undefined;
  return {
    errorCode: errorCode ?? (d.error as string),
    message,
    limitType,
    details,
    actionUrl,
  };
}

/**
 * Get response data from a caught error (axios or custom)
 */
export function getErrorResponseData(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as Record<string, unknown>;
  // Axios: error.response.data
  const axiosData = (e.response as Record<string, unknown>)?.data;
  if (axiosData && typeof axiosData === 'object') {
    return axiosData as Record<string, unknown>;
  }
  // Custom: error.responseData (when we attach it)
  const customData = e.responseData;
  if (customData && typeof customData === 'object') {
    return customData as Record<string, unknown>;
  }
  return null;
}
