/**
 * Web 聊天侧栏状态：由 FAB 打开，不切换路由；支持 pin 常驻并压缩主区宽度。
 */
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ChatPanelType = 'receipt' | 'invoice';

type ChatPanelContextValue = {
  open: boolean;
  pinned: boolean;
  type: ChatPanelType;
  setOpen: (v: boolean) => void;
  setPinned: (v: boolean) => void;
  setType: (t: ChatPanelType) => void;
  openPanel: (t?: ChatPanelType) => void;
  closePanel: () => void;
  togglePin: () => void;
};

const ChatPanelContext = createContext<ChatPanelContextValue | null>(null);

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [type, setType] = useState<ChatPanelType>('receipt');

  const openPanel = useCallback((t?: ChatPanelType) => {
    if (t) setType(t);
    setOpen(true);
  }, []);

  const closePanel = useCallback(() => setOpen(false), []);

  const togglePin = useCallback(() => setPinned((p) => !p), []);

  const value: ChatPanelContextValue = {
    open,
    pinned,
    type,
    setOpen,
    setPinned,
    setType,
    openPanel,
    closePanel,
    togglePin,
  };

  return (
    <ChatPanelContext.Provider value={value}>
      {children}
    </ChatPanelContext.Provider>
  );
}

export function useChatPanel() {
  const ctx = useContext(ChatPanelContext);
  return ctx;
}
