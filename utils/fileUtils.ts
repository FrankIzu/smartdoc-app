import { sanitizeDisplayFilename } from './displayFilename';

/**
 * Removes the file extension from a filename
 * @param filename - The filename to process
 * @returns The filename without extension
 */
export function removeFileExtension(filename: string): string {
  if (!filename) return '';

  const cleaned = sanitizeDisplayFilename(filename);
  const lastDotIndex = cleaned.lastIndexOf('.');
  if (lastDotIndex === -1 || lastDotIndex === 0) {
    // No extension found or filename starts with dot (hidden file)
    return cleaned;
  }

  return cleaned.substring(0, lastDotIndex);
}
