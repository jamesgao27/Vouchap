import { Modal } from 'react-native';
import { useChatPanel } from '../contexts/ChatPanelContext';
import { AttachmentImagePreviewModal } from './AttachmentImagePreviewModal';
import { FileDetailModal } from './FileDetailModal';

/**
 * Same preview tree as receipt-details: AttachmentImagePreviewModal + Modal > FileDetailModal.
 * Must sit inside LayoutContent's full-viewport root, not inside the 420px rail.
 */
export function ChatPreviewHost() {
  const chat = useChatPanel();
  if (!chat) return null;

  return (
    <>
      <AttachmentImagePreviewModal
        visible={!!chat.imagePreviewUrl}
        uri={chat.imagePreviewUrl}
        onClose={chat.closeImagePreview}
      />
      {chat.filePreview ? (
        <Modal visible transparent animationType="fade" onRequestClose={chat.closeFilePreview}>
          <FileDetailModal file={chat.filePreview} onClose={chat.closeFilePreview} />
        </Modal>
      ) : null}
    </>
  );
}
