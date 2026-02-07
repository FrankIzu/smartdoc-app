import { useDisplayScale } from '../contexts/DisplayScaleContext';

/**
 * Hook that returns a function to scale font sizes based on user preference
 */
export function useScaledFontSize() {
  const { scale } = useDisplayScale();
  
  return (fontSize: number): number => {
    return Math.round(fontSize * scale);
  };
}
