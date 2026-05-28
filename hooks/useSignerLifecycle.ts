import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

export function useSignerLifecycle(opts: {
  onBackground?: () => void;
  onForeground?: () => void;
  onUnmount?: () => void;
  wipeToken?: () => void;
  isTokenMode?: boolean;
}) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        optsRef.current.onBackground?.();
      } else if (state === 'active') {
        optsRef.current.onForeground?.();
      }
    });
    return () => {
      sub.remove();
      optsRef.current.onUnmount?.();
    };
  }, []);
}
