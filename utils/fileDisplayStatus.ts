/**
 * Normalize file processing_status for UI display.
 * Once file_kind is assigned, background indexing 'processing' is shown as complete
 * (matches web Files page). User-triggered retries stay on 'processing'.
 */

export type DocumentListStatus = 'processed' | 'processing' | 'pending' | 'error';

export interface FileWithProcessingFields {
  id?: number | string;
  file_kind?: string | null;
  processing_status?: string;
}

export function isFileKindPending(fileKind?: string | null): boolean {
  const kind = (fileKind || '').toLowerCase();
  return !fileKind || kind === '' || kind === 'pending';
}

export function cleanupReprocessingTracking(
  file: FileWithProcessingFields,
  reprocessingIds: Set<number>
): void {
  const id = typeof file.id === 'number' ? file.id : Number(file.id);
  if (!Number.isFinite(id) || !reprocessingIds.has(id)) return;

  const status = (file.processing_status || '').toLowerCase();
  if (status === 'failed' || status === 'error') {
    reprocessingIds.delete(id);
    return;
  }
  if (status !== 'processing' && status !== 'pending') {
    reprocessingIds.delete(id);
  }
}

export function normalizeFileProcessingStatusForDisplay<T extends FileWithProcessingFields>(
  file: T,
  options?: { isUserReprocessing?: boolean }
): T {
  const kindLower = (file.file_kind || '').toLowerCase();
  const hasRealKind = !!file.file_kind && kindLower !== 'pending' && kindLower !== '';
  const isUserReprocessing = options?.isUserReprocessing ?? false;

  if (hasRealKind) {
    if (
      file.processing_status === 'pending' ||
      (file.processing_status === 'processing' && !isUserReprocessing)
    ) {
      return { ...file, processing_status: 'complete' };
    }
  }
  return file;
}

export function normalizeFilesForDisplay<T extends FileWithProcessingFields>(
  files: T[],
  reprocessingIds?: Set<number>
): T[] {
  return files.map((file) => {
    if (reprocessingIds) {
      cleanupReprocessingTracking(file, reprocessingIds);
    }
    const id = typeof file.id === 'number' ? file.id : Number(file.id);
    const isUserReprocessing =
      Number.isFinite(id) && (reprocessingIds?.has(id) ?? false);
    return normalizeFileProcessingStatusForDisplay(file, { isUserReprocessing });
  });
}

/** Map API file row → list row status (spinner only while classifying). */
export function resolveDocumentListStatus(
  doc: FileWithProcessingFields,
  options?: { isUserReprocessing?: boolean }
): DocumentListStatus {
  const ps = (doc.processing_status || '').toLowerCase();
  if (ps === 'error' || ps === 'failed') return 'error';

  if (isFileKindPending(doc.file_kind)) return 'pending';

  if (
    (ps === 'pending' || ps === 'processing') &&
    options?.isUserReprocessing
  ) {
    return 'processing';
  }

  return 'processed';
}

/** True when classification polling should continue for this row. */
export function docNeedsClassificationPollFromRow(
  doc: {
    file_kind?: string | null;
    json_data?: unknown;
  },
  options?: { useFolderMode?: boolean }
): boolean {
  if (isFileKindPending(doc.file_kind)) return true;
  if (options?.useFolderMode) return false;
  const kind = doc.file_kind?.toLowerCase();
  if (kind === 'receipt' || kind === 'invoice') {
    return !doc.json_data;
  }
  return false;
}
