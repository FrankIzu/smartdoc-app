/**
 * Client-side mirror of backend Guard 4 in validate_assignment_completeness:
 * when there are field assignments, every signer must have at least one.
 * Scoped per document when document_id is present (same as send API).
 */

export type AssignmentCoverageRow = {
  recipient_id?: number | null;
  document_id?: number | null;
};

export type SignerCoverageRow = {
  id: number;
  email: string;
  name?: string | null;
};

export type AssignmentCoverageResult =
  | { ok: true }
  | { ok: false; message: string; missingEmails: string[] };

function signerLabel(s: SignerCoverageRow): string {
  return (s.name && s.name.trim()) || s.email || `Signer #${s.id}`;
}

/**
 * Returns an error when any signer has zero field assignments (optionally
 * per document). Call only when assignments.length > 0 (acknowledge-only
 * envelopes skip this, matching the backend).
 */
export function validateSignerFieldCoverage(
  signers: SignerCoverageRow[],
  assignments: AssignmentCoverageRow[]
): AssignmentCoverageResult {
  if (!signers.length) {
    return { ok: false, message: 'Add at least one signer before continuing.', missingEmails: [] };
  }
  if (!assignments.length) {
    return { ok: true };
  }

  const unassignedFields = assignments.filter((a) => a.recipient_id == null || a.recipient_id === 0);
  if (unassignedFields.length) {
    return {
      ok: false,
      message: `${unassignedFields.length} field(s) are not assigned to a signer. Tap each field and choose a signer.`,
      missingEmails: [],
    };
  }

  const docIds = [
    ...new Set(
      assignments
        .map((a) => a.document_id)
        .filter((id): id is number => id != null && Number.isFinite(id))
    ),
  ];

  // No document scoping available — require each signer to appear at least once overall.
  if (!docIds.length) {
    const missing = signers.filter((s) => !assignments.some((a) => a.recipient_id === s.id));
    if (!missing.length) return { ok: true };
    const labels = missing.map(signerLabel);
    return {
      ok: false,
      message: `Assign at least one field to each signer before continuing:\n${labels.join('\n')}`,
      missingEmails: missing.map((s) => s.email),
    };
  }

  // Mirror backend: per document that has assignments, every signer needs ≥1 field.
  const missingBySigner = new Map<number, SignerCoverageRow>();
  for (const docId of docIds) {
    const scoped = assignments.filter((a) => a.document_id === docId);
    if (!scoped.length) continue;
    for (const s of signers) {
      if (!scoped.some((a) => a.recipient_id === s.id)) {
        missingBySigner.set(s.id, s);
      }
    }
  }

  if (!missingBySigner.size) return { ok: true };

  const missing = [...missingBySigner.values()];
  const labels = missing.map(signerLabel);
  return {
    ok: false,
    message: `Every signer needs at least one field on each document. Still missing fields for:\n${labels.join('\n')}`,
    missingEmails: missing.map((s) => s.email),
  };
}
