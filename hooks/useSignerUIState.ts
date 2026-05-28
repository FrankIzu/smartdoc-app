import { useCallback, useRef, useState } from 'react';

export interface SignerUIState {
  activeDocIndex: number;
  activePage: number;
  signatureModalFieldKey: string | null;
  showDeclineModal: boolean;
}

export function useSignerUIState() {
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [activePage, setActivePage] = useState(0);
  const [signatureModalFieldKey, setSignatureModalFieldKey] = useState<string | null>(null);
  const [showDeclineModal, setShowDeclineModal] = useState(false);

  return {
    activeDocIndex,
    setActiveDocIndex,
    activePage,
    setActivePage,
    signatureModalFieldKey,
    setSignatureModalFieldKey,
    showDeclineModal,
    setShowDeclineModal,
  };
}

export type SignerUIActions = ReturnType<typeof useSignerUIState>;
