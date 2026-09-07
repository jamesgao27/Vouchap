import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { filesFromClipboard, type ClipboardStagedFile } from '../lib/use-web-clipboard-image-paste';

const STYLE_ID = 'web-chat-composer-field-css';

function ensurePlaceholderCss() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
#web-chat-composer-editable.web-chat-composer-empty:before {
  content: attr(data-placeholder);
  color: #95A5A6;
  pointer-events: none;
  white-space: pre-wrap;
}
#web-chat-composer-editable:focus { outline: none; }
`;
  document.head.appendChild(s);
}

export type WebChatComposerFieldHandle = { focus: () => void };

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  editable?: boolean;
  maxLength?: number;
  onFocus?: () => void;
  onPasteImages: (files: ClipboardStagedFile[]) => void;
};

/**
 * Desktop web composer. contenteditable so ⌘V screenshot paste includes image files
 * (Chrome/Safari omit files when the target is a textarea).
 */
export const WebChatComposerField = forwardRef<WebChatComposerFieldHandle, Props>(
  function WebChatComposerField(
    { value, onChangeText, placeholder, editable = true, maxLength = 500, onFocus, onPasteImages },
    ref,
  ) {
    const elRef = useRef<HTMLDivElement | null>(null);

    useImperativeHandle(ref, () => ({
      focus: () => elRef.current?.focus(),
    }));

    useEffect(() => {
      ensurePlaceholderCss();
    }, []);

    useEffect(() => {
      const el = elRef.current;
      if (!el) return;
      const current = (el.innerText || '').replace(/\n$/, '');
      if (current !== (value || '')) {
        el.textContent = value || '';
      }
    }, [value]);

    return React.createElement('div', {
      ref: elRef,
      id: 'web-chat-composer-editable',
      className: value ? undefined : 'web-chat-composer-empty',
      contentEditable: editable,
      role: 'textbox',
      spellCheck: true,
      suppressContentEditableWarning: true,
      'aria-multiline': true,
      'data-placeholder': placeholder ?? '',
      onFocus,
      onInput: (e: React.FormEvent<HTMLDivElement>) => {
        let text = (e.currentTarget.innerText || '').replace(/\u00a0/g, ' ');
        if (text === '\n') text = '';
        if (text.length > maxLength) {
          text = text.slice(0, maxLength);
          e.currentTarget.textContent = text;
        }
        onChangeText(text);
      },
      onPaste: (e: React.ClipboardEvent<HTMLDivElement>) => {
        const files = filesFromClipboard(e.clipboardData);
        if (files.length) {
          e.preventDefault();
          e.stopPropagation();
          onPasteImages(files);
          return;
        }
        const plain = e.clipboardData.getData('text/plain');
        if (plain) {
          e.preventDefault();
          document.execCommand('insertText', false, plain.slice(0, maxLength));
        }
      },
      style: {
        minHeight: 66,
        maxHeight: 160,
        overflowY: 'auto',
        fontSize: 15,
        lineHeight: '22px',
        color: '#2D3436',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        outline: 'none',
      },
    });
  },
);
