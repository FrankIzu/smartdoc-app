import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Alert, Platform } from 'react-native';
import { create } from 'zustand';
import { apiService } from '../services/api';
import { FileState, FileUpload, UploadProgress } from '../types';
import { convertHeicToPng, isHeicFile } from '../utils/imageConversion';

// Check if running in Expo Go (which doesn't support custom native modules/plugins)
const isExpoGo = Constants.executionEnvironment === 'storeClient';

// Optimistic pending file item (shown before API confirms upload)
export interface OptimisticPendingFile {
  optimisticId: string; // Temporary ID like "optimistic_1234567890"
  uri: string;
  name: string;
  type: string;
  size?: number;
  uploadStartTime: number;
  status: 'pending' | 'uploading' | 'error';
  error?: string;
}

interface FileStore extends FileState {
  // Global state
  isDocumentPickerOpen: boolean;
  isImagePickerOpen: boolean;
  lastUploadTime: number; // Track when upload happened for immediate refresh
  optimisticPendingFiles: OptimisticPendingFile[]; // Files shown immediately before API confirms
  
  // Actions
  fetchFiles: (page?: number, search?: string, category?: string) => Promise<void>;
  uploadFiles: (files: FileUpload[]) => Promise<boolean>;
  uploadFromCamera: () => Promise<boolean>;
  uploadFromGallery: () => Promise<boolean>;
  uploadFromDocuments: () => Promise<boolean>;
  deleteFile: (id: number) => Promise<boolean>;
  categorizeFile: (id: number, category: string) => Promise<boolean>;
  autoCategorizeFile: (id: number) => Promise<boolean>;
  downloadFile: (id: number) => Promise<string | null>;
  clearError: () => void;
  updateUploadProgress: (fileId: string, progress: Partial<UploadProgress>) => void;
  removeUploadProgress: (fileId: string) => void;
  setDocumentPickerOpen: (isOpen: boolean) => void;
  resetDocumentPicker: () => void;
  forceResetDocumentPicker: () => Promise<void>;
  setImagePickerOpen: (isOpen: boolean) => void;
  resetImagePicker: () => void;
  setLastUploadTime: (timestamp: number) => void;
  addOptimisticPendingFile: (file: FileUpload) => string; // Returns optimisticId
  removeOptimisticPendingFile: (optimisticId: string) => void;
  updateOptimisticPendingFile: (optimisticId: string, updates: Partial<OptimisticPendingFile>) => void;
}

