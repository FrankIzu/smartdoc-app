import type {
  Envelope,
  EnvelopeDocument,
  EnvelopeFieldAssignment,
  NormalizedSignerSession,
  ReplaceDocumentsInput,
  RuntimeDocument,
  RuntimeField,
  SignerSessionPayload,
  SignerSourcePayload,
  WizardField,
  WizardSourceDraft,
  WizardStep,
} from '../types/signature';
import { makeFieldKey } from './fieldKeys';

function wizardFieldToRuntime(f: WizardField, assignment?: EnvelopeFieldAssignment): RuntimeField {
  return Object.freeze({
    key: makeFieldKey(f.id, f.rev ?? 1),
    type: f.type,
    label: f.label || f.id,
    required: f.required ?? false,
    assignedRecipientId: assignment?.recipient_id,
    rect:
      f.page != null && f.x != null && f.y != null && f.w != null && f.h != null
        ? Object.freeze({ page: f.page, x: f.x, y: f.y, w: f.w, h: f.h })
        : undefined,
  });
}

function formFieldsFromJson(jsonFields: unknown): WizardField[] {
  if (!jsonFields || typeof jsonFields !== 'object') return [];
  const o = jsonFields as Record<string, unknown>;
  const fields = Array.isArray(o.fields) ? o.fields : Array.isArray(jsonFields) ? jsonFields : [];
  return fields
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .map((f) => ({
      id: String(f.id ?? f.name ?? ''),
      rev: typeof f.rev === 'number' ? f.rev : 1,
      type: String(f.type ?? 'text'),
      label: String(f.label ?? f.name ?? f.id ?? ''),
      required: Boolean(f.required),
      page: typeof f.page === 'number' ? f.page : undefined,
      x: typeof f.x === 'number' ? f.x : undefined,
      y: typeof f.y === 'number' ? f.y : undefined,
      w: typeof f.w === 'number' ? f.w : undefined,
      h: typeof f.h === 'number' ? f.h : undefined,
    }))
    .filter((f) => f.id);
}

function buildCapabilities(
  source: SignerSourcePayload,
  isMyTurn: boolean,
  editableKeys: ReadonlySet<string>,
  hasSignFields: boolean,
): RuntimeDocument['capabilities'] {
  const interactive = source.interactive !== false;
  return Object.freeze({
    canEdit: interactive && isMyTurn,
    canSign: interactive && isMyTurn && hasSignFields,
    canInitial: interactive && isMyTurn && hasSignFields,
    canViewAttachments: source.source_type === 'attachment' || !interactive,
  });
}

function normalizeSourceDocument(
  source: SignerSourcePayload,
  assignments: EnvelopeFieldAssignment[],
  isMyTurn: boolean,
  editableKeys: ReadonlySet<string>,
): RuntimeDocument {
  const documentId = source.document_id ?? 0;
  const assignmentMap = new Map(
    assignments.filter((a) => !a.document_id || a.document_id === documentId).map((a) => [a.field_key, a]),
  );

  let templateFields: WizardField[] = [];
  if (source.source_type === 'fillable' && Array.isArray(source.template_fields)) {
    templateFields = source.template_fields;
  } else if (source.source_type === 'form') {
    templateFields = formFieldsFromJson(source.json_fields);
  }

  const fields: RuntimeField[] = templateFields.map((f) =>
    wizardFieldToRuntime(f, assignmentMap.get(makeFieldKey(f.id, f.rev ?? 1))),
  );

  const hasSignFields = fields.some((f) => f.type === 'signature' || f.type === 'initials');
  const interactive = source.interactive !== false;
  const pages = (source.page_images ?? []).map((imageUrl, index) =>
    Object.freeze({ index, imageUrl }),
  );

  return Object.freeze({
    documentId,
    documentKey: source.document_key,
    sourceType: source.source_type,
    title: source.display_name || source.document_key,
    pages: Object.freeze(pages),
    fields: Object.freeze(fields),
    interactive,
    requiresAssignment: source.source_type !== 'attachment' && fields.length > 0,
    capabilities: buildCapabilities(source, isMyTurn, editableKeys, hasSignFields),
    metadata: Object.freeze({
      templateId: undefined,
      formId: undefined,
      fileId: undefined,
    }),
  });
}

