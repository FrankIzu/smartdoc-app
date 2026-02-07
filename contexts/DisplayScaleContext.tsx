import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DisplayScaleContextType {
  scale: number;
  setScale: (scale: number) => Promise<void>;
}

const DisplayScaleContext = createContext<DisplayScaleContextType | undefined>(undefined);

const SCALE_STORAGE_KEY = '@grabdocs_display_scale';
const DEFAULT_SCALE = 1.0;
const MIN_SCALE = 0.8;
const MAX_SCALE = 1.5;

export function DisplayScaleProvider({ children }: { children: ReactNode }) {
  const [scale, setScaleState] = useState<number>(DEFAULT_SCALE);

  // Load scale from storage on mount
  useEffect(() => {
    loadScale();
  }, []);

  const loadScale = async () => {
    try {
      const savedScale = await AsyncStorage.getItem(SCALE_STORAGE_KEY);
      if (savedScale) {
        const parsedScale = parseFloat(savedScale);
        if (!isNaN(parsedScale) && parsedScale >= MIN_SCALE && parsedScale <= MAX_SCALE) {
          setScaleState(parsedScale);
        }
      }
    } catch (error) {
      console.error('Failed to load display scale:', error);
    }
  };

  const setScale = async (newScale: number) => {
    // Clamp scale to valid range
    const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    try {
      setScaleState(clampedScale);
      await AsyncStorage.setItem(SCALE_STORAGE_KEY, clampedScale.toString());
    } catch (error) {
      console.error('Failed to save display scale:', error);
    }
  };

  const value: DisplayScaleContextType = {
    scale,
    setScale,
  };

  return <DisplayScaleContext.Provider value={value}>{children}</DisplayScaleContext.Provider>;
}

export function useDisplayScale() {
  const context = useContext(DisplayScaleContext);
  if (context === undefined) {
    throw new Error('useDisplayScale must be used within a DisplayScaleProvider');
  }
  return context;
}

export { MIN_SCALE, MAX_SCALE, DEFAULT_SCALE };
