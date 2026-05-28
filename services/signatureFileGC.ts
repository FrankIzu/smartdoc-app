import * as FileSystem from 'expo-file-system/legacy';
import { compositePagePath, signatureImagePath } from './signatureSessionCache';

export async function deleteFileIfExists(uri: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    // ignore
  }
}

export async function gcSessionFiles(sessionKey: string, fieldKeys: string[] = [], docKeys: string[] = []): Promise<void> {
  for (const fk of fieldKeys) {
    await deleteFileIfExists(signatureImagePath(sessionKey, fk));
  }
  for (const dk of docKeys) {
    for (let p = 0; p < 500; p++) {
      const path = compositePagePath(sessionKey, dk, p);
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) break;
      await deleteFileIfExists(path);
    }
  }
}

export async function gcOrphanSignatureCacheFiles(): Promise<void> {
  try {
    const dir = FileSystem.cacheDirectory;
    if (!dir) return;
    const entries = await FileSystem.readDirectoryAsync(dir);
    for (const name of entries) {
      if (name.startsWith('sig_')) {
        await deleteFileIfExists(`${dir}${name}`);
      }
    }
  } catch {
    // ignore
  }
}

export async function runSignatureGCOnLaunch(): Promise<void> {
  await gcOrphanSignatureCacheFiles();
}
