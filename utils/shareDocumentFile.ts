import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert, Platform, Share } from 'react-native';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/Config';
import { apiClient } from '../services/api';
import { secureStorage } from './storage';

const SHARE_CLEANUP_MS = 10 * 60_000;

function mimeTypeFromExtension(extension: string): string {
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/_+/g, '_');
}

/** Ensure the cached share file has a real extension so Mail/Files recognize the attachment. */
function resolveShareFilename(rawName: string, fallbackExt = 'pdf'): { filename: string; extension: string } {
  const base = sanitizeFilename(rawName.trim() || 'document');
  const extMatch = base.match(/\.([a-z0-9]{2,8})$/i);
  if (extMatch) {
    return { filename: base, extension: extMatch[1].toLowerCase() };
  }
  const ext = fallbackExt.toLowerCase();
  return { filename: `${base}.${ext}`, extension: ext };
}

function downloadHeadersForUrl(url: string, token: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'X-Platform': Platform.OS };
  const urlIsSigned = url.includes('sig=') && url.includes('exp=');
  if (!urlIsSigned && token && url.startsWith(API_BASE_URL)) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function readLocalFileHeadBytes(uri: string, byteLength: number): Promise<Uint8Array | null> {
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      length: byteLength,
      position: 0,
    });
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function inferMimeFromMagic(bytes: Uint8Array | null): string | null {
  if (!bytes || bytes.length < 4) return null;
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf';
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return 'application/zip';
  }
  return null;
}

function looksLikeErrorPayload(bytes: Uint8Array | null): boolean {
  if (!bytes || bytes.length < 1) return true;
  const first = bytes[0];
  return first === 0x3c || first === 0x7b; // HTML or JSON error body
}

async function presentShareSheet(localUri: string, shareMime: string, displayName: string): Promise<void> {
  const sharingAvailable = await Sharing.isAvailableAsync();
  if (sharingAvailable) {
    try {
      await Sharing.shareAsync(localUri, {
        mimeType: shareMime,
        dialogTitle: `Share ${displayName}`,
      });
      return;
    } catch {
      try {
        await Sharing.shareAsync(localUri, {
          dialogTitle: `Share ${displayName}`,
        });
        return;
      } catch {
        // fall through to platform Share API
      }
    }
  }

  if (Platform.OS === 'ios') {
    const fileUrl = localUri.startsWith('file://') ? localUri : `file://${localUri.replace(/^\/+/, '')}`;
    await Share.share({
      title: displayName,
      url: fileUrl,
    });
    return;
  }

  if (Platform.OS === 'android') {
    await Share.share({
      title: displayName,
      message: displayName,
      url: localUri,
    });
    return;
  }

  Alert.alert('Share', localUri);
}

function scheduleShareFileCleanup(uri: string) {
  setTimeout(() => {
    void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }, SHARE_CLEANUP_MS);
}

/** Download a file and open the native share sheet with a valid local attachment. */
export async function shareDocumentFile(
  fileId: number | string,
  displayName: string,
  opts?: { fallbackExtension?: string },
): Promise<void> {
  const fileInfo = await apiClient.downloadFile(Number(fileId));
  if (!fileInfo.url) {
    throw new Error('Failed to get file download URL');
  }

  const { filename, extension } = resolveShareFilename(
    fileInfo.filename || displayName,
    opts?.fallbackExtension ?? 'pdf',
  );

  const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!cacheDir) {
    throw new Error('Unable to access file system directories');
  }

  const fileUri = `${cacheDir}share_${Date.now()}_${fileId}_${filename}`;

  let token: string | null = null;
  try {
    token = await secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  } catch {
    token = null;
  }

  const downloadResult = await FileSystem.downloadAsync(fileInfo.url, fileUri, {
    headers: downloadHeadersForUrl(fileInfo.url, token),
  });

  if (downloadResult.status < 200 || downloadResult.status >= 300) {
    await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true }).catch(() => {});
    throw new Error(`Download failed (HTTP ${downloadResult.status}). Try again.`);
  }

  const localInfo = await FileSystem.getInfoAsync(downloadResult.uri);
  if (!localInfo.exists || !('size' in localInfo) || !localInfo.size || localInfo.size < 1) {
    await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true }).catch(() => {});
    throw new Error('Downloaded file is empty. Try again.');
  }

  const magicBytes = await readLocalFileHeadBytes(downloadResult.uri, 16);
  if (looksLikeErrorPayload(magicBytes)) {
    await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true }).catch(() => {});
    throw new Error('Could not download this file for sharing. Try again.');
  }

  const shareMime = inferMimeFromMagic(magicBytes) ?? mimeTypeFromExtension(extension);
  await presentShareSheet(downloadResult.uri, shareMime, displayName);
  scheduleShareFileCleanup(downloadResult.uri);
}
