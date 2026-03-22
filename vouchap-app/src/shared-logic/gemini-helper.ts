// 辅助函数：列出所有可用的 Gemini 模型
import { GoogleGenerativeAI } from '@google/generative-ai';
import Constants from 'expo-constants';

/**
 * 严格获取 API Key
 * 排除 EAS 可能注入的 "${EXPO_PUBLIC_...}" 这种无效字符串
 */
const getSafeApiKey = (): string => {
  const key = process.env.EXPO_PUBLIC_GEMINI_API_KEY || 
              Constants.expoConfig?.extra?.geminiApiKey || 
              '';
  
  // 核心修复：如果 Key 包含 ${ 符号，说明是 EAS 占位符注入失败，视为空
  if (key.includes('${') || key === 'undefined' || !key) {
    return '';
  }
  return key;
};

const apiKey = getSafeApiKey();

/**
 * 校验 Key 是否存在
 * 如果是在打包后的 APK (非 __DEV__) 中发现 Key 缺失，直接弹窗告知用户原因
 */
if (!apiKey) {
  const errorMsg = "Gemini API Key 未配置或注入失败（检测到占位符）";
  console.error(errorMsg);
  if (!__DEV__) {
    // 只有在非开发环境下才弹窗，方便 APK 调试
    // alert(errorMsg); 
  }
}

// 列出所有可用模型
export async function listAvailableModels() {
  if (!apiKey) {
    throw new Error("API_KEY_MISSING");
  }

  try {
    // 增加超时控制，防止网络环境差导致应用卡死
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
      { signal: controller.signal }
    );
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Google API Error: ${response.status} - ${errorData?.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    return data.models || [];
  } catch (error: any) {
    console.error('Error listing models:', error);
    // 针对网络连接失败（通常是没挂代理）给出明确提示
    if (error.message === 'Aborted' || error.message.includes('Network request failed')) {
      throw new Error("NETWORK_ERROR_OR_PROXY_REQUIRED");
    }
    throw error;
  }
}

/** 应用内默认：成本优先用 1.5 Flash；复杂场景由 gemini-2.5-pro 兜底（gemini-1.5-pro 已从 v1 generateContent 移除） */
export const GEMINI_PRIMARY_MODEL = 'gemini-1.5-flash' as const;
export const GEMINI_PRO_FALLBACK_MODEL = 'gemini-2.5-pro' as const;

const LONG_PROMPT_CHARS = 10_000;
const LARGE_INLINE_BASE64 = 800_000;

/** 判断当前请求是否更适合先尝试 Pro（长 prompt、大附件、PDF 等） */
export function inferComplexGeminiContent(args: {
  promptTextLength?: number;
  inlineBase64Length?: number;
  mimeType?: string;
}): boolean {
  const promptTextLength = args.promptTextLength ?? 0;
  const inlineBase64Length = args.inlineBase64Length ?? 0;
  const { mimeType } = args;
  if (promptTextLength >= LONG_PROMPT_CHARS) return true;
  if (inlineBase64Length >= LARGE_INLINE_BASE64) return true;
  if (mimeType === 'application/pdf') return true;
  return false;
}

/** 其余模型：新系列 Flash 优先；不含 GEMINI_PRO_FALLBACK_MODEL（由 buildGeminiModelOrder 单独插入） */
const GEMINI_MODEL_TAIL = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
] as const;

/**
 * 统一模型尝试顺序：默认 gemini-1.5-flash 优先，复杂时 gemini-2.5-pro 紧接兜底，否则 Pro 在队尾。
 */
export function buildGeminiModelOrder(opts?: { preferProAfterFlash?: boolean }): string[] {
  const primary = GEMINI_PRIMARY_MODEL;
  const pro = GEMINI_PRO_FALLBACK_MODEL;
  const tail = [...GEMINI_MODEL_TAIL];
  if (opts?.preferProAfterFlash) {
    return [primary, pro, ...tail];
  }
  return [primary, ...tail, pro];
}

/** API 探测到的可用模型优先，再与静态顺序合并去重 */
export function mergeGeminiModelsWithAvailable(
  available: string | null | undefined,
  ordered: readonly string[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (m: string) => {
    if (!m || seen.has(m)) return;
    seen.add(m);
    out.push(m);
  };
  if (available) push(available);
  for (const m of ordered) push(m);
  return out;
}

// 获取支持图像/音频输入的第一个可用模型（应用内优先 1.5 Flash，与 buildGeminiModelOrder 一致）
export async function getAvailableImageModel(): Promise<string | null> {
  const FALLBACK_MODEL = GEMINI_PRIMARY_MODEL;

  try {
    if (!apiKey) return null;

    const models = await listAvailableModels();
    
    const supportedModels = models.filter((m: any) => 
      m.supportedGenerationMethods && 
      m.supportedGenerationMethods.includes('generateContent')
    );
    
    const preferredModels = [
      GEMINI_PRIMARY_MODEL,
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash-lite',
      'gemini-2.0-flash',
      'gemini-2.5-flash',
      'gemini-3-flash-preview',
      GEMINI_PRO_FALLBACK_MODEL,
      'gemini-3-pro-preview',
    ];
    
    for (const preferred of preferredModels) {
      const found = supportedModels.find((m: any) => 
        m.name.includes(preferred) || m.name === `models/${preferred}`
      );
      if (found) {
        return found.name.replace(/^models\//, '');
      }
    }
    
    if (supportedModels.length > 0) {
      return supportedModels[0].name.replace(/^models\//, '');
    }
    
    return FALLBACK_MODEL;
  } catch (error: any) {
    console.warn('无法动态获取模型列表，使用默认模型:', error.message);
    return FALLBACK_MODEL;
  }
}