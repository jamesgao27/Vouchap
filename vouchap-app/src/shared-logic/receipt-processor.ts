// 后台处理小票识别的模块
import { recognizeReceipt } from './gemini';
import { convertGeminiResultToReceiptResilient } from './receipt-helpers';
import { updateReceipt, getReceiptById } from './database';
import { uploadReceiptImage, supabase } from './supabase';
import { checkDuplicateReceipt } from './receipt-duplicate-checker';
import { getUserFacingMessage, runWithRecognitionRetry } from './recognition-retry';
import { getCurrentUser } from './auth';
import {
  assertClientRecognitionAllowed,
  formatRecognitionQuotaBlockedNotice,
  recordClientRecognitionSuccessIfEnforced,
} from './client-recognition-quota';
import {
  incrementReceiptRecognitionFailCount,
  resetReceiptRecognitionFailCount,
} from './recognition-fail-count';

// 从公共 URL 提取 bucket 与对象路径。URL 格式: .../storage/v1/object/public/{bucket_id}/{path}
function extractBucketAndPathFromUrl(url: string): { bucket: string; filePath: string } | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const publicIndex = pathParts.indexOf('public');
    if (publicIndex === -1 || publicIndex + 2 > pathParts.length) return null;
    const bucket = pathParts[publicIndex + 1];
    const filePath = pathParts.slice(publicIndex + 2).join('/');
    return filePath ? { bucket, filePath } : null;
  } catch (error) {
    console.error('Error extracting bucket/path from URL:', error);
    return null;
  }
}

// 删除临时文件（支持 receipts 与 tax-filing bucket）
async function deleteTempFile(imageUrl: string): Promise<void> {
  try {
    const parsed = extractBucketAndPathFromUrl(imageUrl);
    if (!parsed) {
      console.warn('Could not extract bucket/path from URL:', imageUrl);
      return;
    }
    const { bucket, filePath } = parsed;

    console.log(`Deleting temp file from bucket: ${bucket}, path: ${filePath}`);
    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);

    if (error) {
      console.error('Error deleting temp file:', error);
      // 不抛出错误，因为删除失败不应该影响主流程
    } else {
      console.log('Temp file deleted successfully:', filePath);
    }
  } catch (error) {
    console.error('Error deleting temp file:', error);
    // 不抛出错误，因为删除失败不应该影响主流程
  }
}

