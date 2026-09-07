import React, { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useChatPanel, type StagedAttachmentFile } from '../contexts/ChatPanelContext';
import {
  filesFromClipboard,
  filesFromClipboardItems,
  isUnrelatedTextField,
  type ClipboardStagedFile,
} from '../lib/use-web-clipboard-image-paste';
import { showToast } from '@/lib/toast';

/**
 * Always-on web paste host: hidden contenteditable + ⌘V clipboard.read().
 */
export function WebChatClipboardPasteHost() {
  const chat = useChatPanel();
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const sinkRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const applyFiles = useCallback((files: ClipboardStagedFile[]) => {
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

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'v') return;
      if (isUnrelatedTextField(e.target)) return;
      const active = document.activeElement;
      // Visible composer is already contenteditable — do not steal focus (text paste must stay there).
      if (active instanceof HTMLElement && active.id === 'web-chat-composer-editable') return;

      if (active instanceof HTMLElement) restoreFocusRef.current = active;
      sinkRef.current?.focus();

      const clip = navigator.clipboard;
      if (clip && typeof clip.read === 'function') {
        void clip.read()
          .then((items) => filesFromClipboardItems(items))
          .then((files) => {
            if (files.length) applyFiles(files);
          })
          .catch(() => {
            /* Safari / permission — paste on the sink still runs */
          });
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isUnrelatedTextField(e.target)) return;
      if (e.target instanceof Node && (e.target as HTMLElement).closest?.('#web-chat-composer-editable')) {
        return;
      }
      const files = filesFromClipboard(e.clipboardData);
      if (files.length) {
        e.preventDefault();
        e.stopPropagation();
        applyFiles(files);
      }
      const restore = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (restore && restore !== sinkRef.current) {
        requestAnimationFrame(() => restore.focus());
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('paste', onPaste, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('paste', onPaste, true);
    };
  }, [applyFiles]);

  if (Platform.OS !== 'web') return null;

  return React.createElement('div', {
    ref: sinkRef,
    id: 'web-chat-paste-sink',
    contentEditable: true,
    tabIndex: -1,
    suppressContentEditableWarning: true,
    'aria-hidden': true,
    style: {
      position: 'fixed',
      left: 0,
      top: 0,
      width: 2,
      height: 2,
      opacity: 0.01,
      overflow: 'hidden',
      zIndex: -1,
    },
  });
}
