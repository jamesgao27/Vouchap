/**
 * Web 聊天侧栏状态：由 FAB 打开，不切换路由；右栏打开即常驻并压缩主区（无 pin 切换）。
 * Web 端默认右栏关闭，通过气泡（FAB）呼出。
 */
import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';

export type ChatPanelType = 'receipt' | 'invoice' | 'inbound' | 'outbound';

type ChatPanelContextValue = {
  open: boolean;
  type: ChatPanelType;
  setType: (t: ChatPanelType) => void;
  openPanel: (t?: ChatPanelType) => void;
  closePanel: () => void;
  initialInput: string | null;
  setInitialInput: (v: string | null) => void;
  /** 由右栏 ChatToLogContent 注册，openPanel 后用于聚焦输入框 */
  inputFocusRef: React.MutableRefObject<(() => void) | null>;
};

const ChatPanelContext = createContext<ChatPanelContextValue | null>(null);

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ChatPanelType>('receipt');
  const [initialInput, setInitialInput] = useState<string | null>(null);
  const inputFocusRef = useRef<(() => void) | null>(null);

  const openPanel = useCallback((t?: ChatPanelType) => {
    if (t) setType(t);
    setOpen(true);
    setTimeout(() => inputFocusRef.current?.(), 150);
  }, []);

  const closePanel = useCallback(() => setOpen(false), []);

  const value: ChatPanelContextValue = {
    open,
    type,
    setType,
    openPanel,
    closePanel,
    initialInput,
    setInitialInput,
    inputFocusRef,
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
