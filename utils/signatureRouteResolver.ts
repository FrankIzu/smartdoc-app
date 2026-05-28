import type { Href } from 'expo-router';

export interface SignatureRouteInput {
  navigation_path?: string;
  envelopeId?: string;
  public_id?: string;
  token?: string;
  tab?: string;
  type?: string;
}

export function resolveSignatureRoute(input: SignatureRouteInput): Href {
  const path = input.navigation_path?.trim();
  if (path) {
    if (path === '/signatures' || path === '/signatures/') {
      return '/signatures' as Href;
    }
    const signTokenMatch = path.match(/^\/signatures\/sign\/token\/([^/?]+)/);
    if (signTokenMatch) {
      return `/signatures/sign/token/${decodeURIComponent(signTokenMatch[1])}` as Href;
    }
    const signMatch = path.match(/^\/signatures\/sign\/([^/?]+)/);
    if (signMatch && signMatch[1] !== 'token') {
      return `/signatures/sign/${decodeURIComponent(signMatch[1])}` as Href;
    }
    const detailMatch = path.match(/^\/signatures\/([^/?]+)/);
    if (detailMatch && detailMatch[1] !== 'create' && detailMatch[1] !== 'sign') {
      return `/signatures/${decodeURIComponent(detailMatch[1])}` as Href;
    }
  }

  if (input.token) {
    return `/signatures/sign/token/${input.token}` as Href;
  }

  const id = input.public_id || input.envelopeId;
  if (id) {
    if (input.type === 'sign' || input.tab === 'inbox') {
      return `/signatures/sign/${id}` as Href;
    }
    return `/signatures/${id}` as Href;
  }

  return '/signatures' as Href;
}

export function hubSignRoute(envelopeId: string): Href {
  return `/signatures/sign/${envelopeId}` as Href;
}

export function hubDetailRoute(envelopeId: string): Href {
  return `/signatures/${envelopeId}` as Href;
}

export function hubCreateRoute(): Href {
  return '/signatures/create' as Href;
}

/** Prepare-for-signature wizard (place fields, add recipients, send). */
export function hubPrepareRoute(): Href {
  return hubCreateRoute();
}

/** Owner/recipient self-fill entry (upload or pick document to complete). */
export function hubFillRoute(): Href {
  return '/signatures/fill' as Href;
}

export function hubFillPickRoute(): Href {
  return '/signatures/fill/pick' as Href;
}

/** In-app fill editor — add controls and complete a document (authenticated, no share link). */
export function hubFillEditorRoute(templateId: string | number): Href {
  return `/signatures/fill/edit/${encodeURIComponent(String(templateId))}` as Href;
}

/** Prepare editor — place fields before sending for signature. */
export function hubPrepareEditorRoute(templateId: string | number): Href {
  return `/signatures/create/prepare/${encodeURIComponent(String(templateId))}` as Href;
}

export function hubFillSessionRoute(token: string): Href {
  return `/signatures/fill/${encodeURIComponent(token)}` as Href;
}

export function hubFillCompleteRoute(params: {
  templateId?: string | number;
  filledFileId?: string | number;
  submissionId?: string | number;
  templateName?: string;
}): Href {
  const q = new URLSearchParams();
  if (params.templateId != null) q.set('templateId', String(params.templateId));
  if (params.filledFileId != null) q.set('filledFileId', String(params.filledFileId));
  if (params.submissionId != null) q.set('submissionId', String(params.submissionId));
  if (params.templateName) q.set('templateName', params.templateName);
  const query = q.toString();
  return (`/signatures/fill/complete${query ? `?${query}` : ''}`) as Href;
}

export function hubTemplateSubmissionsRoute(templateId: string | number): Href {
  return `/signatures/fill/submissions/${encodeURIComponent(String(templateId))}` as Href;
}
