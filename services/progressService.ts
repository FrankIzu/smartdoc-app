import { create } from 'zustand';

export interface ProgressTask {
  id: string;
  fileName: string;
  progress: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  message: string;
  phase: 'validation' | 'processing' | 'finalizing' | 'uploading';
  category: string;
  subcategory?: string;
  startTime: number;
  endTime?: number;
}

interface ProgressStore {
  tasks: Record<string, ProgressTask>;
  activeTasks: string[];
  startProgress: (taskId: string, fileName: string, category?: string, subcategory?: string) => void;
  updateProgress: (taskId: string, updates: Partial<ProgressTask>) => void;
  completeProgress: (taskId: string) => void;
  errorProgress: (taskId: string, error: string) => void;
  removeTask: (taskId: string) => void;
  getActiveTasks: () => ProgressTask[];
  getTask: (taskId: string) => ProgressTask | undefined;
}

export const useProgressStore = create<ProgressStore>((set, get) => ({
  tasks: {},
  activeTasks: [],

  startProgress: (taskId: string, fileName: string, category = 'File Processing', subcategory = 'Upload') => {
    const newTask: ProgressTask = {
      id: taskId,
      fileName,
      progress: 0,
      status: 'pending',
      message: 'Starting...',
      phase: 'validation',
      category,
      subcategory,
      startTime: Date.now(),
    };

    set((state) => ({
      tasks: {
        ...state.tasks,
        [taskId]: newTask,
      },
      activeTasks: [...state.activeTasks, taskId],
    }));

    console.log(`🚀 Started progress tracking for task: ${taskId}`);
  },

  updateProgress: (taskId: string, updates: Partial<ProgressTask>) => {
    set((state) => {
      const currentTask = state.tasks[taskId];
      if (!currentTask) return state;

      const updatedTask = {
        ...currentTask,
        ...updates,
        status: updates.status || (updates.progress === 100 ? 'completed' : 'processing'),
      };

      return {
        tasks: {
          ...state.tasks,
          [taskId]: updatedTask,
        },
      };
    });

    console.log(`📊 Updated progress for task ${taskId}:`, updates);
  },

  completeProgress: (taskId: string) => {
    set((state) => {
      const currentTask = state.tasks[taskId];
      if (!currentTask) return state;

      const completedTask = {
        ...currentTask,
        progress: 100,
        status: 'completed' as const,
        message: 'Completed successfully',
        phase: 'finalizing' as const,
        endTime: Date.now(),
      };

      return {
        tasks: {
          ...state.tasks,
          [taskId]: completedTask,
        },
        activeTasks: state.activeTasks.filter(id => id !== taskId),
      };
    });

    console.log(`✅ Completed progress tracking for task: ${taskId}`);

    // Auto-remove completed task after 5 seconds
    setTimeout(() => {
      get().removeTask(taskId);
    }, 5000);
  },

  errorProgress: (taskId: string, error: string) => {
    set((state) => {
      const currentTask = state.tasks[taskId];
      if (!currentTask) return state;

      const errorTask = {
        ...currentTask,
        status: 'error' as const,
        message: error,
        endTime: Date.now(),
      };

      return {
        tasks: {
          ...state.tasks,
          [taskId]: errorTask,
        },
        activeTasks: state.activeTasks.filter(id => id !== taskId),
      };
    });

    console.log(`❌ Error in progress tracking for task ${taskId}:`, error);

    // Auto-remove error task after 10 seconds
    setTimeout(() => {
      get().removeTask(taskId);
    }, 10000);
  },

  removeTask: (taskId: string) => {
    set((state) => {
      const { [taskId]: removed, ...remainingTasks } = state.tasks;
      return {
        tasks: remainingTasks,
        activeTasks: state.activeTasks.filter(id => id !== taskId),
      };
    });

    console.log(`🗑️ Removed progress tracking for task: ${taskId}`);
  },

  getActiveTasks: () => {
    const { tasks, activeTasks } = get();
    return activeTasks.map(id => tasks[id]).filter(Boolean);
  },

  getTask: (taskId: string) => {
    return get().tasks[taskId];
  },
}));
