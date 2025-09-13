import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { create } from 'zustand';
import { apiService } from '../services/api';
import { FileState, FileUpload, UploadProgress } from '../types';

interface FileStore extends FileState {
  // Global state
  isDocumentPickerOpen: boolean;
  isImagePickerOpen: boolean;
  
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
}

export const useFileStore = create<FileStore>((set, get) => ({
  // Initial state
  files: [],
  isLoading: false,
  error: null,
  uploadProgress: {},
  isDocumentPickerOpen: false,
  isImagePickerOpen: false,

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
        const formData = new FormData();
        formData.append('file', {
          uri: file.uri,
          type: file.type,
          name: file.name,
        } as any);
        
        const response = await apiService.uploadFileWithProgressPolling(
          formData,
          (progress, message, phase) => {
            console.log(`📊 Upload progress: ${progress}% for ${file.name} - ${message} (${phase})`);
            
            // Update global progress bar with detailed progress
            progressStore.updateProgress(progressId, {
              progress: progress,
              status: 'in-progress',
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
          console.log('📁 Upload successful - task_id:', response.task_id);
          
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
          
          // For mobile uploads, we don't immediately add to files list
          // The files will be refreshed from the server
          // This prevents duplicate entries and ensures we get the processed file data
          
          // Refresh the files list to show the newly uploaded file
          setTimeout(() => {
            get().fetchFiles(1); // Refresh files list
          }, 1000);
          
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
        console.log('📁 Upload exception:', error);
        allSuccessful = false;
        
        // Update global progress to error
        progressStore.updateProgress(progressId, {
          status: 'error',
        });
        
        // Update old progress system
        get().updateUploadProgress(fileId, {
          status: 'error',
          error: error.message || 'Upload failed',
        });
      }
    }
    
    console.log('📁 Upload batch completed. All successful:', allSuccessful);
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
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const file: FileUpload = {
          uri: asset.uri,
          name: `photo_${Date.now()}.jpg`,
          type: 'image/jpeg',
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
      
      // First try with expo-media-library approach
      console.log('🖼️ Requesting media library permissions...');
      const { status } = await MediaLibrary.requestPermissionsAsync();
      console.log('🖼️ MediaLibrary permission status:', status);
      
      if (status !== 'granted') {
        console.log('🖼️ MediaLibrary permission denied');
        
        // Fallback to ImagePicker permissions
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        console.log('🖼️ ImagePicker permission result:', permissionResult);
        
        if (!permissionResult.granted) {
          set({ error: 'Media library permission is required to select photos' });
          return false;
        }
      }
      
      console.log('🖼️ Launching simple image picker...');
      // Use the most basic configuration possible
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      console.log('🖼️ Simple picker result:', result);
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const files: FileUpload[] = result.assets.map((asset, index) => ({
          uri: asset.uri,
          name: asset.fileName || `image_${Date.now()}_${index}.jpg`,
          type: 'image/jpeg',
          size: asset.fileSize || 0,
        }));
        
        console.log('🖼️ Files to upload:', files);
        return await get().uploadFiles(files);
      }
      
      console.log('🖼️ No images selected or picker was canceled');
      return false;
    } catch (error: any) {
      console.error('🖼️ Gallery upload error:', error);
      set({ error: error.message || 'Failed to select media' });
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
      const downloadUrl = await apiService.downloadFile(id);
      return downloadUrl;
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
})); 