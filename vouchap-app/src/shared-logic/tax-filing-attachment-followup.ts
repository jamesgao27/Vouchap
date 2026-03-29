import {
  getProjectTodoAttachmentWithContext,
  getProjectTodoAttachmentById,
  updateProjectTodoAttachment,
} from './firm';
import { runTaxFilingRecognition } from './tax-filing-recognition-run';
import { runWithRecognitionRetry, getUserFacingMessage } from './recognition-retry';
import { saveTaxFilingAttachmentChatLog } from './tax-filing-chat-log';

export type TaxFilingAttachmentFollowupResult =
  | { ok: true }
  | { ok: false; alertMessage: string };

/**
 * After createProjectTodoAttachment from Todos / order screens: recognition, DB update, and ai_chat_logs
 * so chat-to-log shows the same submissions as the task list.
 */
export async function processTaxFilingAttachmentAfterCreate(params: {
  orderId: string;
  attachmentId: string;
  todoId: string;
  fileName: string;
  isImage: boolean;
}): Promise<TaxFilingAttachmentFollowupResult> {
  await updateProjectTodoAttachment(params.attachmentId, { status: 'PROCESSING', recognition_fail_count: 0 });

  const ctx = await getProjectTodoAttachmentWithContext(params.attachmentId);
  if (!ctx) {
    return { ok: false, alertMessage: 'Could not load attachment context.' };
  }

  const { attachment, project, todoContext } = ctx;
  const projectContext = {
    country: (project.taxCountry === 'USA' ? 'USA' : 'CANADA') as 'CANADA' | 'USA',
    taxScenario: project.taxScenario ?? '',
  };

  const recognizeFn = () => runTaxFilingRecognition(attachment.attachment_url, projectContext, todoContext);

  const recognitionResult = await runWithRecognitionRetry(recognizeFn, {
    maxAttempts: 3,
    delayMs: 1500,
  });

  if (!recognitionResult.success) {
    const latest = await getProjectTodoAttachmentById(params.attachmentId);
    const currentFailCount =
      latest?.recognition_fail_count != null ? Number(latest.recognition_fail_count) || 0 : 0;
    const nextFailCount = Math.min(currentFailCount + 1, 3);
    const nextStatus =
      nextFailCount >= 3 ? 'FAILED_FINAL' : nextFailCount === 2 ? 'FAILED_TWICE' : 'FAILED_ONCE';

    await updateProjectTodoAttachment(params.attachmentId, {
      status: nextStatus,
      recognition_fail_count: nextFailCount,
    });

    const errText = recognitionResult.isContentQuality
      ? 'Content unclear or not recognized. Please resubmit.'
      : getUserFacingMessage(recognitionResult);
    return { ok: false, alertMessage: `Recognition failed: ${errText}` };
  }

  const recognition = recognitionResult.result as Awaited<ReturnType<typeof runTaxFilingRecognition>>;
  const upd = await updateProjectTodoAttachment(params.attachmentId, {
    summary: recognition.summary,
    doc_type: recognition.doc_type,
    extracted_data: recognition.extracted_data,
    status: 'PROCESSED',
    recognition_fail_count: 0,
  });
  if ('error' in upd) {
    return { ok: false, alertMessage: upd.error.message ?? 'Could not update attachment.' };
  }

  await saveTaxFilingAttachmentChatLog({
    orderId: params.orderId,
    attachmentId: params.attachmentId,
    todoId: params.todoId,
    fileUrl: attachment.attachment_url,
    fileName: params.fileName,
    isImage: params.isImage,
    summary: recognition.summary ?? null,
    docType: recognition.doc_type ?? null,
    extracted_data: recognition.extracted_data ?? null,
  });

  return { ok: true };
}
