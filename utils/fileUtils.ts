/**
 * Removes the file extension from a filename
 * @param filename - The filename to process
 * @returns The filename without extension
 */
export function removeFileExtension(filename: string): string {
  if (!filename) return '';
  
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1 || lastDotIndex === 0) {
    // No extension found or filename starts with dot (hidden file)
    return filename;
  }
  
  return filename.substring(0, lastDotIndex);
}
