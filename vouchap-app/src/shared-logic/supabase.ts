import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

// 移动端不在此处 require AsyncStorage，否则在 NativeModule 未 link（如未执行 pod install / 未用 dev client 构建）时
// require 阶段就会抛错且可能无法被 try/catch 捕获，导致白屏。此处直接返回 undefined，应用可正常启动，会话仅内存持久化。
// 若需移动端会话持久化，请执行：cd ios && pod install && cd .. 后重新 npx expo run:ios / run:android。
function getAuthStorage(): undefined | { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void>; removeItem: (key: string) => Promise<void> } {
  if (Platform.OS === 'web') return undefined;
  return undefined;
}

// 安全获取环境变量，避免启动时崩溃
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// 验证环境变量是否配置
export function validateSupabaseConfig(): { valid: boolean; error?: string } {
  if (!supabaseUrl || supabaseUrl === '' || supabaseUrl.includes('placeholder')) {
    return { valid: false, error: 'Supabase URL is not configured. Please set EXPO_PUBLIC_SUPABASE_URL.' };
  }
  if (!supabaseAnonKey || supabaseAnonKey === '' || supabaseAnonKey === 'placeholder-key') {
    return { valid: false, error: 'Supabase Anon Key is not configured. Please set EXPO_PUBLIC_SUPABASE_ANON_KEY.' };
  }
  return { valid: true };
}

// 使用安全默认值初始化客户端，避免启动时崩溃
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      storage: getAuthStorage(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'x-client-info': 'vouchap@2.0.0',
      },
    },
  }
);

// Storage Bucket 名称配置
const STORAGE_BUCKET = 'receipts';
/** SKU 封面等服务市场资源 */
const MARKETPLACE_BUCKET = 'marketplace';
/** 税表模块上传：按 client space_id 分文件夹存储 */
export const TAX_FILING_BUCKET = 'tax-filing';

/** 从 fileUri（可能为 file://、blob:、content:// 等）安全解析图片扩展名与 MIME，避免拼错 */
const IMAGE_EXT_REG = /\.(jpe?g|png|gif|webp)$/i;
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp'] as const;
function getImageExtAndMime(fileUri: string): { ext: string; mimeType: string } {
  const pathPart = fileUri.includes('/') ? fileUri.split('/').pop()?.split('?')[0] ?? '' : fileUri.split('?')[0] ?? '';
  const match = pathPart.match(IMAGE_EXT_REG);
  const ext = match ? match[1].toLowerCase() : 'jpg';
  const normalized = ALLOWED_EXT.includes(ext as any) ? ext : 'jpg';
  const mimeType = normalized === 'jpg' ? 'image/jpeg' : `image/${normalized}`;
  return { ext: normalized === 'jpg' ? 'jpg' : normalized, mimeType };
}

// 上传图片到Supabase Storage（临时文件名，用于识别前上传）
// 建议使用 uploadReceiptImageTempWithSpace 按 space_id 分文件夹存储
export async function uploadReceiptImageTemp(fileUri: string, tempFileName: string): Promise<string> {
  return uploadReceiptImageTempWithSpace(fileUri, tempFileName, '');
}

