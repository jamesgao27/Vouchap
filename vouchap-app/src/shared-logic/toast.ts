/** 纯 JS 事件订阅，避免依赖 Node events 模块（React Native 不支持） */
export type ToastType = 'success' | 'error' | 'info';

export interface ToastPayload {
  message: string;
  type: ToastType;
  duration: number;
}

type Listener = (payload: ToastPayload) => void;
const listeners = new Set<Listener>();

export function showToast(message: string, type: ToastType = 'info', duration = 1500) {
  const payload: ToastPayload = { message, type, duration };
  listeners.forEach((fn) => fn(payload));
}

export function subscribeToast(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

