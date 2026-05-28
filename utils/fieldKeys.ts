/**
 * Compound field key helpers — match backend signature_envelope_engine.py
 */

export function makeFieldKey(fieldId: string, rev: number = 1): string {
  return `${fieldId}:${rev}`;
}

export function parseFieldKey(key: string): { fieldId: string; rev: number } {
  if (!key.includes(':')) {
    return { fieldId: key, rev: 1 };
  }
  const idx = key.lastIndexOf(':');
  const fieldId = key.slice(0, idx);
  const rev = parseInt(key.slice(idx + 1), 10);
  return { fieldId, rev: Number.isFinite(rev) ? rev : 1 };
}

export function envelopePathSegment(envelope: { public_id?: string; id: number }): string {
  return envelope.public_id?.trim() || String(envelope.id);
}
