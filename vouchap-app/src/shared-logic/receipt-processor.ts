// 后台处理小票识别的模块
import { recognizeReceipt, recognizeSupplierInfo } from './gemini';
import { convertGeminiResultToReceipt } from './receipt-helpers';
import { updateReceipt, getReceiptById } from './database';
import { uploadReceiptImage, supabase } from './supabase';
import { checkDuplicateReceipt } from './receipt-duplicate-checker';
import { findOrCreateEntity, updateEntity } from './entities';
import { runWithRecognitionRetry } from './recognition-retry';
import { getCurrentUser } from './auth';
import { assertClientRecognitionAllowed, recordClientRecognitionSuccessIfEnforced } from './client-recognition-quota';

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
  processedImageUri: string
): Promise<void> {
  try {
    console.log('开始后台处理小票识别...', receiptId);
    console.log('使用处理后的图片进行识别，URL:', imageUrl);
    console.log('处理后的图片本地 URI:', processedImageUri);

    const existingForQuota = await getReceiptById(receiptId);
    const quotaSpaceId = existingForQuota?.spaceId ?? '';
    const gate = await assertClientRecognitionAllowed(quotaSpaceId);
    if (!gate.allowed) {
      console.warn('[receipt-processor] recognition blocked by quota:', gate.message);
      await updateReceipt(receiptId, { status: 'needs_retake' }, true);
      return;
    }

    // 1. 使用处理后的图片 URL 识别小票（失败时后台静默重试直至成功或判定为内容质量差）
    const ret = await runWithRecognitionRetry(() => recognizeReceipt(imageUrl), { maxAttempts: 5, delayMs: 2000 });
    if (!ret.success) {
      console.warn('小票识别失败（重试后仍失败或内容质量差）:', ret.error.message);
      await updateReceipt(receiptId, { status: 'needs_retake' }, true); // autoResolveDuplicate = true，后台处理场景
      return;
    }
    const recognizedData = ret.result;
    console.log('识别完成，开始转换数据...');

    // 2. 转换为 Receipt 格式（匹配分类和支付账户）
    let receipt;
    try {
      receipt = await convertGeminiResultToReceipt(recognizedData);
      console.log('数据转换完成，开始更新小票...');
    } catch (error: any) {
      // 如果转换过程中出现任何错误（包括名称重复等），记录错误但不阻塞流程
      // 使用基本识别数据创建一个小票记录
      console.error('转换小票数据失败:', error);
      console.log('使用基本识别数据创建小票记录...');
      const user = await getCurrentUser();
      const spaceId = user?.currentSpaceId || user?.spaceId || '';
      receipt = {
        spaceId,
        supplierName: recognizedData.supplierName || '',
        totalAmount: recognizedData.totalAmount || 0,
        date: recognizedData.date || new Date().toISOString().split('T')[0],
        items: [],
        status: 'pending' as const,
        confidence: recognizedData.confidence || 0,
      };
    }

    // 3. 使用真实ID重新上传处理后的图片（替换临时文件）
    // 注意：processedImageUri 是预处理后的图片本地 URI，不是原始图片
    const finalImageUrl = await uploadReceiptImage(processedImageUri, receiptId, receipt.spaceId || '');
    console.log('最终处理后的图片已上传，URL:', finalImageUrl);

    // 4. 删除临时文件（如果存在）- 使用 try-catch 确保失败不影响主流程
    if (imageUrl && imageUrl !== finalImageUrl) {
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
    }, true); // autoResolveDuplicate = true，自动处理重复名称

    await recordClientRecognitionSuccessIfEnforced(receipt.spaceId || quotaSpaceId);

    // Line taxes + reconciliation run inside updateReceipt (database.ts); avoid duplicate apply here.

    // 6. 异步识别供应商详细信息（不阻塞主流程）
    // 如果基本识别中已经有一些供应商信息，先使用它们；然后异步补充更完整的信息
    const supplierInfoFromBasic = recognizedData.supplierInfo;
    const hasBasicSupplierInfo = supplierInfoFromBasic && (
      supplierInfoFromBasic.taxNumber ||
      supplierInfoFromBasic.phone ||
      supplierInfoFromBasic.address
    );

    // 异步识别供应商详细信息（即使基本识别已有信息，也尝试获取更完整的信息）
    recognizeSupplierInfo(finalImageUrl, receipt.supplierName || recognizedData.supplierName)
      .then(async (detailedSupplierInfo) => {
        try {
          console.log('[Supplier Info] 异步识别供应商详细信息完成:', detailedSupplierInfo);
          
          // 合并基本识别和详细识别的结果（详细识别优先）
          const mergedSupplierInfo = {
            taxNumber: detailedSupplierInfo.taxNumber || supplierInfoFromBasic?.taxNumber,
            phone: detailedSupplierInfo.phone || supplierInfoFromBasic?.phone,
            address: detailedSupplierInfo.address || supplierInfoFromBasic?.address,
          };

          // 如果有任何关联方信息，更新 entity 记录
          if (receipt.entityId && (mergedSupplierInfo.taxNumber || mergedSupplierInfo.phone || mergedSupplierInfo.address)) {
            console.log('[Entity Info] 更新关联方详细信息:', mergedSupplierInfo);
            try {
              await updateEntity(receipt.entityId, {
                taxNumber: mergedSupplierInfo.taxNumber,
                phone: mergedSupplierInfo.phone,
                address: mergedSupplierInfo.address,
              });
              console.log('[Entity Info] ✅ 关联方详细信息已更新');
            } catch (error: any) {
              if (error?.code === 'ENTITY_NAME_EXISTS' || error?.message === '关联方名称已存在') {
                console.log('[Entity Info] 关联方名称已存在，跳过更新');
              } else {
                throw error;
              }
            }
          } else if (receipt.supplierName && (mergedSupplierInfo.taxNumber || mergedSupplierInfo.phone || mergedSupplierInfo.address)) {
            try {
              const entity = await findOrCreateEntity(
                receipt.supplierName,
                true,
                mergedSupplierInfo.taxNumber,
                mergedSupplierInfo.phone,
                mergedSupplierInfo.address
              );
              await updateReceipt(receiptId, { entityId: entity.id }, true);
              console.log('[Entity Info] ✅ 关联方已创建/更新，小票已关联');
            } catch (error) {
              console.warn('[Entity Info] 更新关联方失败:', error);
            }
          }
        } catch (error) {
          console.error('[Supplier Info] 异步更新供应商信息失败:', error);
          // 不抛出错误，因为这是异步补充信息，失败不影响主流程
        }
      })
      .catch((error) => {
        console.error('[Supplier Info] 异步识别供应商信息失败:', error);
        // 不抛出错误，因为这是异步补充信息，失败不影响主流程
      });

    // 7. 检测是否与已有小票重复
    const updatedReceipt = await getReceiptById(receiptId);
    if (updatedReceipt) {
      const duplicateReceipt = await checkDuplicateReceipt(updatedReceipt);
      if (duplicateReceipt) {
        // 如果发现重复，更新状态为 duplicate
        await updateReceipt(receiptId, {
          status: 'duplicate',
        }, true); // autoResolveDuplicate = true，后台处理场景
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
