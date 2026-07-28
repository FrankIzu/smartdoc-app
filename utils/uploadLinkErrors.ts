const UPLOAD_LINK_ERROR_MESSAGES: Record<string, string> = {
  UPLOAD_LINK_EXPIRED:
    'This upload link has expired. Please contact the person who sent you this link to request a new one.',
  UPLOAD_LINK_INACTIVE: 'This upload link is no longer active.',
  UPLOAD_LINK_FULL: 'Maximum uploads reached for this link.',
  UPLOAD_LINK_NOT_FOUND: 'Upload code not found. Please check the code and try again.',
  INTAKE_ARCHIVED: 'This intake is archived and is no longer accepting uploads.',
};

export type UploadLinkErrorPayload = {
  message?: string;
  error_code?: string;
  auth_required?: boolean;
  error?: string;
};

/** Map public upload-link API error payload → user-facing message. */
export function getUploadLinkErrorMessage(
  data: UploadLinkErrorPayload | null | undefined,
  fallback: string,
): string {
  if (!data) return fallback;
  if (data.auth_required) {
    return 'This upload link requires you to sign in before uploading.';
  }
  if (data.error_code && UPLOAD_LINK_ERROR_MESSAGES[data.error_code]) {
    return UPLOAD_LINK_ERROR_MESSAGES[data.error_code];
  }
  if (data.message) {
    if (data.message.toLowerCase().includes('not found or inactive')) {
      return 'This upload code is invalid, inactive, or has expired. Check the code, try the full link URL, or ask the sender for a new link.';
    }
    return data.message;
  }
  if (data.error) return data.error;
  return fallback;
}

export function getRemainingUploadSlots(info: {
  remaining_uploads?: number | null;
  max_uploads?: number | null;
  current_uploads?: number;
  is_full?: boolean;
}): number | null {
  if (info.is_full) return 0;
  if (info.remaining_uploads != null) return info.remaining_uploads;
  if (info.max_uploads == null) return null;
  return Math.max(0, info.max_uploads - (info.current_uploads ?? 0));
}
