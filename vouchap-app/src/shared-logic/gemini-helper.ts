// 辅助函数：列出所有可用的 Gemini 模型
import { listModelsViaGeminiProxy } from './gemini-server-sdk';

/**
 * 严格获取 API Key
 * 排除 EAS 可能注入的 "${EXPO_PUBLIC_...}" 这种无效字符串
 */
const getSafeApiKey = (): string => 'server-side-gemini-proxy';
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
  try {
    return await listModelsViaGeminiProxy();
  } catch (error: any) {
    console.error('Error listing models:', error);
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

// ── Dynamic model list: listModels → filter generateContent → cost-sort → cache (TTL) ──

type GeminiListModelRow = { name: string; supportedGenerationMethods?: string[] };

let dynamicModelsSortedCache: string[] | null = null;
let dynamicModelsSortedCacheAt = 0;
const DYNAMIC_MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

/** Clear when API returns 404/503/429 etc. so next recognition run refetches listModels. */
export function invalidateGeminiModelTryOrderCache(): void {
  dynamicModelsSortedCache = null;
  dynamicModelsSortedCacheAt = 0;
}

export function normalizeGeminiModelApiName(name: string): string {
  let s = String(name || '').trim();
  if (!s) return '';
  if (s.startsWith('models/')) s = s.slice('models/'.length);
  return s;
}

function modelIsGenerateContentCandidate(m: GeminiListModelRow): boolean {
  const methods = m.supportedGenerationMethods;
  if (!methods?.includes('generateContent')) return false;
  const id = normalizeGeminiModelApiName(m.name).toLowerCase();
  if (!id.startsWith('gemini')) return false;
  if (id.includes('embedding') || id.includes('embed')) return false;
  if (id.includes('aqa')) return false;
  return true;
}

/**
 * Heuristic cost / latency tier: lower = cheaper = try first.
 * Google does not expose prices on listModels; we maintain rough ordering as catalog evolves.
 */
export function scoreGeminiModelCostHeuristic(modelId: string): number {
  const id = modelId.toLowerCase();
  const rules: Array<{ re: RegExp; score: number }> = [
    { re: /flash.?lite|flash-lite|2\.5-flash-lite|2\.0-flash-lite/i, score: 8 },
    { re: /gemini-1\.5-flash-8b/i, score: 14 },
    { re: /gemini-1\.5-flash(?!-8b)/i, score: 18 },
    { re: /gemini-2\.0-flash(?!.*lite)/i, score: 28 },
    { re: /gemini-2\.5-flash(?!.*lite)/i, score: 32 },
    { re: /gemini-3-flash|flash-preview/i, score: 38 },
    { re: /gemini-1\.5-pro/i, score: 62 },
    { re: /gemini-2\.5-pro/i, score: 68 },
    { re: /gemini-3-pro|pro-preview/i, score: 78 },
    { re: /gemini-pro(?!vision)/i, score: 72 },
    { re: /flash/i, score: 45 },
  ];
  for (const { re, score } of rules) {
    if (re.test(id)) return score;
  }
  return 900;
}

function sortGeminiModelIdsByCost(ids: string[]): string[] {
  return [...new Set(ids)].sort((a, b) => {
    const d = scoreGeminiModelCostHeuristic(a) - scoreGeminiModelCostHeuristic(b);
    if (d !== 0) return d;
    return a.localeCompare(b);
  });
}

async function fetchDynamicGeminiModelsSortedByCost(): Promise<string[]> {
  const models = (await listAvailableModels()) as GeminiListModelRow[];
  const ids = models
    .filter(modelIsGenerateContentCandidate)
    .map((m) => normalizeGeminiModelApiName(m.name))
    .filter(Boolean);
  return sortGeminiModelIdsByCost(ids);
}

async function getDynamicGeminiModelsSortedCached(): Promise<string[]> {
  const now = Date.now();
  if (dynamicModelsSortedCache && now - dynamicModelsSortedCacheAt < DYNAMIC_MODEL_CACHE_TTL_MS) {
    return dynamicModelsSortedCache;
  }
  try {
    const sorted = await fetchDynamicGeminiModelsSortedByCost();
    if (sorted.length > 0) {
      dynamicModelsSortedCache = sorted;
      dynamicModelsSortedCacheAt = Date.now();
    }
    return sorted;
  } catch {
    return [];
  }
}

function mergeDynamicSortedWithStaticOrder(
  dynamicSorted: string[],
  staticOrder: string[],
  preferProAfterFlash: boolean,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (m: string) => {
    if (!m || seen.has(m)) return;
    seen.add(m);
    out.push(m);
  };
  const pro = GEMINI_PRO_FALLBACK_MODEL;

  if (preferProAfterFlash && dynamicSorted.length > 0) {
    push(dynamicSorted[0]);
    push(pro);
    for (let i = 1; i < dynamicSorted.length; i += 1) push(dynamicSorted[i]);
  } else {
    for (const m of dynamicSorted) push(m);
  }

  for (const m of staticOrder) push(m);
  return out;
}

/**
 * Full try-order for generateContent: Google listModels (cost-sorted) first, then static fallbacks.
 * Call invalidateGeminiModelTryOrderCache() on 404/503 so the next run refetches the catalog.
 */
export async function resolveGeminiModelsToTryOrder(complexity: {
  promptTextLength: number;
  inlineBase64Length?: number;
  mimeType?: string;
}): Promise<string[]> {
  const preferPro = inferComplexGeminiContent(complexity);
  const staticOrder = buildGeminiModelOrder({ preferProAfterFlash: preferPro });
  const dynamicSorted = await getDynamicGeminiModelsSortedCached();
  return mergeDynamicSortedWithStaticOrder(dynamicSorted, staticOrder, preferPro);
}

// 获取支持图像/音频输入的第一个可用模型（与 resolveGeminiModelsToTryOrder 同源：成本序第一个）
export async function getAvailableImageModel(): Promise<string | null> {
  const FALLBACK_MODEL = GEMINI_PRIMARY_MODEL;
  try {
    if (!apiKey) return null;
    const sorted = await getDynamicGeminiModelsSortedCached();
    if (sorted.length > 0) return sorted[0];
    return FALLBACK_MODEL;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('无法动态获取模型列表，使用默认模型:', msg);
    return FALLBACK_MODEL;
  }
}