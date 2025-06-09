import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { create } from 'zustand';
import { apiService } from '../services/api';
import { FileState, FileUpload, UploadProgress } from '../types';

interface FileStore extends FileState {
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
}

export const useFileStore = create<FileStore>((set, get) => ({
  // Initial state
  files: [],
  isLoading: false,
  error: null,
  uploadProgress: {},

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
    
    for (const file of files) {
      const fileId = `upload_${Date.now()}_${Math.random()}`;
      
      // Initialize upload progress
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
        
        const response = await apiService.uploadFile(
          formData,
          (progress) => {
            get().updateUploadProgress(fileId, { progress });
          }
        );
        
        if (response.success && response.data) {
          // Update progress to completed
          get().updateUploadProgress(fileId, {
            progress: 100,
            status: 'completed',
          });
          
          // Add the new file to the files list
          const currentFiles = get().files;
          set({
            files: [response.data, ...currentFiles],
          });
          
          // Remove upload progress after a delay
          setTimeout(() => {
            get().removeUploadProgress(fileId);
          }, 2000);
        } else {
          allSuccessful = false;
          get().updateUploadProgress(fileId, {
            status: 'error',
            error: response.message || 'Upload failed',
          });
        }
      } catch (error: any) {
        allSuccessful = false;
        get().updateUploadProgress(fileId, {
          status: 'error',
          error: error.message || 'Upload failed',
        });
      }
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
      // Request media library permissions
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        set({ error: 'Media library permission is required to select photos' });
        return false;
      }
      
      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const files: FileUpload[] = result.assets.map((asset, index) => ({
          uri: asset.uri,
          name: asset.fileName || `media_${Date.now()}_${index}`,
          type: asset.type === 'video' ? 'video/mp4' : 'image/jpeg',
          size: asset.fileSize,
        }));
        
        return await get().uploadFiles(files);
      }
      
      return false;
    } catch (error: any) {
      set({ error: error.message || 'Failed to select media' });
      return false;
    }
  },

  uploadFromDocuments: async () => {
    try {
      // Launch document picker
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
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
        
        return await get().uploadFiles(files);
      }
      
      return false;
    } catch (error: any) {
      set({ error: error.message || 'Failed to select documents' });
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
})); 