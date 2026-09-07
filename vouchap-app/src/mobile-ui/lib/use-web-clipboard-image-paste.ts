import { useEffect } from 'react';
import { Platform } from 'react-native';

export type ClipboardStagedFile = { id: string; uri: string; name?: string; mimeType?: string };

export const CHAT_WEB_COMPOSER_NATIVE_ID = 'chat-web-composer';
export const WEBCHAT_FAB_COMPOSER_NATIVE_ID = 'webchatfab-composer';
export const WEB_CHAT_PANEL_NATIVE_ID = 'web-chat-panel';

function isImageFile(f: File): boolean {
  if (f.type.startsWith('image/')) return true;
  if (/\.(png|jpe?g|gif|webp|heic|bmp|tiff?)$/i.test(f.name)) return true;
  return !f.type && f.size > 0;
}

function pushImageFile(out: ClipboardStagedFile[], seen: Set<string>, f: File | null) {
  if (!f || !isImageFile(f)) return;
  const key = `${f.name}:${f.size}:${f.type}:${f.lastModified}`;
  if (seen.has(key)) return;
  seen.add(key);
  const mime = f.type && f.type.startsWith('image/') ? f.type : 'image/png';
  out.push({
    id: `paste-${Date.now()}-${out.length}-${f.name || 'screenshot'}`,
    uri: URL.createObjectURL(f),
    name: f.name || `screenshot-${out.length + 1}.png`,
    mimeType: mime,
  });
}

function eachClipboardItem(data: DataTransfer, visit: (item: DataTransferItem) => void) {
  const items = data.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++) visit(items[i]);
}

export function filesFromClipboard(data: DataTransfer | null | undefined): ClipboardStagedFile[] {
  if (!data) return [];
  const out: ClipboardStagedFile[] = [];
  const seen = new Set<string>();
  // Iterate items first — Safari often leaves data.files empty until items are read.
  eachClipboardItem(data, (item) => {
    if (item.type.startsWith('image/') || item.kind === 'file') {
      pushImageFile(out, seen, item.getAsFile());
    }
  });
  if (data.files?.length) {
    for (let i = 0; i < data.files.length; i++) pushImageFile(out, seen, data.files[i]);
  }
  return out;
}

export function clipboardEventLooksLikeImage(data: DataTransfer | null | undefined): boolean {
  if (!data) return false;
  if (data.files?.length) {
    for (let i = 0; i < data.files.length; i++) {
      if (isImageFile(data.files[i])) return true;
    }
  }
  let found = false;
  eachClipboardItem(data, (item) => {
    if (item.type.startsWith('image/') || (item.kind === 'file' && item.type.startsWith('image/'))) {
      found = true;
    }
  });
  return found;
}

export function extractClipboardImageFiles(e: unknown): ClipboardStagedFile[] {
  const ev = e as {
    clipboardData?: DataTransfer | null;
    nativeEvent?: { clipboardData?: DataTransfer | null };
  };
  return filesFromClipboard(ev?.clipboardData ?? ev?.nativeEvent?.clipboardData ?? null);
}

export function isUnrelatedTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLInputElement)) return false;
  const inChat =
    target.closest(`#${CHAT_WEB_COMPOSER_NATIVE_ID}`) ||
    target.closest(`#${WEBCHAT_FAB_COMPOSER_NATIVE_ID}`) ||
    target.closest(`#${WEB_CHAT_PANEL_NATIVE_ID}`);
  if (inChat) return false;
  const t = (target.type || 'text').toLowerCase();
  return t === 'text' || t === 'email' || t === 'search' || t === 'url' || t === 'tel' || t === 'password' || t === 'number';
}

export const MAC_SCREENSHOT_CLIPBOARD_HINT =
  'On Mac, copy a screenshot with Control+Command+Shift+4, then Command+V.';

/**
 * App-wide web paste. Mount once under ChatPanelProvider so ⌘V works
 * even when the right-rail TextInput swallows the event.
 */
export function useWebClipboardImagePaste(
  onFiles: (files: ClipboardStagedFile[]) => void,
  enabled: boolean,
  onEmptyImagePaste?: () => void,
) {
  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof document === 'undefined') return;

    const onPaste = (e: ClipboardEvent) => {
      if (isUnrelatedTextField(e.target)) return;
      const files = filesFromClipboard(e.clipboardData);
      if (files.length) {
        e.preventDefault();
        e.stopPropagation();
        onFiles(files);
        return;
      }
      const looksLikeImage = clipboardEventLooksLikeImage(e.clipboardData);
      const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
      if (looksLikeImage && clip && typeof clip.read === 'function') {
        e.preventDefault();
        void clip.read().then(async (items) => {
          const out: ClipboardStagedFile[] = [];
          const seen = new Set<string>();
          for (const item of items) {
            const type = item.types.find((t) => t.startsWith('image/'));
            if (!type) continue;
            const blob = await item.getType(type);
            pushImageFile(out, seen, new File([blob], `screenshot-${Date.now()}.png`, { type }));
          }
          if (out.length) onFiles(out);
          else onEmptyImagePaste?.();
        }).catch(() => onEmptyImagePaste?.());
        return;
      }
      const pastedText = e.clipboardData?.getData?.('text/plain')?.trim() ?? '';
      if (!pastedText) onEmptyImagePaste?.();
    };

    document.addEventListener('paste', onPaste, true);
    window.addEventListener('paste', onPaste, true);
    return () => {
      document.removeEventListener('paste', onPaste, true);
      window.removeEventListener('paste', onPaste, true);
    };
  }, [enabled, onFiles, onEmptyImagePaste]);
}
