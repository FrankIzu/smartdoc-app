import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type ChatGDSheetParams = Record<string, string | string[] | undefined>;

type ChatGDSheetContextValue = {
  visible: boolean;
  expandNonce: number;
  params: ChatGDSheetParams;
  openChatGD: (params?: ChatGDSheetParams) => void;
  closeChatGD: () => void;
};

const ChatGDSheetContext = createContext<ChatGDSheetContextValue | null>(null);

/** Params injected when ChatsScreen is rendered inside the global sheet host. */
export const ChatGDSheetHostParamsContext = createContext<ChatGDSheetParams | null>(null);

export function ChatGDSheetProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [expandNonce, setExpandNonce] = useState(0);
  const [params, setParams] = useState<ChatGDSheetParams>({});

  const openChatGD = useCallback((nextParams?: ChatGDSheetParams) => {
    setParams({ isSheet: '1', openStartNew: '1', ...nextParams });
    setExpandNonce((n) => n + 1);
    setVisible(true);
  }, []);

  const closeChatGD = useCallback(() => {
    setVisible(false);
    setParams({});
  }, []);

  const value = useMemo(
    () => ({ visible, expandNonce, params, openChatGD, closeChatGD }),
    [visible, expandNonce, params, openChatGD, closeChatGD]
  );

  return <ChatGDSheetContext.Provider value={value}>{children}</ChatGDSheetContext.Provider>;
}

export function useChatGDSheet() {
  const ctx = useContext(ChatGDSheetContext);
  if (!ctx) {
    throw new Error('useChatGDSheet must be used within ChatGDSheetProvider');
  }
  return ctx;
}

/** Safe hook for screens that may render outside the provider. */
export function useOpenChatGD() {
  const ctx = useContext(ChatGDSheetContext);
  return useCallback(
    (params?: ChatGDSheetParams) => {
      ctx?.openChatGD(params);
    },
    [ctx]
  );
}

export function useChatGDSheetHostParams() {
  return useContext(ChatGDSheetHostParamsContext);
}
