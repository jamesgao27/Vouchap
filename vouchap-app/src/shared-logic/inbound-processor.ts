// 后台处理入库单图片识别的模块
import { recognizeInboundFromImage } from './gemini';
import { convertGeminiResultToInbound } from './receipt-helpers';
import { saveInbound, getInboundById } from './inbound';
import { uploadInboundImage, supabase } from './supabase';

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
    if (error) console.error('Error deleting inbound temp file:', error);
  } catch (error) {
    console.error('Error deleting temp file:', error);
  }
}

/** 后台处理入库单图片识别（不阻塞 UI） */
export async function processInboundInBackground(
  imageUrl: string,
  inboundId: string,
  processedImageUri: string
): Promise<void> {
  try {
    const existing = await getInboundById(inboundId);
    const spaceId = existing?.spaceId ?? '';
    const recognizedData = await recognizeInboundFromImage(imageUrl);
    const inbound = await convertGeminiResultToInbound(recognizedData);
    const finalImageUrl = await uploadInboundImage(processedImageUri, inboundId, spaceId);
    if (imageUrl && imageUrl !== finalImageUrl) {
      await deleteTempFile(imageUrl);
    }
    await saveInbound({
      ...inbound,
      id: inboundId,
      imageUrl: finalImageUrl,
      confidence: recognizedData.confidence,
      inputType: 'image',
    });
  } catch (error) {
    console.error('后台处理入库单失败:', error);
    try {
      const existing = await getInboundById(inboundId);
      if (existing) {
        await saveInbound({ ...existing, status: 'pending' });
      }
    } catch (e) {
      console.error('更新入库单状态失败:', e);
    }
    throw error;
  }
}
