import { saveChatLog } from './chat-logs';
import { getProjectByOrderId } from './firm';

/**
 * Persists a tax-filing attachment turn to ai_chat_logs so chat-to-log history matches Todos.
 * Shape must stay aligned with chat-to-log.tsx (tax-filing branch after recognition).
 */
export async function saveTaxFilingAttachmentChatLog(params: {
  orderId: string;
  attachmentId: string;
  todoId: string;
  fileUrl: string;
  fileName: string;
  isImage: boolean;
  summary: string | null;
  docType: string | null;
  extracted_data: unknown;
}): Promise<void> {
  const project = await getProjectByOrderId(params.orderId);
  if (!project?.id) return;

  const previewPayload = {
    id: params.attachmentId,
    projectId: project.id,
    todoId: params.todoId,
    name: params.fileName,
    summary: params.summary,
    imageUrl: params.fileUrl,
    docType: params.docType,
    extracted_data: params.extracted_data,
  };

  await saveChatLog({
    projectId: project.id,
    voucherType: 'tax-filing',
    type: params.isImage ? 'image' : 'document',
    modelName: 'tax-filing',
    prompt: `Uploaded: ${params.fileName}`,
    response: '',
    requestData: { todoId: params.todoId, fileName: params.fileName },
    responseData: { attachmentPreview: previewPayload },
    success: true,
    attachmentUrl: params.fileUrl,
  });
}
