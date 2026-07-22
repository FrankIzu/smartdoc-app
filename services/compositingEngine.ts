import * as FileSystem from 'expo-file-system/legacy';
import type { CompositingManifest, CompositingManifestDoc } from '../types/signature';
import { compositePagePath, readFileBase64 } from './signatureSessionCache';
import { makeIdempotencyKey } from './envelopeApi';

export interface CompositingParams {
  sessionKey: string;
  envelopeId: string;
  idempotencyKey?: string;
  docs: Array<{ documentKey: string; totalPages: number }>;
}

export function createManifest(params: CompositingParams): CompositingManifest {
  return {
    envelopeId: params.envelopeId,
    idempotencyKey: params.idempotencyKey ?? makeIdempotencyKey(),
    updatedAt: new Date().toISOString(),
    docs: params.docs.map(
      (d): CompositingManifestDoc => ({
        documentKey: d.documentKey,
        totalPages: d.totalPages,
        completedPages: 0,
        pageFileUris: [],
      }),
    ),
  };
}

export function getDocManifest(manifest: CompositingManifest, documentKey: string): CompositingManifestDoc | undefined {
  return manifest.docs.find((d) => d.documentKey === documentKey);
}

export async function writeCompositePage(
  sessionKey: string,
  manifest: CompositingManifest,
  documentKey: string,
  pageIndex: number,
  base64Jpeg: string,
): Promise<CompositingManifest> {
  const path = compositePagePath(sessionKey, documentKey, pageIndex);
  await FileSystem.writeAsStringAsync(path, base64Jpeg, { encoding: FileSystem.EncodingType.Base64 });
  const docs = manifest.docs.map((d) => {
    if (d.documentKey !== documentKey) return d;
    const pageFileUris = [...d.pageFileUris];
    pageFileUris[pageIndex] = path;
    return {
      ...d,
      pageFileUris,
      completedPages: Math.max(d.completedPages, pageIndex + 1),
    };
  });
  return { ...manifest, docs, updatedAt: new Date().toISOString() };
}

export async function finalizeManifest(manifest: CompositingManifest): Promise<Record<string, string[]>> {
  const docPages: Record<string, string[]> = {};
  for (const doc of manifest.docs) {
    const pages: string[] = [];
    for (let i = 0; i < doc.totalPages; i++) {
      const uri = doc.pageFileUris[i];
      if (!uri) continue;
      const b64 = await readFileBase64(uri);
      pages.push(`data:image/jpeg;base64,${b64}`);
    }
    if (pages.length) {
      docPages[doc.documentKey] = pages;
    }
  }
  return docPages;
}

export function nextPageToComposite(manifest: CompositingManifest): { docKey: string; pageIndex: number } | null {
  for (const doc of manifest.docs) {
    if (doc.completedPages < doc.totalPages) {
      return { docKey: doc.documentKey, pageIndex: doc.completedPages };
    }
  }
  return null;
}

export function isManifestComplete(manifest: CompositingManifest): boolean {
  if (manifest.docs.length === 0) return false;
  return manifest.docs.every((d) => d.totalPages > 0 && d.completedPages >= d.totalPages);
}

export function manifestMatchesFillableDocs(
  manifest: CompositingManifest,
  docs: Array<{ documentKey: string; totalPages: number }>,
): boolean {
  if (manifest.docs.length !== docs.length) return false;
  return docs.every((doc) => {
    const entry = manifest.docs.find((m) => m.documentKey === doc.documentKey);
    return !!entry && entry.totalPages === doc.totalPages;
  });
}

export function stripDataUrlPrefix(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/\w+;base64,/, '');
}
