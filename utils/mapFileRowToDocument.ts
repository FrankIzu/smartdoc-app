import type { FileRowModel } from '../types/folder';
import { removeFileExtension } from './fileUtils';

export interface MappedDocumentRow {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadDate: Date;
  status: 'processed' | 'processing' | 'pending' | 'error';
  tags: string[];
  category?: string;
  file_kind?: string;
  original_filename?: string;
  user_id?: number;
  in_locked_bookmark?: boolean;
}

function formatFileSize(bytes?: number): string {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileTypeFromExtension(filename?: string): string {
  const name = filename || '';
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : '';
  return ext || 'file';
}

export function mapFileRowToDocument(doc: FileRowModel): MappedDocumentRow {
  const originalName = doc.original_filename || doc.filename || 'Untitled';
  const isPending =
    doc.file_kind?.toLowerCase() === 'pending' ||
    doc.processing_status === 'pending' ||
    doc.processing_status === 'processing';
  const status = isPending
    ? 'pending'
    : doc.processing_status === 'error'
      ? 'error'
      : 'processed';

  return {
    id: String(doc.id),
    name: removeFileExtension(originalName),
    type: getFileTypeFromExtension(originalName),
    size: formatFileSize(doc.file_size),
    uploadDate: new Date(doc.created_at || Date.now()),
    status,
    tags: [],
    file_kind: doc.file_kind,
    original_filename: originalName,
    in_locked_bookmark: doc.in_locked_bookmark,
  };
}
