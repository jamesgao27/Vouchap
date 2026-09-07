import { Modal } from 'react-native';
import { useChatPanel } from '../contexts/ChatPanelContext';
import { AttachmentImagePreviewModal } from './AttachmentImagePreviewModal';
import { FileDetailModal } from './FileDetailModal';

/** Page-root host so right-rail image/PDF preview is not clipped by the 420px panel. */
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
