import { useCallback, useMemo, useState } from 'react';

/**
 * Controls a MinimizableBottomSheet so reopen works while the sheet is
 * still visible but minimized (setVisible(true) alone is a no-op).
 */
export function useMinimizableSheet(initialVisible = false) {
  const [visible, setVisible] = useState(initialVisible);
  const [expandNonce, setExpandNonce] = useState(0);

  const open = useCallback(() => {
    setExpandNonce((n) => n + 1);
    setVisible(true);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
  }, []);

  return useMemo(
    () => ({ visible, expandNonce, open, close, setVisible }),
    [visible, expandNonce, open, close]
  );
}