// 后台处理小票识别（不阻塞用户界面）
export async function processReceiptInBackground(
  imageUrl: string,
  receiptId: string,
  processedImageUri: string,
  options?: { skipDeleteSourceUrl?: boolean }
): Promise<void> {
  try {
    console.log('开始后台处理小票识别...', receiptId);
    console.log('使用处理后的图片进行识别，URL:', imageUrl);
    console.log('处理后的图片本地 URI:', processedImageUri);

    // Quota is per space — must use the user's *current* workspace from DB, not a cached spaceId.
    // Also refresh so switching space before capture applies the correct limit bucket.
    const userForQuota = await getCurrentUser(true);
    const activeSpaceId = userForQuota?.currentSpaceId || userForQuota?.spaceId || '';
    const existingRow = await getReceiptById(receiptId);
    const quotaSpaceId =
      existingRow?.spaceId && String(existingRow.spaceId).trim() !== ''
        ? String(existingRow.spaceId)
        : activeSpaceId;
    if (existingRow?.spaceId && activeSpaceId && existingRow.spaceId !== activeSpaceId) {
      console.warn('[receipt-processor] receipt.space_id differs from active workspace (stale insert vs switch):', {
        receiptSpaceId: existingRow.spaceId,
        activeSpaceId,
        quotaSpaceUsed: quotaSpaceId,
      });
    }

    const gate = await assertClientRecognitionAllowed(quotaSpaceId);
    if (!gate.allowed) {
      // Model is never called — dev prefers warn; entry preflight should usually catch first.
      console.warn(
        '[receipt-processor] Recognition blocked by quota/billing (model NOT invoked).',
        gate.message ?? 'No message',
        { quotaSpaceId: quotaSpaceId || '(empty)', activeSpaceId: activeSpaceId || '(empty)', receiptSpaceId: existingRow?.spaceId },
      );
      await updateReceipt(
        receiptId,
        {
          status: 'needs_retake',
          recognitionNotice: formatRecognitionQuotaBlockedNotice(gate.message),
        },
        true,
      );
      await incrementReceiptRecognitionFailCount(receiptId);
      return;
    }

    // 1. 使用处理后的图片 URL 识别小票（失败时后台静默重试直至成功或判定为内容质量差）
    const ret = await runWithRecognitionRetry(() => recognizeReceipt(imageUrl), { maxAttempts: 5, delayMs: 2000 });
    if (!ret.success) {
      console.error(
        '[receipt-processor] recognizeReceipt failed after retries (see gemini-proxy / network).',
        ret.error?.message,
        'isContentQuality:',
        ret.isContentQuality,
        { imageUrl: imageUrl?.slice(0, 80) },
      );
      const notice =
        getUserFacingMessage(ret) ||
        ret.error?.message ||
        'Recognition failed. Please try again later.';
      await updateReceipt(
        receiptId,
        {
          status: 'needs_retake',
          recognitionNotice: `${notice}\n\nIf recognition keeps failing, check connectivity and project AI (gemini-proxy) configuration.`,
        },
        true,
      );
      await incrementReceiptRecognitionFailCount(receiptId);
      return;
    }
    const recognizedData = ret.result;
    console.log('识别完成，开始转换数据...');

    // 2. 转换为 Receipt 格式（匹配分类和支付账户）
    let receipt = await convertGeminiResultToReceiptResilient(recognizedData);
    console.log('数据转换完成，行数:', receipt.items?.length ?? 0, '，开始更新小票...');

    receipt = {
      ...receipt,
      spaceId: quotaSpaceId || receipt.spaceId || activeSpaceId,
    };

    // 3. 使用真实ID重新上传处理后的图片（替换临时文件）
    // 注意：processedImageUri 是预处理后的图片本地 URI，不是原始图片
    const finalImageUrl = await uploadReceiptImage(processedImageUri, receiptId, receipt.spaceId || '');
    console.log('最终处理后的图片已上传，URL:', finalImageUrl);

    // 4. 删除临时文件（如果存在）- 使用 try-catch 确保失败不影响主流程
    if (imageUrl && imageUrl !== finalImageUrl && !options?.skipDeleteSourceUrl) {
      console.log('删除临时文件:', imageUrl);
      await deleteTempFile(imageUrl);
    }

    // 5. 更新小票数据（使用已存在的 receiptId）
    // 状态与置信度均在 convertGeminiResultToReceipt 中根据 0.85 规则设置，使用 receipt 的调整后置信度
    // 注意：传入 autoResolveDuplicate: true，让 updateReceipt 自动处理"供应商名称已存在"的情况（后台处理场景）
    await updateReceipt(receiptId, {
      ...receipt,
      imageUrl: finalImageUrl,
      confidence: receipt.confidence,
      recognitionNotice: null,
    }, true); // autoResolveDuplicate = true，自动处理重复名称

    if (receipt.status === 'needs_retake') {
      await incrementReceiptRecognitionFailCount(receiptId);
    } else {
      await resetReceiptRecognitionFailCount(receiptId);
    }

    await recordClientRecognitionSuccessIfEnforced(quotaSpaceId || receipt.spaceId || '');

    // Receipt-level tax + tax_breakdown are persisted in updateReceipt (database.ts).
    // Payee tax/phone/address：单独供应商二次识别已移除，全部由 recognizeReceipt 单次 JSON 的 supplierInfo + convertGeminiResultToReceipt 写库。

    // 6. 检测是否与已有小票重复
    const updatedReceipt = await getReceiptById(receiptId);
    if (updatedReceipt) {
      const duplicateReceipt = await checkDuplicateReceipt(updatedReceipt);
      if (duplicateReceipt) {
        // 如果发现重复，更新状态为 duplicate
        await updateReceipt(receiptId, {
          status: 'duplicate',
        }, true); // autoResolveDuplicate = true，后台处理场景
        await resetReceiptRecognitionFailCount(receiptId);
        console.log(`小票数据已更新，发现重复小票，状态：duplicate，重复的小票ID：${duplicateReceipt.id}`);
      } else {
        console.log(`小票数据已更新，后台处理完成，状态：${receipt.status}，置信度：${recognizedData.confidence}`);
      }
    }
  } catch (error) {
    console.error('后台处理小票失败:', error);
    // 更新小票状态为错误，让用户可以稍后查看
    try {
      await updateReceipt(receiptId, {
        status: 'pending',
      }, true); // autoResolveDuplicate = true，后台处理场景
    } catch (updateError) {
      console.error('更新小票状态失败:', updateError);
    }
    throw error;
  }
}
