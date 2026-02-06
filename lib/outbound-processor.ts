// 后台处理出库单图片识别的模块
import { recognizeOutboundFromImage } from './gemini';
import { convertGeminiResultToOutbound } from './receipt-helpers';
import { saveOutbound, getOutboundById } from './outbound';
import { uploadOutboundImage, supabase } from './supabase';

const STORAGE_BUCKET = 'receipts';

function extractFilePathFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const bucketIndex = pathParts.indexOf(STORAGE_BUCKET);
    if (bucketIndex !== -1 && bucketIndex + 1 < pathParts.length) {
      return pathParts.slice(bucketIndex + 1).join('/');
    }
    return null;
  } catch (error) {
    console.error('Error extracting file path from URL:', error);
    return null;
  }
}

async function deleteTempFile(imageUrl: string): Promise<void> {
  try {
    const filePath = extractFilePathFromUrl(imageUrl);
    if (!filePath) return;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
    if (error) console.error('Error deleting outbound temp file:', error);
  } catch (error) {
    console.error('Error deleting temp file:', error);
  }
}

/** 后台处理出库单图片识别（不阻塞 UI） */
export async function processOutboundInBackground(
  imageUrl: string,
  outboundId: string,
  processedImageUri: string
): Promise<void> {
  try {
    const recognizedData = await recognizeOutboundFromImage(imageUrl);
    const outbound = await convertGeminiResultToOutbound(recognizedData);
    const finalImageUrl = await uploadOutboundImage(processedImageUri, outboundId);
    if (imageUrl && imageUrl !== finalImageUrl) {
      await deleteTempFile(imageUrl);
    }
    await saveOutbound({
      ...outbound,
      id: outboundId,
      imageUrl: finalImageUrl,
      confidence: recognizedData.confidence,
      inputType: 'image',
    });
  } catch (error) {
    console.error('后台处理出库单失败:', error);
    try {
      const existing = await getOutboundById(outboundId);
      if (existing) {
        await saveOutbound({ ...existing, status: 'pending' });
      }
    } catch (e) {
      console.error('更新出库单状态失败:', e);
    }
    throw error;
  }
}
