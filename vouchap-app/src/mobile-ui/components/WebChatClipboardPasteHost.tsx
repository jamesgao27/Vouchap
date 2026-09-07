import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { useChatPanel, type StagedAttachmentFile } from '../contexts/ChatPanelContext';
import {
  MAC_SCREENSHOT_CLIPBOARD_HINT,
  useWebClipboardImagePaste,
  type ClipboardStagedFile,
} from '../lib/use-web-clipboard-image-paste';
import { showToast } from '@/lib/toast';

/** Listens for screenshot paste at the app root (desktop web). */
export function WebChatClipboardPasteHost() {
  const chat = useChatPanel();
  const chatRef = useRef(chat);
  chatRef.current = chat;

  const onFiles = useCallback((files: ClipboardStagedFile[]) => {
    const c = chatRef.current;
    if (!c || !files.length) return;
    const staged: StagedAttachmentFile[] = files.map((f) => ({
      id: f.id,
      uri: f.uri,
      name: f.name,
    }));
    if (c.appendStagedFilesRef.current) {
      c.appendStagedFilesRef.current(staged);
    } else {
      c.setInitialStagedFiles(staged);
      if (!c.open) c.openPanel();
    }
    showToast('Screenshot added.', 'success');
  }, []);

  const onEmptyImagePaste = useCallback(() => {
    const c = chatRef.current;
    if (!c?.open) return;
    showToast(MAC_SCREENSHOT_CLIPBOARD_HINT, 'info', 3200);
  }, []);

  useWebClipboardImagePaste(onFiles, Platform.OS === 'web' && Boolean(chat), onEmptyImagePaste);
  return null;
}