/** 按 space_id 分文件夹上传到 receipts bucket，路径为 {spaceId}/temp/{tempFileName}.{ext}；expenses/income 新上传使用此方法 */
export async function uploadReceiptImageTempWithSpace(fileUri: string, tempFileName: string, spaceId: string): Promise<string> {
  try {
    let arrayBuffer: ArrayBuffer | Uint8Array;
    if (Platform.OS === 'web') {
      const res = await fetch(fileUri);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
      arrayBuffer = await res.arrayBuffer();
    } else {
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    }

    const { ext: fileExt, mimeType } = getImageExtAndMime(fileUri);
    const fileName = `${tempFileName}.${fileExt}`;
    const folder = spaceId && spaceId.trim() ? spaceId.trim() : 'unknown';
    const filePath = `${folder}/temp/${fileName}`;

    console.log(`Uploading to bucket: ${STORAGE_BUCKET}, path: ${filePath}`);

    const uploadPayload = arrayBuffer instanceof ArrayBuffer ? arrayBuffer : (arrayBuffer as Uint8Array).buffer;
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, uploadPayload, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      console.error('Upload error:', error);
      throw error;
    }

    // 获取公共URL
    const { data: { publicUrl } } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    console.log('Upload successful, public URL:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
}

/** 税表模块：上传到 tax-filing bucket，路径为 {clientSpaceId}/{tempFileName}.{ext}；Web 支持 blob URL */
export async function uploadTaxFilingFile(fileUri: string, tempFileName: string, clientSpaceId: string): Promise<string> {
  try {
    let arrayBuffer: ArrayBuffer | Uint8Array;
    if (Platform.OS === 'web') {
      const res = await fetch(fileUri);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
      arrayBuffer = await res.arrayBuffer();
    } else {
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    }

    const { ext: fileExt, mimeType } = getImageExtAndMime(fileUri);
    const fileName = `${tempFileName}.${fileExt}`;
    const folder = clientSpaceId && clientSpaceId.trim() ? clientSpaceId.trim() : 'unknown';
    const filePath = `${folder}/${fileName}`;

    console.log(`Uploading to bucket: ${TAX_FILING_BUCKET}, path: ${filePath}`);

    const uploadPayload = arrayBuffer instanceof ArrayBuffer ? arrayBuffer : (arrayBuffer as Uint8Array).buffer;
    const { error } = await supabase.storage
      .from(TAX_FILING_BUCKET)
      .upload(filePath, uploadPayload, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      console.error('Upload error:', error);
      throw error;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(TAX_FILING_BUCKET)
      .getPublicUrl(filePath);

    console.log('Tax-filing upload successful, public URL:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading tax-filing image:', error);
    throw error;
  }
}

/** 上传小票正式图到 receipts，路径 {spaceId}/receipt_{receiptId}.{ext}；支持 Web blob/file URI */
export async function uploadReceiptImage(fileUri: string, receiptId: string, spaceId: string): Promise<string> {
  try {
    let arrayBuffer: ArrayBuffer | Uint8Array;
    if (Platform.OS === 'web' || fileUri.startsWith('blob:') || fileUri.startsWith('data:')) {
      const res = await fetch(fileUri);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
      arrayBuffer = await res.arrayBuffer();
    } else {
      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    }
    const { ext: fileExt, mimeType } = getImageExtAndMime(fileUri);
    const folder = spaceId && spaceId.trim() ? spaceId.trim() : 'unknown';
    const filePath = `${folder}/receipt_${receiptId}.${fileExt}`;
    const uploadPayload = arrayBuffer instanceof ArrayBuffer ? arrayBuffer : (arrayBuffer as Uint8Array).buffer;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, uploadPayload, { contentType: mimeType, upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading receipt image:', error);
    throw error;
  }
}

// 获取图片URL
export function getReceiptImageUrl(filePath: string): string {
  const { data: { publicUrl } } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filePath);
  return publicUrl;
}

/** 上传项目封面到 tax-filing bucket，路径 {spaceId}/cover_{projectId}.{ext}；spaceId 为 client space，支持 Web blob */
export async function uploadProjectCover(fileUri: string, projectId: string, spaceId: string): Promise<string> {
  try {
    let arrayBuffer: ArrayBuffer | Uint8Array;
    if (Platform.OS === 'web' || fileUri.startsWith('blob:') || fileUri.startsWith('data:')) {
      const res = await fetch(fileUri);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
      arrayBuffer = await res.arrayBuffer();
    } else {
      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    }
    const { ext: fileExt, mimeType } = getImageExtAndMime(fileUri);
    const folder = spaceId && spaceId.trim() ? spaceId.trim() : 'unknown';
    const filePath = `${folder}/cover_${projectId}.${fileExt}`;
    const uploadPayload = arrayBuffer instanceof ArrayBuffer ? arrayBuffer : (arrayBuffer as Uint8Array).buffer;
    const { error } = await supabase.storage.from(TAX_FILING_BUCKET).upload(filePath, uploadPayload, { contentType: mimeType, upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from(TAX_FILING_BUCKET).getPublicUrl(filePath);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading project cover:', error);
    throw error;
  }
}

/** 上传发票正式图到 receipts，路径 {spaceId}/invoice_{invoiceId}.{ext}；支持 Web blob */
export async function uploadInvoiceImage(fileUri: string, invoiceId: string, spaceId: string): Promise<string> {
  try {
    let arrayBuffer: ArrayBuffer | Uint8Array;
    if (Platform.OS === 'web' || fileUri.startsWith('blob:') || fileUri.startsWith('data:')) {
      const res = await fetch(fileUri);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
      arrayBuffer = await res.arrayBuffer();
    } else {
      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    }
    const { ext: fileExt, mimeType } = getImageExtAndMime(fileUri);
    const folder = spaceId && spaceId.trim() ? spaceId.trim() : 'unknown';
    const filePath = `${folder}/invoice_${invoiceId}.${fileExt}`;
    const uploadPayload = arrayBuffer instanceof ArrayBuffer ? arrayBuffer : (arrayBuffer as Uint8Array).buffer;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, uploadPayload, { contentType: mimeType, upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading invoice image:', error);
    throw error;
  }
}

/** 上传 Firm SKU 封面图到 marketplace bucket，路径 sku/{skuId}.{ext}；Web 支持 blob/data URI */
export async function uploadFirmSkuImage(fileUri: string, skuId: string): Promise<string> {
  let arrayBuffer: ArrayBuffer;
  const isBlobOrData = fileUri.startsWith('blob:') || fileUri.startsWith('data:');
  if (Platform.OS === 'web' || isBlobOrData) {
    const res = await fetch(fileUri);
    if (!res.ok) throw new Error(`Failed to read image: ${res.status}`);
    arrayBuffer = await res.arrayBuffer();
  } else {
    const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
    arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
  }
  const { ext: fileExt, mimeType } = getImageExtAndMime(fileUri);
  const filePath = `sku/${skuId}.${fileExt}`;
  const { error } = await supabase.storage.from(MARKETPLACE_BUCKET).upload(filePath, arrayBuffer, { contentType: mimeType, upsert: true });
  if (error) {
    console.error('Storage upload error:', error);
    throw new Error(error.message || 'Upload failed');
  }
  const { data: { publicUrl } } = supabase.storage.from(MARKETPLACE_BUCKET).getPublicUrl(filePath);
  return publicUrl;
}

/** 上传入库单图片（临时），路径 {spaceId}/temp/inbound_{tempFileName}.{ext} */
export async function uploadInboundImageTempWithSpace(fileUri: string, tempFileName: string, spaceId: string): Promise<string> {
  try {
    let arrayBuffer: ArrayBuffer | Uint8Array;
    if (Platform.OS === 'web') {
      const res = await fetch(fileUri);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
      arrayBuffer = await res.arrayBuffer();
    } else {
      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    }
    const { ext: fileExt, mimeType } = getImageExtAndMime(fileUri);
    const folder = spaceId && spaceId.trim() ? spaceId.trim() : 'unknown';
    const filePath = `${folder}/temp/inbound_${tempFileName}.${fileExt}`;
    const uploadPayload = arrayBuffer instanceof ArrayBuffer ? arrayBuffer : (arrayBuffer as Uint8Array).buffer;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, uploadPayload, { contentType: mimeType, upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading inbound image temp:', error);
    throw error;
  }
}

/** @deprecated 建议使用 uploadInboundImageTempWithSpace 按 space_id 分文件夹 */
export async function uploadInboundImageTemp(fileUri: string, tempFileName: string): Promise<string> {
  return uploadInboundImageTempWithSpace(fileUri, tempFileName, '');
}

/** 上传入库单正式图到 receipts，路径 {spaceId}/inbound_{inboundId}.{ext}；支持 Web blob */
export async function uploadInboundImage(fileUri: string, inboundId: string, spaceId: string): Promise<string> {
  try {
    let arrayBuffer: ArrayBuffer | Uint8Array;
    if (Platform.OS === 'web' || fileUri.startsWith('blob:') || fileUri.startsWith('data:')) {
      const res = await fetch(fileUri);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
      arrayBuffer = await res.arrayBuffer();
    } else {
      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    }
    const { ext: fileExt, mimeType } = getImageExtAndMime(fileUri);
    const folder = spaceId && spaceId.trim() ? spaceId.trim() : 'unknown';
    const filePath = `${folder}/inbound_${inboundId}.${fileExt}`;
    const uploadPayload = arrayBuffer instanceof ArrayBuffer ? arrayBuffer : (arrayBuffer as Uint8Array).buffer;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, uploadPayload, { contentType: mimeType, upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading inbound image:', error);
    throw error;
  }
}

/** 上传出库单图片（临时），路径 {spaceId}/outbound_{tempFileName}.{ext}；仅一层 space_id 文件夹 */
export async function uploadOutboundImageTempWithSpace(fileUri: string, tempFileName: string, spaceId: string): Promise<string> {
  try {
    let arrayBuffer: ArrayBuffer | Uint8Array;
    if (Platform.OS === 'web') {
      const res = await fetch(fileUri);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
      arrayBuffer = await res.arrayBuffer();
    } else {
      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    }
    const { ext: fileExt, mimeType } = getImageExtAndMime(fileUri);
    const folder = spaceId && spaceId.trim() ? spaceId.trim() : 'unknown';
    const filePath = `${folder}/outbound_${tempFileName}.${fileExt}`;
    const uploadPayload = arrayBuffer instanceof ArrayBuffer ? arrayBuffer : (arrayBuffer as Uint8Array).buffer;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, uploadPayload, { contentType: mimeType, upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading outbound image temp:', error);
    throw error;
  }
}

/** @deprecated 建议使用 uploadOutboundImageTempWithSpace 按 space_id 分文件夹 */
export async function uploadOutboundImageTemp(fileUri: string, tempFileName: string): Promise<string> {
  return uploadOutboundImageTempWithSpace(fileUri, tempFileName, '');
}

/** 上传出库单正式图到 receipts，路径 {spaceId}/outbound_{outboundId}.{ext}；支持 Web blob */
export async function uploadOutboundImage(fileUri: string, outboundId: string, spaceId: string): Promise<string> {
  try {
    let arrayBuffer: ArrayBuffer | Uint8Array;
    if (Platform.OS === 'web' || fileUri.startsWith('blob:') || fileUri.startsWith('data:')) {
      const res = await fetch(fileUri);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
      arrayBuffer = await res.arrayBuffer();
    } else {
      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    }
    const { ext: fileExt, mimeType } = getImageExtAndMime(fileUri);
    const folder = spaceId && spaceId.trim() ? spaceId.trim() : 'unknown';
    const filePath = `${folder}/outbound_${outboundId}.${fileExt}`;
    const uploadPayload = arrayBuffer instanceof ArrayBuffer ? arrayBuffer : (arrayBuffer as Uint8Array).buffer;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, uploadPayload, { contentType: mimeType, upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading outbound image:', error);
    throw error;
  }
}

// 从公共URL中提取文件路径
function extractFilePathFromUrl(url: string): string | null {
  try {
    // URL 格式通常是: https://[project].supabase.co/storage/v1/object/public/receipts/[filename]
    // 或者: https://[project].supabase.co/storage/v1/object/sign/receipts/[filename]?token=...
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const bucketIndex = pathParts.indexOf(STORAGE_BUCKET);
    if (bucketIndex !== -1 && bucketIndex + 1 < pathParts.length) {
      // 提取 bucket 后面的所有路径部分（文件名可能包含目录结构）
      const fileName = pathParts.slice(bucketIndex + 1).join('/');
      return fileName;
    }
    return null;
  } catch (error) {
    console.error('Error extracting file path from URL:', error);
    return null;
  }
}

// 删除Supabase Storage中的文件
export async function deleteReceiptImage(imageUrl: string): Promise<void> {
  try {
    const filePath = extractFilePathFromUrl(imageUrl);
    if (!filePath) {
      console.warn('Could not extract file path from URL:', imageUrl);
      return;
    }

    console.log(`Deleting file from bucket: ${STORAGE_BUCKET}, path: ${filePath}`);
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([filePath]);

    if (error) {
      console.error('Error deleting file:', error);
      // 不抛出错误，因为删除失败不应该影响主流程
    } else {
      console.log('File deleted successfully:', filePath);
    }
  } catch (error) {
    console.error('Error deleting image:', error);
    // 不抛出错误，因为删除失败不应该影响主流程
  }
}
