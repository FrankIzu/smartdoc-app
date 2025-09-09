import { create } from 'zustand';

export interface ProgressData {
  id: string;
  title: string;
  progress: number;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  message?: string;
  timestamp?: number;
}

interface ProgressStore {
  visible: boolean;
  minimized: boolean;
  progressData: ProgressData[];
  
  // Actions
  showProgress: () => void;
  hideProgress: () => void;
  minimizeProgress: () => void;
  expandProgress: () => void;
  closeProgress: () => void;
  
  // Progress management
  addProgress: (data: Omit<ProgressData, 'id' | 'timestamp'>) => string;
  updateProgress: (id: string, updates: Partial<ProgressData>) => void;
  removeProgress: (id: string) => void;
  clearAllProgress: () => void;
  
  // Batch operations
  setProgressData: (data: ProgressData[]) => void;
}

export const useProgressStore = create<ProgressStore>((set, get) => ({
  visible: false,
  minimized: false,
  progressData: [],

  showProgress: () => set({ visible: true }),
  
  hideProgress: () => set({ visible: false }),
  
  minimizeProgress: () => set({ minimized: true }),
  
  expandProgress: () => set({ minimized: false }),
  
  closeProgress: () => set({ visible: false, minimized: false, progressData: [] }),

  addProgress: (data) => {
    const id = `progress_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newProgress: ProgressData = {
      ...data,
      id,
      timestamp: Date.now(),
    };
    
    set((state) => ({
      progressData: [...state.progressData, newProgress],
      visible: true,
    }));
    
    return id;
  },

  updateProgress: (id, updates) => {
    set((state) => ({
      progressData: state.progressData.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }));
  },

  removeProgress: (id) => {
    set((state) => {
      const newProgressData = state.progressData.filter((item) => item.id !== id);
      return {
        progressData: newProgressData,
        visible: newProgressData.length > 0 ? state.visible : false,
      };
    });
  },

  clearAllProgress: () => {
    set({ progressData: [], visible: false, minimized: false });
  },

  setProgressData: (data) => {
    set({ 
      progressData: data,
      visible: data.length > 0,
    });
  },
}));

// Utility functions for common progress operations
export const progressUtils = {
  // Create a progress item for file upload
  createUploadProgress: (filename: string) => {
    return useProgressStore.getState().addProgress({
      title: `Uploading ${filename}`,
      progress: 0,
      status: 'pending',
      message: 'Preparing upload...',
    });
  },

  // Create a progress item for file download
  createDownloadProgress: (filename: string) => {
    return useProgressStore.getState().addProgress({
      title: `Downloading ${filename}`,
      progress: 0,
      status: 'pending',
      message: 'Preparing download...',
    });
  },

  // Create a progress item for API operations
  createApiProgress: (operation: string) => {
    return useProgressStore.getState().addProgress({
      title: operation,
      progress: 0,
      status: 'pending',
      message: 'Initializing...',
    });
  },

  // Update progress with percentage
  updateProgressPercentage: (id: string, percentage: number, message?: string) => {
    const status = percentage >= 100 ? 'completed' : 'in-progress';
    useProgressStore.getState().updateProgress(id, {
      progress: Math.min(100, Math.max(0, percentage)),
      status,
      message: message || (status === 'completed' ? 'Completed successfully' : undefined),
    });
  },

  // Mark progress as completed
  completeProgress: (id: string, message?: string) => {
    useProgressStore.getState().updateProgress(id, {
      progress: 100,
      status: 'completed',
      message: message || 'Completed successfully',
    });
  },

  // Mark progress as error
  errorProgress: (id: string, message?: string) => {
    useProgressStore.getState().updateProgress(id, {
      status: 'error',
      message: message || 'An error occurred',
    });
  },

  // Auto-cleanup completed progress items after delay
  autoCleanup: (delay: number = 3000) => {
    const { progressData, removeProgress } = useProgressStore.getState();
    
    progressData.forEach((item) => {
      if (item.status === 'completed' || item.status === 'error') {
        setTimeout(() => {
          removeProgress(item.id);
        }, delay);
      }
    });
  },
};