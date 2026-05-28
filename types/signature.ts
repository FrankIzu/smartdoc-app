/**
 * Signature envelope types — aligned with web frontend/src/types/signature.ts
 * and backend signature_envelope_engine.py.
 */

export type FieldType = 'signature' | 'initials' | 'date' | 'text' | 'checkbox';

export type EnvelopeStatus =
  | 'draft'
  | 'sent'
  | 'in_progress'
  | 'completed'
  | 'declined'
  | 'voided'
  | 'expired';

export type RecipientRole = 'signer' | 'cc';

export type EnvelopeDocumentStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

export type DocumentSourceType = 'fillable' | 'form' | 'attachment';

export type DocumentRole = 'signer_document' | 'reference' | string;

export interface WizardField {
  id: string;
  /** Server-assigned revision. Omitted on create (backend assigns). */
  rev?: number;
  type: FieldType | string;
  label: string;
  required: boolean;
  page?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** Soft-delete flag. When true, field is excluded from live editor but sent in PATCH payload. */
  deleted?: boolean;
  /** Local-only: last interaction timestamp for z-index bump. Not persisted. */
  lastTouchedAt?: number;
}

export interface EnvelopeRecipient {
  id: number;
  envelope_id: number;
  order_index: number;
  role: RecipientRole;
  email: string;
  name?: string | null;
  user_id?: number | null;
  auth_required?: boolean;
  status: string;
  notified_at?: string | null;
  viewed_at?: string | null;
  signed_at?: string | null;
  decline_reason?: string | null;
  last_delivery_error?: string | null;
}

export interface EnvelopeAuditEvent {
  id: number;
  event_seq: number;
  event_type: string;
  recipient_id?: number | null;
  actor_user_id?: number | null;
  actor_email?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  meta_json?: Record<string, unknown> | null;
  created_at: string;
}

export interface EnvelopeFieldAssignment {
  id: number;
  envelope_id: number;
  document_id?: number | null;
  recipient_id: number;
  field_key: string;
  field_type: string;
  required: boolean;
  prefill_value?: unknown;
  draft_value_json?: unknown;
  draft_saved_at?: string | null;
  signed_value_json?: unknown;
  signed_at?: string | null;
}

export interface EnvelopeDocument {
  id: number;
  document_key: string;
  order_index: number;
  source_type: DocumentSourceType;
  display_name: string;
  status: EnvelopeDocumentStatus;
  fillable_template_id?: number | null;
  user_form_id?: number | null;
  attachment_source_file_id?: number | null;
  attachment_snapshot_file_id?: number | null;
  source_snapshot_id?: number | null;
  final_file_id?: number | null;
  created_at?: string | null;
  interactive?: boolean;
  document_role?: DocumentRole;
  page_images?: string[];
  page_count?: number;
  template_fields?: WizardField[];
  json_fields?: unknown;
  settings?: Record<string, unknown>;
}

export interface EnvelopeInboxContext {
  recipient_id: number;
  can_sign: boolean;
  is_my_turn: boolean;
}

export interface EnvelopeSignerProgress {
  signed: number;
  total: number;
}

export interface Envelope {
  id: number;
  public_id?: string;
  inbox_context?: EnvelopeInboxContext;
  signer_progress?: EnvelopeSignerProgress;
  company_id?: number;
  created_by_user_id?: number;
  title: string;
  message?: string | null;
  status: EnvelopeStatus;
  /** LEGACY list field — prefer documents[] for new code. */
  source_type?: 'fillable' | 'form' | null;
  envelope_revision?: number;
  reminder_enabled?: boolean;
  reminder_first_after_hours?: number;
  reminder_repeat_every_hours?: number;
  reminder_max_count?: number;
  expires_at?: string | null;
  sent_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  recipients?: EnvelopeRecipient[];
  field_assignments?: EnvelopeFieldAssignment[];
  documents?: EnvelopeDocument[];
  final_file_id?: number | null;
  merged_final_file_id?: number | null;
  certificate_file_id?: number | null;
  audit_file_id?: number | null;
  events?: EnvelopeAuditEvent[];
}

export interface SourceInput {
  source_type: DocumentSourceType;
  fillable_template_id?: number;
  user_form_id?: number;
  file_id?: number;
}

export interface CreateEnvelopeArgs {
  sources?: SourceInput[];
  title?: string;
  message?: string;
  reminder_enabled?: boolean;
  reminder_first_after_hours?: number;
  reminder_repeat_every_hours?: number;
  reminder_max_count?: number;
  expires_at?: string | null;
}

