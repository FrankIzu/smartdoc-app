import { FRONTEND_URL } from '../constants/Config';

/** Backend public_url is often `/upload-to/{token}` — prepend configured frontend origin for share/copy. */
export function getFullPublicUploadUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${FRONTEND_URL}${path}`;
}

export function getUploadToBaseUrl(): string {
  const base = FRONTEND_URL.replace(/\/$/, '');
  return `${base}/upload-to`;
}

export function buildUploadLinkUrl(tokenOrPath: string): string {
  if (tokenOrPath.startsWith('http://') || tokenOrPath.startsWith('https://')) {
    return tokenOrPath;
  }
  if (tokenOrPath.startsWith('upload-to/')) {
    return getFullPublicUploadUrl(`/${tokenOrPath}`);
  }
  if (tokenOrPath.startsWith('/upload-to/')) {
    return getFullPublicUploadUrl(tokenOrPath);
  }
  return `${getUploadToBaseUrl()}/${tokenOrPath}`;
}

export function checklistFileStillClassifying(
  fileKind?: string | null,
  processingStatus?: string | null,
): boolean {
  const fk = (fileKind || '').toLowerCase();
  if (fk && fk !== 'pending' && fk !== 'unknown') return false;
  const status = (processingStatus || '').toLowerCase();
  if (status === 'failed' || status === 'error') return false;
  return true;
}
