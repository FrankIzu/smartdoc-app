import { apiService } from './api';
import { ensureFillableTemplateReady } from './fillableApi';
import { sanitizeDisplayFilename } from '../utils/displayFilename';
import { useProgressStore } from './progressService';

export function extractUploadedFileId(upload: unknown): number | undefined {
  const u = upload as {
    file?: { id?: number };
    data?: { file?: { id?: number } };
    uploaded_files?: Array<{ id?: number }>;
  };
  if (u.file?.id) return u.file.id;
  if (u.data?.file?.id) return u.data.file.id;
  if (Array.isArray(u.uploaded_files) && u.uploaded_files[0]?.id) return u.uploaded_files[0].id;
  return undefined;
}

/** Resolve file id from upload response (direct id, progress payload, or files list lookup). */
export async function resolveUploadedFileId(
  upload: unknown,
  filename?: string,
  uploadStartedAt?: number,
): Promise<number | undefined> {
  const direct = extractUploadedFileId(upload);
  if (direct) return direct;

  const fromProgress = apiService.extractFileIdFromUploadProgress(upload, filename);
  if (fromProgress) return fromProgress;

  if (!filename?.trim()) return undefined;
  return apiService.lookupUploadedFileByName(filename, 90000, uploadStartedAt);
}

/** Upload with the top global progress bar; returns response with file.id when ready. */
export async function uploadFormDataWithGlobalProgress(
  formData: FormData,
  filename: string,
) {
  const uploadStartedAt = Date.now();
  const progressStore = useProgressStore.getState();
  const progressId = progressStore.addProgress({
    title: `Uploading ${filename}`,
    progress: 0,
    status: 'in-progress',
    message: 'Preparing upload...',
  });

  const scheduleRemove = (delayMs: number) => {
    setTimeout(() => progressStore.removeProgress(progressId), delayMs);
  };

  try {
    const response = await apiService.uploadFileWithProgressPolling(
      formData,
      (progress, message) => {
        progressStore.updateProgress(progressId, {
          ...(typeof progress === 'number' ? { progress } : {}),
          status: 'in-progress',
          message:
            message ||
            (typeof progress === 'number' ? `Uploading... ${Math.round(progress)}%` : 'Uploading...'),
        });
      },
      { filename, uploadStartedAt },
    );

    let fileId = extractUploadedFileId(response);
    if (!fileId && filename) {
      progressStore.updateProgress(progressId, {
        status: 'in-progress',
        message: 'Preparing document for signature...',
      });
      fileId = await resolveUploadedFileId(response, filename, uploadStartedAt);
    }

    if (fileId && !(response as { file?: { id?: number } }).file?.id) {
      (response as { file?: { id: number } }).file = { id: fileId };
    }

    progressStore.updateProgress(progressId, {
      progress: 100,
      status: 'completed',
      message: 'Ready for signature',
    });
    scheduleRemove(3000);
    return response;
  } catch (error) {
    progressStore.updateProgress(progressId, {
      status: 'error',
      message: error instanceof Error ? error.message : 'Upload failed',
    });
    scheduleRemove(5000);
    throw error;
  }
}

/** Upload a PDF and create a fillable template ready for the prepare-fields step. */
export async function uploadPdfForSignature(
  asset: { uri: string; name?: string | null; mimeType?: string | null },
): Promise<{ fileId: number; templateId: number; displayName: string }> {
  const displayName = sanitizeDisplayFilename(asset.name || 'Document');
  const filename = displayName;

  const formData = new FormData();
  formData.append('file', {
    uri: asset.uri,
    name: filename,
    type: asset.mimeType || 'application/octet-stream',
  } as unknown as Blob);
  formData.append('for_fillable_template', '1');

  const upload = await uploadFormDataWithGlobalProgress(formData as FormData, filename);
  const fileId = await resolveUploadedFileId(upload, filename);
  if (!fileId) {
    throw new Error('Upload finished but the document is not ready yet. Wait a moment and try again.');
  }

  const { templateId } = await ensureFillableTemplateReady(fileId, displayName);
  return { fileId, templateId, displayName };
}
