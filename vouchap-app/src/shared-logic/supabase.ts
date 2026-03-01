import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

// 仅在非 Web 且原生模块可用时加载 AsyncStorage，避免 Expo Go / 未 link 时崩溃
function getAuthStorage(): undefined | { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void>; removeItem: (key: string) => Promise<void> } {
  if (Platform.OS === 'web') return undefined;
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return AsyncStorage;
  } catch {
    return undefined;
  }
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
// 实际使用时会在首次调用前验证配置
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

// 上传图片到Supabase Storage（临时文件名，用于识别前上传）
// 建议使用 uploadReceiptImageTempWithSpace 按 space_id 分文件夹存储
export async function uploadReceiptImageTemp(fileUri: string, tempFileName: string): Promise<string> {
  return uploadReceiptImageTempWithSpace(fileUri, tempFileName, '');
}

/** 按 space_id 分文件夹上传到 receipts bucket，路径为 {spaceId}/{tempFileName}.{ext}；expenses/income 新上传使用此方法 */
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

    const fileExt = fileUri.split('.').pop()?.toLowerCase()?.replace(/\?.*$/, '') || 'jpg';
    const fileName = `${tempFileName}.${fileExt}`;
    const folder = spaceId && spaceId.trim() ? spaceId.trim() : 'unknown';
    const filePath = `${folder}/${fileName}`;
    const mimeType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;

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

    const fileExt = fileUri.split('.').pop()?.toLowerCase()?.replace(/\?.*$/, '') || 'jpg';
    const fileName = `${tempFileName}.${fileExt}`;
    const folder = clientSpaceId && clientSpaceId.trim() ? clientSpaceId.trim() : 'unknown';
    const filePath = `${folder}/${fileName}`;
    const mimeType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;

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

// 上传图片到Supabase Storage（使用receiptId作为文件名）
export async function uploadReceiptImage(fileUri: string, receiptId: string): Promise<string> {
  try {
    // 读取文件为 base64
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    // 转换为 ArrayBuffer
    const arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    
    const fileExt = fileUri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${receiptId}.${fileExt}`;
    // 文件路径：直接使用文件名，bucket 已在 from() 中指定
    const filePath = fileName;
    const mimeType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;

    console.log(`Uploading to bucket: ${STORAGE_BUCKET}, path: ${filePath}`);

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, arrayBuffer, {
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

// 获取图片URL
export function getReceiptImageUrl(filePath: string): string {
  const { data: { publicUrl } } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filePath);
  return publicUrl;
}

/** 上传项目封面到 Storage，路径 project-covers/{projectId}.{ext} */
export async function uploadProjectCover(fileUri: string, projectId: string): Promise<string> {
  try {
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const fileExt = fileUri.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `project-covers/${projectId}.${fileExt}`;
    const mimeType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, arrayBuffer, { contentType: mimeType, upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading project cover:', error);
    throw error;
  }
}

/** 上传发票图片到 Storage，路径 invoices/{invoiceId}.{ext} */
export async function uploadInvoiceImage(fileUri: string, invoiceId: string): Promise<string> {
  try {
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const fileExt = fileUri.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `invoices/${invoiceId}.${fileExt}`;
    const mimeType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, arrayBuffer, { contentType: mimeType, upsert: true });
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
  const fileExt = fileUri.split('.').pop()?.toLowerCase()?.replace(/\?.*$/, '') || 'jpg';
  const filePath = `sku/${skuId}.${fileExt}`;
  const mimeType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;
  const { error } = await supabase.storage.from(MARKETPLACE_BUCKET).upload(filePath, arrayBuffer, { contentType: mimeType, upsert: true });
  if (error) {
    console.error('Storage upload error:', error);
    throw new Error(error.message || 'Upload failed');
  }
  const { data: { publicUrl } } = supabase.storage.from(MARKETPLACE_BUCKET).getPublicUrl(filePath);
  return publicUrl;
}

/** 上传入库单图片（临时），路径 inbound/{spaceId}/{tempFileName}.{ext}；无 spaceId 时用 unknown */
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
    const fileExt = fileUri.split('.').pop()?.toLowerCase()?.replace(/\?.*$/, '') || 'jpg';
    const folder = spaceId && spaceId.trim() ? spaceId.trim() : 'unknown';
    const filePath = `inbound/${folder}/${tempFileName}.${fileExt}`;
    const mimeType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;
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

/** 上传入库单图片（正式），路径 inbound/{inboundId}.{ext} */
export async function uploadInboundImage(fileUri: string, inboundId: string): Promise<string> {
  try {
    const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
    const arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const fileExt = fileUri.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `inbound/${inboundId}.${fileExt}`;
    const mimeType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, arrayBuffer, { contentType: mimeType, upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading inbound image:', error);
    throw error;
  }
}

/** 上传出库单图片（临时），路径 outbound/{spaceId}/{tempFileName}.{ext}；无 spaceId 时用 unknown */
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
    const fileExt = fileUri.split('.').pop()?.toLowerCase()?.replace(/\?.*$/, '') || 'jpg';
    const folder = spaceId && spaceId.trim() ? spaceId.trim() : 'unknown';
    const filePath = `outbound/${folder}/${tempFileName}.${fileExt}`;
    const mimeType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;
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

/** 上传出库单图片（正式），路径 outbound/{outboundId}.{ext} */
export async function uploadOutboundImage(fileUri: string, outboundId: string): Promise<string> {
  try {
    const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
    const arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const fileExt = fileUri.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `outbound/${outboundId}.${fileExt}`;
    const mimeType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, arrayBuffer, { contentType: mimeType, upsert: true });
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
