import { useCallback, useState } from 'react';

export interface SignerUIState {
  activeDocIndex: number;
  activePage: number;
  signatureModalFieldKey: string | null;
  signatureModalExpandNonce: number;
  showDeclineModal: boolean;
}

export function useSignerUIState() {
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [activePage, setActivePage] = useState(0);
  const [signatureModalFieldKey, setSignatureModalFieldKeyState] = useState<string | null>(null);
  const [signatureModalExpandNonce, setSignatureModalExpandNonce] = useState(0);
  const [showDeclineModal, setShowDeclineModal] = useState(false);

  const setSignatureModalFieldKey = useCallback((key: string | null) => {
    setSignatureModalFieldKeyState(key);
    if (key) {
      setSignatureModalExpandNonce((n) => n + 1);
    }
  }, []);

  return {
    activeDocIndex,
    setActiveDocIndex,
    activePage,
    setActivePage,
    signatureModalFieldKey,
    signatureModalExpandNonce,
    setSignatureModalFieldKey,
    showDeclineModal,
    setShowDeclineModal,
  };
}

export type SignerUIActions = ReturnType<typeof useSignerUIState>;
