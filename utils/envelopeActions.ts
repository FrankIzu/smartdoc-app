import { Platform } from 'react-native';
import { STORAGE_KEYS } from '../constants/Config';
import { apiClient } from '../services/api';
import { auditPdfUrl, certificatePdfUrl, getEnvelope } from '../services/envelopeApi';
import type { Envelope } from '../types/signature';
import { secureStorage } from './storage';

/** Prefer merged PDF when the envelope has multiple documents. */
export function envelopeFinalFileId(envelope: Envelope): number | null {
  const id = envelope.merged_final_file_id ?? envelope.final_file_id ?? null;
  return id != null ? id : null;
}

export function envelopeFillableTemplateId(envelope: Envelope): number | null {
  const legacy = (envelope as Envelope & { fillable_template_id?: number }).fillable_template_id;
  if (legacy) return legacy;
  for (const doc of envelope.documents ?? []) {
    if (doc.fillable_template_id) return doc.fillable_template_id;
  }
  return null;
}

/** Ensure audit PDF exists server-side and return its files.id for DocumentViewer. */
export async function resolveEnvelopeAuditFileId(
  envelopeId: string,
  knownAuditFileId?: number | null,
): Promise<number | null> {
  if (knownAuditFileId) return knownAuditFileId;

  const envelope = (await getEnvelope(envelopeId)).envelope;
  if (envelope.audit_file_id) return envelope.audit_file_id;

  const token = await secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  await apiClient.client.get(auditPdfUrl(envelopeId), {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Platform': Platform.OS,
    },
    responseType: 'arraybuffer',
    timeout: 120000,
  });

  const refreshed = (await getEnvelope(envelopeId)).envelope;
  return refreshed.audit_file_id ?? null;
}

/** Ensure completion certificate PDF exists and return its files.id for DocumentViewer. */
export async function resolveEnvelopeCertificateFileId(
  envelopeId: string,
  knownCertificateFileId?: number | null,
): Promise<number | null> {
  if (knownCertificateFileId) return knownCertificateFileId;

  const envelope = (await getEnvelope(envelopeId)).envelope;
  if (envelope.certificate_file_id) return envelope.certificate_file_id;

  const token = await secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  await apiClient.client.get(certificatePdfUrl(envelopeId), {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Platform': Platform.OS,
    },
    responseType: 'arraybuffer',
    timeout: 120000,
  });

  const refreshed = (await getEnvelope(envelopeId)).envelope;
  return refreshed.certificate_file_id ?? null;
}

/** Load envelope when list rows only have meta fields (no file ids). */
export async function loadEnvelopeForActions(envelope: Envelope): Promise<Envelope> {
  if (
    envelopeFinalFileId(envelope) ||
    envelope.audit_file_id ||
    envelope.certificate_file_id
  ) {
    return envelope;
  }
  return (await getEnvelope(envelope.public_id ?? envelope.id)).envelope;
}
