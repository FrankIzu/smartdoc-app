/**
 * Image Conversion Utility
 * Converts HEIC/HEIF images to PNG on the client side
 * This prevents server-side blocking and provides better UX
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

export interface FileUpload {
  uri: string;
  name: string;
  type: string;
  size?: number;
}

/**
 * Check if a file is HEIC/HEIF format
 */
export const isHeicFile = (file: FileUpload): boolean => {
  return (
    file.uri.toLowerCase().endsWith('.heic') ||
    file.uri.toLowerCase().endsWith('.heif') ||
    file.type?.toLowerCase().includes('heic') ||
    file.type?.toLowerCase().includes('heif') ||
    file.name.toLowerCase().endsWith('.heic') ||
    file.name.toLowerCase().endsWith('.heif')
  );
};

/**
 * Convert HEIC/HEIF images to PNG on the client side
 * @param file - The file to convert
 * @param onProgress - Optional progress callback (0-100)
 * @returns Converted file or original if not HEIC
 */
export const convertHeicToPng = async (
  file: FileUpload,
  onProgress?: (progress: number, message: string) => void
): Promise<FileUpload> => {
  try {
    // Check if file is HEIC/HEIF
    if (!isHeicFile(file)) {
      return file; // Not HEIC, return as-is
    }

    console.log(`🔄 Converting HEIC to PNG: ${file.name}`);
    onProgress?.(0, 'Converting HEIC to PNG...');

    // Convert HEIC to PNG using expo-image-manipulator
    const result = await ImageManipulator.manipulateAsync(
      file.uri,
      [], // No transformations needed, just format conversion
      {
        format: ImageManipulator.SaveFormat.PNG,
        compress: 0.9, // Slight compression to reduce file size
      }
    );

    onProgress?.(50, 'Conversion in progress...');

    // Get file info for the converted image
    const fileInfo = await FileSystem.getInfoAsync(result.uri);
    
    // Update filename to .png
    const baseName = file.name.replace(/\.(heic|heif)$/i, '');
    const newName = `${baseName}.png`;

    onProgress?.(100, 'Conversion complete');

    console.log(`✅ Converted HEIC to PNG: ${file.name} → ${newName}`);
    console.log(`   Original size: ${file.size || 'unknown'} bytes`);
    const convertedSize =
      fileInfo.exists && 'size' in fileInfo ? (fileInfo.size as number | undefined) : undefined;
    console.log(`   Converted size: ${convertedSize || 'unknown'} bytes`);

    return {
      uri: result.uri,
      name: newName,
      type: 'image/png',
      size: convertedSize || file.size,
    };
  } catch (error: any) {
    console.error('❌ HEIC conversion failed:', error);
    // If conversion fails, return original file and let server handle it
    console.warn('⚠️ Continuing with original HEIC file - server will convert it');
    return file;
  }
};

const isCompressibleImage = (file: FileUpload): boolean => {
  if (isHeicFile(file)) return false;
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif)$/i.test(file.name);
};

/**
 * Optionally compress images before upload when Compress Images is enabled.
 */
export const compressImageForUpload = async (
  file: FileUpload,
  enabled: boolean,
  onProgress?: (progress: number, message: string) => void,
): Promise<FileUpload> => {
  if (!enabled || !isCompressibleImage(file)) {
    return file;
  }

  try {
    onProgress?.(0, 'Compressing image...');
    const result = await ImageManipulator.manipulateAsync(
      file.uri,
      [{ resize: { width: 1920 } }],
      {
        compress: 0.72,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );
    onProgress?.(80, 'Compressing image...');
    const fileInfo = await FileSystem.getInfoAsync(result.uri);
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const newName = `${baseName}.jpg`;
    onProgress?.(100, 'Compression complete');
    return {
      uri: result.uri,
      name: newName,
      type: 'image/jpeg',
      size: fileInfo.exists && 'size' in fileInfo ? (fileInfo.size as number) : file.size,
    };
  } catch (error) {
    console.warn('⚠️ Image compression failed, uploading original:', error);
    return file;
  }
};