export function normalizeSignerPayload(
  envelopeId: string,
  payload: SignerSessionPayload,
): NormalizedSignerSession {
  const editableFieldKeys = new Set(payload.editable_field_keys ?? []);
  const isMyTurn = payload.is_my_turn !== false;
  const assignments = payload.field_assignments ?? payload.envelope?.field_assignments ?? [];
  const sources = payload.sources ?? [];

  const documents = Object.freeze(
    sources.map((s) => normalizeSourceDocument(s, assignments, isMyTurn, editableFieldKeys)),
  );

  return Object.freeze({
    envelopeId,
    envelopeTitle: payload.envelope?.title ?? 'Signature request',
    documents,
    isMyTurn,
    editableFieldKeys,
    sessionGeneratedAtRevision:
      payload.session_generated_at_revision ?? payload.envelope_revision ?? 1,
    envelopeRevision: payload.envelope_revision ?? payload.envelope?.envelope_revision ?? 1,
    chain: payload.chain,
    recipientId: payload.recipient?.id ?? payload.envelope?.inbox_context?.recipient_id,
    phoneVerificationRequired: Boolean(payload.phone_verification_required),
    phoneMasked: payload.phone_masked ?? null,
    phoneVerified: Boolean(payload.phone_verified),
  });
}

export function resolveWizardStepFromEnvelope(envelope: Envelope): WizardStep {
  if (envelope.status !== 'draft') return 'review';
  const docs = envelope.documents ?? [];
  if (docs.length === 0) return 'add_documents';
  const recipients = envelope.recipients?.filter((r) => r.role === 'signer') ?? [];
  if (recipients.length === 0) return 'recipients';
  const assignments = envelope.field_assignments ?? [];
  const hasInteractive = docs.some((d) => d.source_type !== 'attachment');
  if (hasInteractive && assignments.length === 0) return 'assign_fields';
  return 'review';
}

export function envelopeDisplayId(envelope: Envelope): string {
  return envelope.public_id?.trim() || String(envelope.id);
}

export function documentRequiresPrepare(doc: EnvelopeDocument): boolean {
  return doc.source_type === 'fillable';
}

export function fieldImageUri(val: unknown): string | null {
  if (!val || typeof val !== 'object') return null;
  const o = val as Record<string, unknown>;
  if (typeof o.imageUri === 'string') return o.imageUri;
  if (typeof o.image === 'string') return o.image;
  return null;
}

export function hasFieldSignature(val: unknown): boolean {
  return fieldImageUri(val) != null;
}

export function envelopeDocsToWizardSources(docs: EnvelopeDocument[]): WizardSourceDraft[] {
  return docs.map((d) => ({
    localId: `doc_${d.id}`,
    source_type: d.source_type,
    fillable_template_id: d.fillable_template_id ?? undefined,
    user_form_id: d.user_form_id ?? undefined,
    file_id: d.attachment_source_file_id ?? d.attachment_snapshot_file_id ?? undefined,
    display_name: d.display_name,
  }));
}

export function wizardSourcesToReplaceDocuments(
  sources: WizardSourceDraft[],
  existingDocs?: EnvelopeDocument[],
): ReplaceDocumentsInput[] {
  return sources.map((s, i) => {
    const existing = existingDocs?.[i];
    const row: ReplaceDocumentsInput = {
      order_index: i,
      source_type: s.source_type,
    };
    if (existing?.id) row.id = existing.id;
    if (s.source_type === 'fillable') row.fillable_template_id = s.fillable_template_id;
    if (s.source_type === 'form') row.user_form_id = s.user_form_id;
    if (s.source_type === 'attachment') row.file_id = s.file_id;
    return row;
  });
}