export interface RecipientInput {
  email: string;
  name?: string;
  role?: RecipientRole;
  order_index?: number;
  auth_required?: boolean;
}

export interface FieldAssignmentInput {
  recipient_id: number;
  document_id?: number;
  field_key: string;
  field_type?: string;
  required?: boolean;
  prefill_value?: unknown;
}

export interface SignerSourcePayload {
  document_key: string;
  document_id?: number;
  source_type: DocumentSourceType;
  display_name?: string;
  interactive?: boolean;
  document_role?: string;
  page_images?: string[];
  template_fields?: WizardField[];
  json_fields?: unknown;
  settings?: Record<string, unknown>;
}

export interface SignerSessionPayload {
  success?: boolean;
  envelope?: Envelope;
  sources?: SignerSourcePayload[];
  is_my_turn?: boolean;
  editable_field_keys?: string[];
  session_generated_at_revision?: number;
  envelope_revision?: number;
  chain?: {
    position?: number;
    total?: number;
    before?: Array<{ name?: string; email?: string }>;
    after?: Array<{ name?: string; email?: string }>;
  };
  recipient?: EnvelopeRecipient;
  field_assignments?: EnvelopeFieldAssignment[];
}

export type WizardStep =
  | 'add_documents'
  | 'prepare'
  | 'recipients'
  | 'assign_fields'
  | 'review';

export interface WizardSourceDraft {
  localId: string;
  source_type: DocumentSourceType;
  fillable_template_id?: number;
  user_form_id?: number;
  file_id?: number;
  display_name?: string;
  needsPrepare?: boolean;
}

export type SessionState =
  | 'initializing'
  | 'hydrating'
  | 'checking_submission'
  | 'active'
  | 'autosaving'
  | 'offline_dirty'
  | 'compositing'
  | 'uploading'
  | 'awaiting_server'
  | 'conflict_409'
  | 'completed'
  | 'declined';

export interface ReplaceDocumentsInput {
  id?: number;
  order_index?: number;
  source_type: DocumentSourceType;
  fillable_template_id?: number;
  user_form_id?: number;
  file_id?: number;
}

export interface CompositingManifestDoc {
  documentKey: string;
  totalPages: number;
  completedPages: number;
  pageFileUris: string[];
}

export interface CompositingManifest {
  envelopeId: string;
  idempotencyKey: string;
  docs: CompositingManifestDoc[];
  updatedAt?: string;
}

export interface PendingSubmission {
  envelopeId: string;
  idempotencyKey: string;
  step: 'compositing' | 'uploading';
  manifest: CompositingManifest;
  lastCompletedOp?: { docKey: string; pageIndex: number };
  startedAt: string;
}

export interface RuntimeField {
  readonly key: string;
  readonly type: string;
  readonly label: string;
  readonly required: boolean;
  readonly assignedRecipientId?: number;
  readonly rect?: { page: number; x: number; y: number; w: number; h: number };
  readonly schema?: unknown;
  readonly visibility?: {
    visibleIf?: unknown;
    readonlyIf?: unknown;
    requiredIf?: unknown;
  };
}

export interface RuntimePage {
  readonly index: number;
  readonly imageUrl: string;
}

export interface RuntimeDocumentCapabilities {
  readonly canEdit: boolean;
  readonly canSign: boolean;
  readonly canInitial: boolean;
  readonly canViewAttachments: boolean;
}

export interface RuntimeDocument {
  readonly documentId: number;
  readonly documentKey: string;
  readonly sourceType: DocumentSourceType;
  readonly title: string;
  readonly pages: readonly RuntimePage[];
  readonly fields: readonly RuntimeField[];
  readonly interactive: boolean;
  readonly requiresAssignment: boolean;
  readonly capabilities: RuntimeDocumentCapabilities;
  readonly metadata: {
    templateId?: number;
    formId?: number;
    fileId?: number;
  };
}

export interface NormalizedSignerSession {
  readonly envelopeId: string;
  readonly envelopeTitle: string;
  readonly documents: readonly RuntimeDocument[];
  readonly isMyTurn: boolean;
  readonly editableFieldKeys: ReadonlySet<string>;
  readonly sessionGeneratedAtRevision: number;
  readonly envelopeRevision: number;
  readonly chain?: SignerSessionPayload['chain'];
  readonly recipientId?: number;
}