export const useFileStore = create<FileStore>((set, get) => ({
  // Initial state
  files: [],
  isLoading: false,
  error: null,
  uploadProgress: {},
  isDocumentPickerOpen: false,
  isImagePickerOpen: false,
  lastUploadTime: 0, // Track when upload happened for immediate refresh
  optimisticPendingFiles: [], // Files shown immediately before API confirms

  // Actions
  fetchFiles: async (page = 1, search?, category?) => {
    set({ isLoading: true, error: null });
    
    try {
      const response = await apiService.getFiles(page, 20, search, category);
      
      if (response.success && response.data) {
        const newFiles = response.data;
        const currentFiles = get().files;
        
        // If it's the first page, replace all files
        // Otherwise, append to existing files (pagination)
        const updatedFiles = page === 1 ? newFiles : [...currentFiles, ...newFiles];
        
        set({
          files: updatedFiles,
          isLoading: false,
          error: null,
        });
      } else {
        set({
          isLoading: false,
          error: response.message || 'Failed to fetch files',
        });
      }
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.message || 'Failed to fetch files',
      });
    }
  },

  uploadFiles: async (files: FileUpload[]) => {
    if (files.length === 0) return false;
    
    let allSuccessful = true;
    
    // Import the progress store
    const { useProgressStore } = require('../services/progressService');
    const progressStore = useProgressStore.getState();
    
    for (const file of files) {
      const fileId = `upload_${Date.now()}_${Math.random()}`;
      
        // Initialize global progress bar
        const progressId = progressStore.addProgress({
          title: `Uploading ${file.name}`,
          progress: 0,
          status: 'pending',
          message: 'Preparing upload...',
        });
        
        console.log('📊 Created progress item with ID:', progressId);
        
        // Ensure progress bar is visible
        progressStore.showProgress();
      
      // Also keep the old progress system for backward compatibility
      get().updateUploadProgress(fileId, {
        fileId,
        progress: 0,
        status: 'uploading',
      });
      
      try {
        // Convert HEIC to PNG before upload if needed
        // This happens here as a fallback in case conversion wasn't done earlier
        let fileToUpload = file;

        if (isHeicFile(file)) {
          console.log(`🔄 Converting HEIC to PNG before upload: ${file.name}`);
          progressStore.updateProgress(progressId, {
            progress: 5,
            status: 'in-progress',
            message: 'Converting HEIC to PNG...',
          });

          fileToUpload = await convertHeicToPng(
            file,
            (progress, message) => {
              // Scale conversion progress to 5-15% of total upload
              const scaledProgress = 5 + (progress * 0.1);
              progressStore.updateProgress(progressId, {
                progress: scaledProgress,
                status: 'in-progress',
                message,
              });
            }
          );

          progressStore.updateProgress(progressId, {
            progress: 15,
            status: 'in-progress',
            message: 'Starting upload...',
          });
        }

        // Prepare FormData for upload
        // In React Native/Expo, FormData needs specific format
        const formData = new FormData();
        
        // Log file details for debugging
        console.log('📤 Preparing upload:', {
          uri: fileToUpload.uri,
          type: fileToUpload.type,
          name: fileToUpload.name,
          size: fileToUpload.size,
          isExpoGo,
        });
        
        // Check if URI is valid (should start with file://, content://, or http://)
        if (!fileToUpload.uri || (!fileToUpload.uri.startsWith('file://') && 
            !fileToUpload.uri.startsWith('content://') && 
            !fileToUpload.uri.startsWith('http://') &&
            !fileToUpload.uri.startsWith('https://'))) {
          throw new Error(`Invalid file URI: ${fileToUpload.uri}`);
        }
        
        // Format for React Native FormData
        formData.append('file', {
          uri: fileToUpload.uri,
          type: fileToUpload.type || 'image/jpeg',
          name: fileToUpload.name || `image_${Date.now()}.jpg`,
        } as any);
        
        console.log('📤 FormData created, starting upload...');
        
        const response = await apiService.uploadFileWithProgressPolling(
          formData,
          (progress, message, phase) => {
            console.log(`📊 Upload progress: ${progress}% for ${file.name} - ${message} (${phase})`);
            
            // Update global progress bar with detailed progress
            progressStore.updateProgress(progressId, {
              progress: progress,
              status: 'in-progress',
              message: message || `Uploading... ${progress}%`,
            });
            
            console.log(`📊 Updated global progress bar for ${progressId}`);
            
            // Also update the old progress system
            get().updateUploadProgress(fileId, { progress });
          }
        );
        
        console.log('📁 Upload response in file store:', response);
        console.log('📁 Response success:', response.success);
        console.log('📁 Response data:', response.data);
        console.log('📁 Response message:', response.message);
        
        if (response.success) {
          // For mobile uploads, the response.data might be undefined initially
          // The progress polling will handle the completion status
          console.log('📁 Upload successful - task_id:', (response as any).task_id);
          
          // The progress polling already updated the progress to completed
          // Just ensure the progress shows as completed
          progressStore.updateProgress(progressId, {
            progress: 100,
            status: 'completed',
          });
          
          // Update old progress system
          get().updateUploadProgress(fileId, {
            progress: 100,
            status: 'completed',
          });
          
          // For mobile uploads, immediately reload files to show them with 'pending' status
          // This matches the web behavior where files appear quickly with pending status
          console.log('📁 Upload complete, immediately reloading files to show pending status...');
          
          // Mark upload time for Files screen to bypass debounce
          set({ lastUploadTime: Date.now() });
          
          // Reload immediately (no delay) to show files with pending status
          get().fetchFiles(1); // Refresh files list immediately
          
          // Remove global progress after a delay
          setTimeout(() => {
            progressStore.removeProgress(progressId);
          }, 3000);
          
          // Remove old upload progress after a delay
          setTimeout(() => {
            get().removeUploadProgress(fileId);
          }, 2000);
        } else {
          console.log('📁 Upload failed - success:', response.success, 'data:', response.data);
          allSuccessful = false;
          
          // Update global progress to error
          progressStore.updateProgress(progressId, {
            status: 'error',
          });
          
          // Update old progress system
          get().updateUploadProgress(fileId, {
            status: 'error',
            error: response.message || 'Upload failed',
          });
        }
      } catch (error: any) {
        console.error('📁 Upload exception:', error);
        console.error('📁 Upload error details:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
          stack: error.stack,
          file: file.name,
          uri: file.uri,
        });
        allSuccessful = false;
        
        // Update global progress to error with detailed message
        const errorMessage = error.response?.data?.message || error.message || 'Upload failed';
        progressStore.updateProgress(progressId, {
          status: 'error',
          message: errorMessage,
        });
        
        // Update old progress system
        get().updateUploadProgress(fileId, {
          status: 'error',
          error: errorMessage,
        });
        
        // Set global error state
        const fullErrorMessage = `Failed to upload ${file.name}: ${errorMessage}`;
        set({ error: fullErrorMessage });
        
        // Show alert to user with error details
        Alert.alert(
          'Upload Failed',
          fullErrorMessage,
          [{ text: 'OK' }]
        );
      }
    }
    
    console.log('📁 Upload batch completed. All successful:', allSuccessful);
    
    // Show summary alert if any uploads failed
    if (!allSuccessful) {
      Alert.alert(
        'Upload Incomplete',
        'Some files failed to upload. Please check the error messages and try again.',
        [{ text: 'OK' }]
      );
    }
    
    return allSuccessful;
  },

  uploadFromCamera: async () => {
    try {
      // Request camera permissions
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      
      if (!permissionResult.granted) {
        set({ error: 'Camera permission is required to take photos' });
        return false;
      }
      
      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        // Detect actual file type from URI (iOS camera may capture HEIC)
        const file: FileUpload = {
          uri: asset.uri,
          name: `photo_${Date.now()}.${asset.type?.includes('heic') ? 'heic' : 'jpg'}`,
          // Use mimeType if available, fallback to type, then default
          type: asset.mimeType || asset.type || 'image/jpeg',
          size: asset.fileSize,
        };
        
        return await get().uploadFiles([file]);
      }
      
      return false;
    } catch (error: any) {
      set({ error: error.message || 'Failed to take photo' });
      return false;
    }
  },

  uploadFromGallery: async () => {
    try {
      console.log('🖼️ Simple gallery upload test...');
      
      // Set image picker state
      set({ isImagePickerOpen: true, error: null });
      
      // In Expo Go, MediaLibrary plugin isn't available, so use ImagePicker directly
      // In development/production builds, MediaLibrary supports all media types (images, videos, audio)
      if (isExpoGo) {
        console.log('🖼️ Running in Expo Go - using ImagePicker (photos only)...');
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        console.log('🖼️ ImagePicker permission result:', permissionResult);
        
        if (!permissionResult.granted) {
          set({ error: 'Media library permission is required to select files', isImagePickerOpen: false });
          return false;
        }
      } else {
        // Try MediaLibrary first (supports images, videos, and audio) in dev/prod builds
        let mediaLibraryGranted = false;
        try {
          console.log('🖼️ Requesting media library permissions...');
          const { status } = await MediaLibrary.requestPermissionsAsync();
          console.log('🖼️ MediaLibrary permission status:', status);
          mediaLibraryGranted = status === 'granted';
        } catch (mediaLibraryError: any) {
          console.warn('🖼️ MediaLibrary permission request failed (app may need rebuild):', mediaLibraryError?.message);
          console.log('🖼️ Falling back to ImagePicker (photos only)...');
        }
        
        if (!mediaLibraryGranted) {
          // Fallback to ImagePicker permissions (only requests photo access, no audio needed)
          console.log('🖼️ Using ImagePicker for photo selection...');
          const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
          console.log('🖼️ ImagePicker permission result:', permissionResult);
          
          if (!permissionResult.granted) {
            set({ error: 'Media library permission is required to select files', isImagePickerOpen: false });
            return false;
          }
        }
      }
      
      console.log('🖼️ Launching simple image picker...');
      // Use the most basic configuration possible
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsMultipleSelection: true,
      });
      console.log('🖼️ Simple picker result:', result);
      
      // Reset image picker state
      set({ isImagePickerOpen: false });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        // Check mobile file limit (3 files max)
        const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';
        if (isMobile && result.assets.length > 3) {
          Alert.alert(
            'Upload Limit',
            'Sorry, our maximum upload is 3',
            [{ text: 'OK' }]
          );
          return false;
        }
        
        // Convert assets to FileUpload format and convert HEIC files
        const { useProgressStore } = require('../services/progressService');
        const progressStore = useProgressStore.getState();
        
        const files: FileUpload[] = [];
        
        for (let i = 0; i < result.assets.length; i++) {
          const asset = result.assets[i];
          const originalFile: FileUpload = {
            uri: asset.uri,
            name: asset.fileName || `image_${Date.now()}_${i}.jpg`,
            // Use mimeType instead of type - mimeType is the actual MIME type (e.g., "image/jpeg")
            // type is just "image" which doesn't work for FormData
            type: asset.mimeType || asset.type || 'image/jpeg',
            size: asset.fileSize || 0,
          };

          // Show conversion progress if needed
          const conversionProgressId = progressStore.addProgress({
            title: `Preparing ${originalFile.name}`,
            progress: 0,
            status: 'pending',
            message: 'Checking format...',
          });
          progressStore.showProgress();

          try {
            // Convert HEIC to PNG if needed
            const convertedFile = await convertHeicToPng(
              originalFile,
              (progress, message) => {
                progressStore.updateProgress(conversionProgressId, {
                  progress,
                  status: 'in-progress',
                  message,
                });
              }
            );

            // Remove conversion progress and add to files list
            progressStore.removeProgress(conversionProgressId);
            files.push(convertedFile);
          } catch (error: any) {
            console.error(`Failed to process ${originalFile.name}:`, error);
            progressStore.removeProgress(conversionProgressId);
            // Continue with original file if conversion fails
            files.push(originalFile);
          }
        }
        
        console.log('🖼️ Files prepared for upload:', files);
        return await get().uploadFiles(files);
      }
      
      console.log('🖼️ No images selected or picker was canceled');
      return false;
    } catch (error: any) {
      console.error('🖼️ Gallery upload error:', error);
      set({ error: error.message || 'Failed to select media', isImagePickerOpen: false });
      return false;
    }
  },

  uploadFromDocuments: async () => {
    const currentState = get();
    
    // Always force reset state first as safety measure
    console.log('🔄 Force resetting document picker before upload...');
    await currentState.forceResetDocumentPicker();
    
    try {
      currentState.setDocumentPickerOpen(true);
      
      // Launch document picker
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        // Check mobile file limit (3 files max)
        const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';
        if (isMobile && result.assets.length > 3) {
          Alert.alert(
            'Upload Limit',
            'Sorry, our maximum upload is 3',
            [{ text: 'OK' }]
          );
          get().setDocumentPickerOpen(false);
          return false;
        }
        
        const files: FileUpload[] = result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'application/octet-stream',
          size: asset.size,
        }));
        
        const success = await get().uploadFiles(files);
        get().setDocumentPickerOpen(false);
        return success;
      }
      
      get().setDocumentPickerOpen(false);
      return false;
    } catch (error: any) {
      set({ error: error.message || 'Failed to select documents' });
      get().setDocumentPickerOpen(false);
      return false;
    }
  },

  deleteFile: async (id: number) => {
    try {
      const response = await apiService.deleteFile(id);
      
      if (response.success) {
        // Remove file from the files list
        const currentFiles = get().files;
        const updatedFiles = currentFiles.filter((file) => file.id !== id);
        
        set({
          files: updatedFiles,
          error: null,
        });
        
        return true;
      } else {
        set({ error: response.message || 'Failed to delete file' });
        return false;
      }
    } catch (error: any) {
      set({ error: error.message || 'Failed to delete file' });
      return false;
    }
  },

  categorizeFile: async (id: number, category: string) => {
    try {
      const response = await apiService.categorizeFile(id, category);
      
      if (response.success && response.data) {
        // Update the file in the files list
        const currentFiles = get().files;
        const updatedFiles = currentFiles.map((file) =>
          file.id === id ? response.data! : file
        );
        
        set({
          files: updatedFiles,
          error: null,
        });
        
        return true;
      } else {
        set({ error: response.message || 'Failed to categorize file' });
        return false;
      }
    } catch (error: any) {
      set({ error: error.message || 'Failed to categorize file' });
      return false;
    }
  },

  autoCategorizeFile: async (id: number) => {
    try {
      const response = await apiService.autoCategorizeFile(id);
      
      if (response.success && response.data) {
        // Update the file in the files list
        const currentFiles = get().files;
        const updatedFiles = currentFiles.map((file) =>
          file.id === id ? response.data! : file
        );
        
        set({
          files: updatedFiles,
          error: null,
        });
        
        return true;
      } else {
        set({ error: response.message || 'Failed to auto-categorize file' });
        return false;
      }
    } catch (error: any) {
      set({ error: error.message || 'Failed to auto-categorize file' });
      return false;
    }
  },

  downloadFile: async (id: number) => {
    try {
      const result = await apiService.downloadFile(id);
      // Extract url from the result object
      return result?.url || null;
    } catch (error: any) {
      set({ error: error.message || 'Failed to download file' });
      return null;
    }
  },

  clearError: () => {
    set({ error: null });
  },

  updateUploadProgress: (fileId: string, progress: Partial<UploadProgress>) => {
    const currentProgress = get().uploadProgress;
    const existingProgress = currentProgress[fileId] || { fileId, progress: 0, status: 'uploading' };
    
    set({
      uploadProgress: {
        ...currentProgress,
        [fileId]: { ...existingProgress, ...progress },
      },
    });
  },

  removeUploadProgress: (fileId: string) => {
    const currentProgress = get().uploadProgress;
    const { [fileId]: removed, ...remainingProgress } = currentProgress;
    
    set({
      uploadProgress: remainingProgress,
    });
  },

  setDocumentPickerOpen: (isOpen: boolean) => {
    console.log('📁 Setting document picker state:', isOpen);
    set({ isDocumentPickerOpen: isOpen });
  },

  resetDocumentPicker: () => {
    console.log('🔄 Resetting document picker state');
    set({ isDocumentPickerOpen: false });
  },

  forceResetDocumentPicker: async () => {
    console.log('🔄 Force resetting document picker with delay...');
    set({ isDocumentPickerOpen: false });
    // Give extra time for native module to reset
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('✅ Document picker force reset complete');
  },

  setImagePickerOpen: (isOpen: boolean) => {
    console.log('🖼️ Setting image picker state:', isOpen);
    set({ isImagePickerOpen: isOpen });
  },

  resetImagePicker: () => {
    console.log('🔄 Resetting image picker state');
    set({ isImagePickerOpen: false });
  },
  
  setLastUploadTime: (timestamp: number) => {
    set({ lastUploadTime: timestamp });
  },
  
  addOptimisticPendingFile: (file: FileUpload) => {
    const optimisticId = `optimistic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const optimisticFile: OptimisticPendingFile = {
      optimisticId,
      uri: file.uri,
      name: file.name,
      type: file.type,
      size: file.size,
      uploadStartTime: Date.now(),
      status: 'pending',
    };
    
    set((state) => ({
      optimisticPendingFiles: [...state.optimisticPendingFiles, optimisticFile],
    }));
    
    console.log('✅ Added optimistic pending file:', optimisticId, file.name);
    return optimisticId;
  },
  
  removeOptimisticPendingFile: (optimisticId: string) => {
    set((state) => ({
      optimisticPendingFiles: state.optimisticPendingFiles.filter(
        (f) => f.optimisticId !== optimisticId
      ),
    }));
    console.log('🗑️ Removed optimistic pending file:', optimisticId);
  },
  
  updateOptimisticPendingFile: (optimisticId: string, updates: Partial<OptimisticPendingFile>) => {
    set((state) => ({
      optimisticPendingFiles: state.optimisticPendingFiles.map((f) =>
        f.optimisticId === optimisticId ? { ...f, ...updates } : f
      ),
    }));
  },
})); 