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
    console.log(`   Converted size: ${fileInfo.size || 'unknown'} bytes`);

    return {
      uri: result.uri,
      name: newName,
      type: 'image/png',
      size: fileInfo.size || file.size,
    };
  } catch (error: any) {
    console.error('❌ HEIC conversion failed:', error);
    // If conversion fails, return original file and let server handle it
    console.warn('⚠️ Continuing with original HEIC file - server will convert it');
    return file;
  }
};
