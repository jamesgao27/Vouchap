import { GoogleGenerativeAI } from './gemini-server-sdk';
import { getCategories } from './categories';
import { getAttributions } from './attributions';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_EXPENSE_ATTRIBUTIONS,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_INCOME_ATTRIBUTIONS,
} from './category-attribution-presets';
import { getAccountsForOptions } from './accounts';
import { getEntityOptions } from './entity-list';
import { getWarehousesForOptions, getLocationsByWarehouseForOptions } from './warehouse';
import { getSkusForOptions } from './skus';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as FileSystemNew from 'expo-file-system';
import { GeminiReceiptResult, GeminiVoucherResult, GeminiInboundOutboundResult, VoucherLogType, ExtractedClient, ClientRecognitionResult } from '@/types';
import {
  getAvailableImageModel,
  buildGeminiModelOrder,
  mergeGeminiModelsWithAvailable,
  inferComplexGeminiContent,
} from './gemini-helper';
import { getMostFrequentCurrency, getCurrenciesByUsage } from './database';
import { normalizeShortDate, getLocalDateString } from './date-utils';
import { supabase } from './supabase';
import { isSpreadsheetMime, spreadsheetBase64ToPlainText } from './spreadsheet-to-text';
import { isWordDocumentMime, wordDocumentBase64ToPlainText } from './word-document-to-text';
import { aliasDistinctFromLineName, pickReceiptLineItemAlias } from './receipt-item-alias';

/** Do not log signed URLs, tokens, or receipt text in production builds. */
function geminiDevLog(...args: unknown[]) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(...args);
  }
}

/**
 * 图片/文档路径在 parse 后立刻对 items 做 reduce/map；若模型省略 items 或非数组/空数组会抛错，
 * 整轮识别失败则无法落库（老版本与文字路径行为不一致）。与 recognizeReceiptFromText 对齐：至少一行。
 */
function ensureGeminiParsedReceiptItems(
  parsedResult: Record<string, unknown>,
  opts: { categoryNames: string[]; defaultAttributionName: string },
): void {
  const pr = parsedResult as Record<string, any>;
  const defaultCategory = opts.categoryNames.length > 0 ? opts.categoryNames[0] : 'Meal';
  const defaultAttr = opts.defaultAttributionName || 'Personal';
  const totalAmount = Number(pr.totalAmount) || 0;
  const tax = pr.tax !== undefined ? Number(pr.tax) : 0;
  const fallbackPrice = Math.max(0, totalAmount - tax);

  if (!pr.items || !Array.isArray(pr.items) || pr.items.length === 0) {
    console.warn(
      '[gemini] receipt items missing or empty; synthesizing one line from total (image or document path)',
    );
    pr.items = [
      {
        name: 'General Purchase',
        categoryName: defaultCategory,
        attributionName: defaultAttr,
        price: fallbackPrice,
      },
    ];
  }
}

/** De-emphasize frequency order bias: provide stable deduped alphabetical options to the model. */
function toUnrankedOptionList(names: string[]): string[] {
  return [...new Set((names || []).map((n) => String(n || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function resolveReadableItemName(item: any): { name: string; itemAlias?: string } {
  const rawName = String(item?.name ?? item?.description ?? 'Unknown Item').trim();
  const alias = aliasDistinctFromLineName(
    rawName,
    pickReceiptLineItemAlias(item as Record<string, unknown>),
  );
  if (!rawName) return { name: 'Unknown Item', ...(alias ? { itemAlias: alias } : {}) };
  return { name: rawName, ...(alias ? { itemAlias: alias } : {}) };
}

// 引用 gemini-helper 中处理好的安全判断逻辑（如果 gemini-helper 导出了 apiKey）
// 或者直接在此处复制安全获取逻辑：
const getSafeKey = () => {
  return 'server-side-gemini-proxy';
};

function getCurrentGeminiApiKey(): string {
  return 'server-side-gemini-proxy';
}

/** User-facing hint: AI runs in Supabase Edge Function `gemini-proxy`, not in the app bundle. */
const GEMINI_PROXY_SETUP_HINT =
  'Configure Supabase Edge Function `gemini-proxy` secrets (GEMINI_API_KEY required; optional GEMINI_MODEL_DEFAULT, GEMINI_ENFORCE_SERVER_MODEL) and redeploy the function.';

function throwGeminiProxyUnavailable(detail?: string): never {
  const err = new Error(
    detail ? `${detail}\n\n${GEMINI_PROXY_SETUP_HINT}` : `AI service unavailable.\n\n${GEMINI_PROXY_SETUP_HINT}`,
  ) as Error & { code?: string };
  err.code = 'GEMINI_PROXY_UNAVAILABLE';
  throw err;
}

const apiKey = getSafeKey();

const genAI = (apiKey && apiKey !== '')
  ? new GoogleGenerativeAI(apiKey)
  : null;

// 默认尝试顺序：优先 gemini-1.5-flash，复杂场景 gemini-2.5-pro 紧接兜底（1.5-pro 已从 v1 移除），其余为兼容/配额回退
const POSSIBLE_MODELS = buildGeminiModelOrder();

function geminiModelsToTry(
  available: string | null | undefined,
  complexity: { promptTextLength: number; inlineBase64Length?: number; mimeType?: string }
): string[] {
  return mergeGeminiModelsWithAvailable(
    available,
    buildGeminiModelOrder({
      preferProAfterFlash: inferComplexGeminiContent(complexity),
    })
  );
}

// 动态获取可用模型的缓存
let availableModelCache: string | null = null;

/** 若错误为 404/模型不可用，清除缓存以便下次重新拉取可用模型列表 */
function clearModelCacheIfUnavailable(err: unknown) {
  const msg = err != null ? String(err) : '';
  if (/404|not found|not supported for generateContent/i.test(msg)) {
    availableModelCache = null;
  }
}

/** 小票识别统一 JSON 输出规范（精简版提示词，完整校验仍在下游 ensureGeminiParsedReceiptItems） */
const RECEIPT_JSON_ITEMS_RULE =
  'items: ≥1 row. Each: name, categoryName, attributionName, price; itemAlias when line is SKU/code/cryptic (plain English label, no amounts in itemAlias).';
const RECEIPT_JSON_ITEMS_EXAMPLE = {
  name: 'FD BRKFST 4729',
  itemAlias: 'Breakfast sandwich combo',
  categoryName: 'Food',
  attributionName: 'Personal',
  price: 12.99,
};

/** 图片解析引导（短） */
const RECEIPT_IMAGE_PARSE_INTRO =
  'North American retail receipt: extract purchase fields to one JSON object. Be concise in free-text comment fields.\n\n';

/** 文档解析引导（短；规则与图片共用） */
const RECEIPT_DOCUMENT_PARSE_INTRO =
  'Document (PDF/Word): read full text/layout, same JSON schema as receipt photos. imageQuality = readability/completeness 0–1.\n\n';

/** 小票数据识别规则（图片/文档共用，精简 token；字段约束与下游解析不变） */
function buildReceiptExtractionRules(opts: {
  supplierListImg: string;
  categoryList: string;
  attributionNamesCsv: string;
  paymentAccountList: string;
  defaultCurrency: string;
  currencyList: string;
  defaultAttributionName: string;
}): string {
  const {
    supplierListImg,
    categoryList,
    attributionNamesCsv,
    paymentAccountList,
    defaultCurrency,
    currencyList,
    defaultAttributionName,
  } = opts;
  return `Lists (semantic match; else new values may be created). Suppliers: [${supplierListImg || 'None'}]. Categories: [${categoryList}]. Attributions: [${attributionNamesCsv}], default "${defaultAttributionName}". Payment accounts: [${paymentAccountList || 'None'}]. Currencies (hints): [${currencyList}], default "${defaultCurrency}".

Single pass only: include EVERYTHING in this one JSON (line items, supplierInfo, quality, consistency)—the app does not run a second image call for merchant tax/phone/address.

Rules: (1) supplierName—merchant header; not generic words. (2) supplierInfo—scan full receipt for taxNumber (US EIN / CA GST etc.), phone, address when printed (null only if absent). (3) date YYYY-MM-DD. (4) totalAmount. (5) currency ISO. (6) paymentAccountName from list or card hint. (7) tax if printed (app may reconcile); no extra tax jurisdiction fields. (8) ${RECEIPT_JSON_ITEMS_RULE} (9) imageQuality clarity/completeness 0–1 + short comments. (10) dataConsistency. (11) confidence 0–1.

Return ONLY valid JSON (no markdown fences). Required shape:
{"supplierName":"string","supplierInfo":{"taxNumber":null,"phone":null,"address":null},"date":"YYYY-MM-DD","totalAmount":0,"currency":"USD","paymentAccountName":null,"tax":0,"items":[{"name":"","itemAlias":"","categoryName":"","attributionName":"","price":0}],"imageQuality":{"clarity":0,"completeness":0,"clarityComment":"","completenessComment":""},"dataConsistency":{"itemsSum":0,"itemsSumMatchesTotal":false,"missingItems":false,"consistencyComment":""},"confidence":0}`;
}

const INVOICE_JSON_ITEMS_RULE =
  'items: ≥1 row. Each: name, categoryName, attributionName, price; itemAlias when line is SKU/code/cryptic (plain English label, no amounts in itemAlias).';

const INVOICE_IMAGE_PARSE_INTRO =
  "Sales invoice, payment advice, or incoming payment slip: extract fields for money received by the user's business. Identify the customer/payer (Bill To, buyer, client) and any printed tax ID, phone, and mailing address for that party.\n\n";

function buildInvoiceImageExtractionRules(opts: {
  customerListImg: string;
  categoryList: string;
  attributionNamesCsv: string;
  paymentAccountList: string;
  defaultCurrency: string;
  currencyList: string;
  defaultAttributionName: string;
}): string {
  const {
    customerListImg,
    categoryList,
    attributionNamesCsv,
    paymentAccountList,
    defaultCurrency,
    currencyList,
    defaultAttributionName,
  } = opts;
  return `Lists (semantic match; else new values may be created). Customers / counterparties: [${customerListImg || 'None'}]. Categories: [${categoryList}]. Attributions: [${attributionNamesCsv}], default "${defaultAttributionName}". Deposit/receipt accounts: [${paymentAccountList || 'None'}]. Currencies (hints): [${currencyList}], default "${defaultCurrency}".

Single pass only: include EVERYTHING in this one JSON (line items, supplierInfo for customer tax/phone/address, quality, consistency)—the app does not run a second image call.

Rules: (1) customerName—the buyer/payer or Bill To party (not generic words). (2) supplierInfo—the CUSTOMER taxNumber (VAT/GST/EIN etc.), phone, and address as printed for that party; keep JSON key supplierInfo for app compatibility; null only when absent. (3) date YYYY-MM-DD. (4) totalAmount. (5) currency ISO. (6) paymentAccountName from list when visible. (7) tax if printed (else app may infer). (8) ${INVOICE_JSON_ITEMS_RULE} (9) imageQuality clarity/completeness 0–1 + short comments. (10) dataConsistency. (11) confidence 0–1.

Return ONLY valid JSON (no markdown fences). Required shape:
{"customerName":"string","supplierInfo":{"taxNumber":null,"phone":null,"address":null},"date":"YYYY-MM-DD","totalAmount":0,"currency":"USD","paymentAccountName":null,"tax":0,"items":[{"name":"","itemAlias":"","categoryName":"","attributionName":"","price":0}],"imageQuality":{"clarity":0,"completeness":0,"clarityComment":"","completenessComment":""},"dataConsistency":{"itemsSum":0,"itemsSumMatchesTotal":false,"missingItems":false,"consistencyComment":""},"confidence":0}`;
}

/** Normalize tax/phone/address from supplierInfo or customerInfo (Gemini may emit either). */
function normalizePrintedPartyContact(raw: unknown): GeminiVoucherResult['supplierInfo'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown) => {
    if (v == null || v === 'null') return undefined;
    const s = String(v).trim();
    return s.length ? s : undefined;
  };
  const taxNumber = str(o.taxNumber);
  const phone = str(o.phone);
  const address = str(o.address);
  if (!taxNumber && !phone && !address) return undefined;
  return { taxNumber, phone, address };
}

/** Load a remote image URL to base64 for Gemini inlineData (Web + Native). */
async function loadImageUrlAsBase64ForGemini(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
  let mimeType = 'image/jpeg';
  if (imageUrl.includes('.png')) mimeType = 'image/png';
  else if (imageUrl.includes('.gif')) mimeType = 'image/gif';
  else if (imageUrl.includes('.webp')) mimeType = 'image/webp';

  if (Platform.OS === 'web') {
    const res = await fetch(imageUrl, { mode: 'cors' });
    if (!res.ok) throw new Error('Failed to fetch image from URL');
    const blob = await res.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const b64 = dataUrl.split(',')[1];
        resolve(b64 ?? '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { base64, mimeType };
  }
  const downloadResult = await FileSystem.downloadAsync(
    imageUrl,
    FileSystem.documentDirectory + `temp-${Date.now()}.jpg`
  );
  if (!downloadResult.uri) throw new Error('Failed to download image from URL');
  const base64 = await FileSystem.readAsStringAsync(downloadResult.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  try {
    await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true });
  } catch (e) {
    console.warn('Failed to delete temp file:', e);
  }
  return { base64, mimeType };
}

// 识别小票内容（使用图片 URL）
export async function recognizeReceipt(imageUrl: string): Promise<GeminiReceiptResult> {
  const currentApiKey = getCurrentGeminiApiKey();
  geminiDevLog('Starting receipt recognition (Supabase gemini-proxy)...');
  geminiDevLog('Image URL:', imageUrl);

  const currentGenAI = new GoogleGenerativeAI(currentApiKey);

  // 首先尝试从 API 获取可用模型（如果缓存为空）
  if (!availableModelCache) {
    geminiDevLog('Attempting to fetch available models from API...');
    try {
      const availableModel = await getAvailableImageModel();
      if (availableModel) {
        availableModelCache = availableModel;
        geminiDevLog('✅ Found available model via API:', availableModelCache);
      } else {
        console.warn('⚠️  No image models found via API');
      }
    } catch (error) {
      console.warn('⚠️  Could not fetch available models from API:', error);
      console.warn('Will try default model list...');
    }
  }

  // 支出：获取支出分类与用途，分别提交模型
  let categoryNames: string[] = [];
  try {
    const categories = await getCategories('expense');
    categoryNames = categories.map(cat => cat.name);
  } catch (error) {
    console.warn('Failed to fetch expense categories, using default list:', error);
    categoryNames = [...DEFAULT_EXPENSE_CATEGORIES];
  }
  if (categoryNames.length === 0) categoryNames = [...DEFAULT_EXPENSE_CATEGORIES];

  let attributionNames: string[] = [];
  try {
    const attributions = await getAttributions('expense');
    attributionNames = attributions.map(p => p.name);
  } catch (error) {
    console.warn('Failed to fetch expense attributions, using default list:', error);
    attributionNames = [...DEFAULT_EXPENSE_ATTRIBUTIONS];
  }
  if (attributionNames.length === 0) attributionNames = [...DEFAULT_EXPENSE_ATTRIBUTIONS];

  // 获取用户已有的支付账户列表（按使用频率排序）
  let paymentAccountNames: string[] = [];
  try {
    const accounts = await getAccountsForOptions();
    paymentAccountNames = accounts.map(pa => pa.name);
  } catch (error) {
    console.warn('Failed to fetch payment accounts:', error);
  }

  // 获取用户历史小票中的币种列表（按使用频率排序）
  let userCurrencies: string[] = [];
  try {
    userCurrencies = await getCurrenciesByUsage();
  } catch (error) {
    console.warn('Failed to fetch currency usage:', error);
  }

  let supplierNamesImg: string[] = [];
  try {
    const entities = await getEntityOptions();
    supplierNamesImg = entities.map((e) => e.name);
  } catch (e) {
    console.warn('Failed to fetch suppliers:', e);
  }

  const categoryList = toUnrankedOptionList(categoryNames).join(', ');
  const attributionNamesCsv = toUnrankedOptionList(attributionNames).join(', ');
  const paymentAccountList = paymentAccountNames.length > 0 ? paymentAccountNames.join(', ') : '';
  const supplierListImg = supplierNamesImg.length > 0 ? supplierNamesImg.join(', ') : '';
  const defaultCurrency = userCurrencies.length > 0 ? userCurrencies[0] : 'USD';
  const currencyList =
    userCurrencies.length > 0 ? userCurrencies.slice(0, 6).join(', ') : 'USD, CAD, MXN';

  const extractionRules = buildReceiptExtractionRules({
    supplierListImg,
    categoryList,
    attributionNamesCsv,
    paymentAccountList,
    defaultCurrency,
    currencyList,
    defaultAttributionName: 'Personal',
  });
  const prompt = RECEIPT_IMAGE_PARSE_INTRO + extractionRules;

  geminiDevLog('Downloading image from URL...');
  geminiDevLog('Image URL:', imageUrl);

  const { base64, mimeType } = await loadImageUrlAsBase64ForGemini(imageUrl);

  geminiDevLog('Image downloaded, size:', base64.length, 'bytes, mime type:', mimeType);

  const modelsToTry = geminiModelsToTry(availableModelCache, {
    promptTextLength: prompt.length,
    inlineBase64Length: base64.length,
    mimeType,
  });

  // 使用 base64 图片数据
  const imagePart = {
    inlineData: {
      data: base64,
      mimeType: mimeType,
    },
  };

  // 同一 base64 按模型列表依次尝试（模型不可用/坏输出时换模型；外层另有 runWithRecognitionRetry）
  let lastError: Error | null = null;

  for (const modelName of modelsToTry) {
    try {
      geminiDevLog(`Trying model: ${modelName}...`);
      const model = currentGenAI.getGenerativeModel({ model: modelName });

      geminiDevLog('Sending request to Gemini API...');
      const result = await model.generateContent([prompt, imagePart]);
      const apiResponse = await result.response;
      const text = apiResponse.text();
      if (!text || !String(text).trim()) {
        throw new Error('Empty model response');
      }
      geminiDevLog(`✅ Model ${modelName} worked! Response length:`, text.length);

      // 提取JSON部分（去除可能的markdown代码块标记）
      let jsonText = text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsedResult: GeminiReceiptResult = JSON.parse(jsonText);
      ensureGeminiParsedReceiptItems(parsedResult as unknown as Record<string, unknown>, {
        categoryNames,
        defaultAttributionName: 'Personal',
      });

      // 验证和规范化数据
      const defaultCategory = categoryNames.length > 0 ? categoryNames[0] : 'Meal';
      // 兼容处理：支持 paymentAccount 和 paymentAccountName 两种字段名
      const paymentAccountName = parsedResult.paymentAccountName || (parsedResult as any).paymentAccount || undefined;

      // 处理图片质量评价
      const imageQuality = parsedResult.imageQuality ? {
        clarity: parsedResult.imageQuality.clarity !== undefined ? Number(parsedResult.imageQuality.clarity) : undefined,
        completeness: parsedResult.imageQuality.completeness !== undefined ? Number(parsedResult.imageQuality.completeness) : undefined,
        clarityComment: parsedResult.imageQuality.clarityComment,
        completenessComment: parsedResult.imageQuality.completenessComment,
      } : undefined;

      // 处理数据一致性检查
      const dataConsistency = parsedResult.dataConsistency ? {
        itemsSum: parsedResult.dataConsistency.itemsSum !== undefined ? Number(parsedResult.dataConsistency.itemsSum) : undefined,
        itemsSumMatchesTotal: parsedResult.dataConsistency.itemsSumMatchesTotal !== undefined ? Boolean(parsedResult.dataConsistency.itemsSumMatchesTotal) : undefined,
        missingItems: parsedResult.dataConsistency.missingItems !== undefined ? Boolean(parsedResult.dataConsistency.missingItems) : undefined,
        consistencyComment: parsedResult.dataConsistency.consistencyComment,
      } : undefined;

      // 计算实际的明细金额总和（用于验证，统一用 price，兼容 amount）
      const calculatedItemsSum = parsedResult.items.reduce((sum, item) => sum + (Number((item as any).price ?? (item as any).amount) || 0), 0);
      const totalAmount = Number(parsedResult.totalAmount) || 0;
      const inferredTax = totalAmount - calculatedItemsSum;
      const tax = inferredTax > 0 ? Number(inferredTax.toFixed(2)) : 0;
      const expectedTotal = calculatedItemsSum + tax;
      const actualItemsSumMatches = Math.abs(expectedTotal - totalAmount) <= 0.01;

      return {
        supplierName: parsedResult.supplierName || 'Unknown Supplier',
        supplierInfo: parsedResult.supplierInfo ? {
          taxNumber: parsedResult.supplierInfo.taxNumber && parsedResult.supplierInfo.taxNumber !== 'null' ? parsedResult.supplierInfo.taxNumber : undefined,
          phone: parsedResult.supplierInfo.phone && parsedResult.supplierInfo.phone !== 'null' ? parsedResult.supplierInfo.phone : undefined,
          address: parsedResult.supplierInfo.address && parsedResult.supplierInfo.address !== 'null' ? parsedResult.supplierInfo.address : undefined,
        } : undefined,
        date: normalizeShortDate(parsedResult.date || getLocalDateString()),
        totalAmount: totalAmount,
        currency: parsedResult.currency || 'CNY',
        paymentAccountName: paymentAccountName,
        tax: tax,
        taxJurisdictionCountry: null,
        taxJurisdictionRegion: null,
        items: parsedResult.items.map((item: any) => ({
          ...resolveReadableItemName(item),
          categoryName: item.categoryName ?? item.category ?? defaultCategory,
          price: Number(item.price ?? item.amount ?? 0),
          attributionName: item.attributionName ?? item.purposeName ?? item.purpose ?? 'Personal',
          isAsset: item.isAsset !== undefined ? Boolean(item.isAsset) : false,
          confidence: item.confidence !== undefined ? Number(item.confidence) : 0.8,
        })),
        confidence: parsedResult.confidence !== undefined ? Number(parsedResult.confidence) : 0.8,
        imageQuality: imageQuality,
        dataConsistency: dataConsistency || {
          itemsSum: calculatedItemsSum,
          itemsSumMatchesTotal: actualItemsSumMatches,
          missingItems: !actualItemsSumMatches && calculatedItemsSum < totalAmount,
          consistencyComment: actualItemsSumMatches
            ? 'Items sum matches total'
            : `Items sum (${calculatedItemsSum.toFixed(2)}) differs from total (${totalAmount.toFixed(2)}) by ${Math.abs(expectedTotal - totalAmount).toFixed(2)}`,
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`❌ Model ${modelName} failed:`, lastError.message);
      clearModelCacheIfUnavailable(error);

      const errorMsg = lastError.message.toLowerCase();
      // 模型不可用：换下一个（同一请求内仍传同一图片，不重复下载）
      if (errorMsg.includes('not found') || errorMsg.includes('404')) {
        geminiDevLog(`  Model ${modelName} unavailable, next model...`);
        continue;
      }
      // 空响应 / 非 JSON / 解析失败：换下一个模型（原先直接 break 会导致连试多模型却只吃最后一次）
      if (
        errorMsg.includes('empty model response') ||
        /unexpected token|json|parse|syntax|expected json/i.test(errorMsg)
      ) {
        geminiDevLog(`  Model ${modelName} bad output, next model...`);
        continue;
      }
      // 认证 / 额度：不必换模型
      if (
        errorMsg.includes('api key') ||
        errorMsg.includes('401') ||
        errorMsg.includes('403') ||
        errorMsg.includes('quota') ||
        errorMsg.includes('429') ||
        errorMsg.includes('permission')
      ) {
        break;
      }
      // 其余错误：尝试列表中的下一模型
      geminiDevLog(`  Model ${modelName} error, next model if any...`);
      continue;
    }
  }

  // 如果所有模型都失败了
  console.error('All models failed. Last error:', lastError);

  if (lastError) {
    const errorMsg = lastError.message.toLowerCase();

    if (errorMsg.includes('api key') || errorMsg.includes('api_key') || errorMsg.includes('invalid api key') || errorMsg.includes('401')) {
      throwGeminiProxyUnavailable(`Gemini rejected the request (often invalid or missing server GEMINI_API_KEY). Original: ${lastError.message}`);
    }

    // 配额相关错误
    if (errorMsg.includes('quota') || errorMsg.includes('429') || errorMsg.includes('rate limit')) {
      throw new Error(`API quota exhausted or limit reached\nOriginal error: ${lastError.message}`);
    }

    // 权限相关错误
    if (errorMsg.includes('permission') || errorMsg.includes('403') || errorMsg.includes('forbidden')) {
      throwGeminiProxyUnavailable(`Permission denied calling AI. Original: ${lastError.message}`);
    }

    // 模型不存在错误
    if (errorMsg.includes('not found') || errorMsg.includes('404')) {
      throwGeminiProxyUnavailable(
        `No working Gemini model (404). Tried: ${POSSIBLE_MODELS.join(', ')}. Adjust GEMINI_MODEL_DEFAULT or GEMINI_ENFORCE_SERVER_MODEL on the server. Original: ${lastError.message}`,
      );
    }

    // 网络连接错误
    if (errorMsg.includes('network') ||
      errorMsg.includes('fetch') ||
      errorMsg.includes('connection') ||
      errorMsg.includes('timeout') ||
      errorMsg.includes('econnrefused') ||
      errorMsg.includes('failed to fetch') ||
      errorMsg.includes('generativelanguage.googleapis.com')) {
      throwGeminiProxyUnavailable(`Network error reaching AI (check device connectivity and that gemini-proxy is deployed). Original: ${lastError.message}`);
    }

    // 其他错误
    throwGeminiProxyUnavailable(`Receipt recognition failed (${lastError.name}): ${lastError.message}`);
  }

  throw new Error('Receipt recognition failed: Unknown error');
}

/** Income voucher photo: one multimodal pass returns customerName, supplierInfo (customer tax/phone/address), and line items—aligned with expense receipt single-call behavior. */
export async function recognizeInvoiceFromImage(imageUrl: string): Promise<GeminiVoucherResult> {
  const currentApiKey = getCurrentGeminiApiKey();
  geminiDevLog('Starting invoice (income) image recognition...');
  geminiDevLog('Image URL:', imageUrl);

  const currentGenAI = new GoogleGenerativeAI(currentApiKey);

  if (!availableModelCache) {
    geminiDevLog('Attempting to fetch available models from API...');
    try {
      const availableModel = await getAvailableImageModel();
      if (availableModel) {
        availableModelCache = availableModel;
        geminiDevLog('✅ Found available model via API:', availableModelCache);
      } else {
        console.warn('⚠️  No image models found via API');
      }
    } catch (error) {
      console.warn('⚠️  Could not fetch available models from API:', error);
      console.warn('Will try default model list...');
    }
  }

  let categoryNames: string[] = [];
  try {
    const categories = await getCategories('income');
    categoryNames = categories.map((cat) => cat.name);
  } catch (error) {
    console.warn('Failed to fetch income categories, using default list:', error);
    categoryNames = [...DEFAULT_INCOME_CATEGORIES];
  }
  if (categoryNames.length === 0) categoryNames = [...DEFAULT_INCOME_CATEGORIES];

  let attributionNames: string[] = [];
  try {
    const attributions = await getAttributions('income');
    attributionNames = attributions.map((p) => p.name);
  } catch (error) {
    console.warn('Failed to fetch income attributions, using default list:', error);
    attributionNames = [...DEFAULT_INCOME_ATTRIBUTIONS];
  }
  if (attributionNames.length === 0) attributionNames = [...DEFAULT_INCOME_ATTRIBUTIONS];

  let paymentAccountNames: string[] = [];
  try {
    const accounts = await getAccountsForOptions();
    paymentAccountNames = accounts.map((pa) => pa.name);
  } catch (error) {
    console.warn('Failed to fetch payment accounts:', error);
  }

  let userCurrencies: string[] = [];
  try {
    userCurrencies = await getCurrenciesByUsage();
  } catch (error) {
    console.warn('Failed to fetch currency usage:', error);
  }

  let customerNamesImg: string[] = [];
  try {
    const entities = await getEntityOptions();
    customerNamesImg = entities.map((e) => e.name);
  } catch (e) {
    console.warn('Failed to fetch customers:', e);
  }

  const categoryList = toUnrankedOptionList(categoryNames).join(', ');
  const attributionNamesCsv = toUnrankedOptionList(attributionNames).join(', ');
  const paymentAccountList = paymentAccountNames.length > 0 ? paymentAccountNames.join(', ') : '';
  const customerListImg = customerNamesImg.length > 0 ? customerNamesImg.join(', ') : '';
  const defaultCurrency = userCurrencies.length > 0 ? userCurrencies[0] : 'USD';
  const currencyList =
    userCurrencies.length > 0 ? userCurrencies.slice(0, 6).join(', ') : 'USD, CAD, MXN';
  const defaultAttribution =
    attributionNames.find((n) => /employer/i.test(n)) || attributionNames[0] || 'Employer';

  const extractionRules = buildInvoiceImageExtractionRules({
    customerListImg,
    categoryList,
    attributionNamesCsv,
    paymentAccountList,
    defaultCurrency,
    currencyList,
    defaultAttributionName: defaultAttribution,
  });
  const prompt = INVOICE_IMAGE_PARSE_INTRO + extractionRules;

  const { base64, mimeType } = await loadImageUrlAsBase64ForGemini(imageUrl);

  geminiDevLog('Invoice image downloaded, size:', base64.length, 'bytes, mime type:', mimeType);

  const modelsToTry = geminiModelsToTry(availableModelCache, {
    promptTextLength: prompt.length,
    inlineBase64Length: base64.length,
    mimeType,
  });

  const imagePart = {
    inlineData: {
      data: base64,
      mimeType,
    },
  };

  let lastError: Error | null = null;

  for (const modelName of modelsToTry) {
    try {
      geminiDevLog(`Trying model (invoice image): ${modelName}...`);
      const model = currentGenAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([prompt, imagePart]);
      const apiResponse = await result.response;
      const text = apiResponse.text();
      if (!text || !String(text).trim()) {
        throw new Error('Empty model response');
      }
      geminiDevLog(`✅ Model ${modelName} worked (invoice image)! Response length:`, text.length);

      let jsonText = text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsedResult: Record<string, unknown> = JSON.parse(jsonText);
      ensureGeminiParsedReceiptItems(parsedResult, {
        categoryNames,
        defaultAttributionName: defaultAttribution,
      });

      const prAny = parsedResult as Record<string, any>;
      const paymentAccountName = prAny.paymentAccountName || prAny.paymentAccount || undefined;

      const imageQuality = prAny.imageQuality
        ? {
            clarity: prAny.imageQuality.clarity !== undefined ? Number(prAny.imageQuality.clarity) : undefined,
            completeness:
              prAny.imageQuality.completeness !== undefined ? Number(prAny.imageQuality.completeness) : undefined,
            clarityComment: prAny.imageQuality.clarityComment,
            completenessComment: prAny.imageQuality.completenessComment,
          }
        : undefined;

      const dataConsistency = prAny.dataConsistency
        ? {
            itemsSum: prAny.dataConsistency.itemsSum !== undefined ? Number(prAny.dataConsistency.itemsSum) : undefined,
            itemsSumMatchesTotal:
              prAny.dataConsistency.itemsSumMatchesTotal !== undefined
                ? Boolean(prAny.dataConsistency.itemsSumMatchesTotal)
                : undefined,
            missingItems:
              prAny.dataConsistency.missingItems !== undefined ? Boolean(prAny.dataConsistency.missingItems) : undefined,
            consistencyComment: prAny.dataConsistency.consistencyComment,
          }
        : undefined;

      const itemsArr = Array.isArray(prAny.items) ? prAny.items : [];
      const calculatedItemsSum = itemsArr.reduce(
        (sum: number, item: any) => sum + (Number(item?.price ?? item?.amount) || 0),
        0,
      );
      const totalAmount = Number(prAny.totalAmount) || 0;
      const explicitTax = prAny.tax !== undefined ? Number(prAny.tax) : NaN;
      let tax: number;
      if (Number.isFinite(explicitTax)) {
        tax = explicitTax;
      } else {
        const inferredTax = totalAmount - calculatedItemsSum;
        tax = inferredTax > 0 ? Number(inferredTax.toFixed(2)) : 0;
      }
      const expectedTotal = calculatedItemsSum + tax;
      const actualItemsSumMatches = Math.abs(expectedTotal - totalAmount) <= 0.01;

      const defaultCategory = categoryNames.length > 0 ? categoryNames[0] : 'Sales';
      const customerName =
        String(prAny.customerName || prAny.supplierName || '').trim() || 'Customer';
      const supplierInfo = normalizePrintedPartyContact(prAny.supplierInfo ?? prAny.customerInfo);

      let itemsOut = itemsArr
        .map((item: any) => {
          const readable = resolveReadableItemName(item);
          const attributionName =
            (item.attributionName ?? item.purposeName ?? item.purpose ?? defaultAttribution) || defaultAttribution;
          return {
            ...readable,
            categoryName: item.categoryName ?? item.category ?? defaultCategory,
            price: Number(item.price ?? item.amount ?? 0),
            attributionName,
            isAsset: item.isAsset !== undefined ? Boolean(item.isAsset) : false,
            confidence: item.confidence !== undefined ? Number(item.confidence) : 0.8,
          };
        })
        .filter((item: any) => item.name != null && item.price !== undefined && item.categoryName);

      if (itemsOut.length === 0) {
        itemsOut = [
          {
            name: 'Sale',
            categoryName: defaultCategory,
            attributionName: defaultAttribution,
            price: totalAmount || 0,
            isAsset: false,
            confidence: 0.8,
          },
        ];
      }

      return {
        customerName,
        supplierInfo,
        date: normalizeShortDate(prAny.date || getLocalDateString()),
        totalAmount,
        currency: prAny.currency || defaultCurrency,
        paymentAccountName,
        tax,
        items: itemsOut,
        confidence: prAny.confidence !== undefined ? Number(prAny.confidence) : 0.8,
        imageQuality,
        dataConsistency:
          dataConsistency || {
            itemsSum: calculatedItemsSum,
            itemsSumMatchesTotal: actualItemsSumMatches,
            missingItems: !actualItemsSumMatches && calculatedItemsSum < totalAmount,
            consistencyComment: actualItemsSumMatches
              ? 'Items sum matches total'
              : `Items sum (${calculatedItemsSum.toFixed(2)}) differs from total (${totalAmount.toFixed(2)}) by ${Math.abs(expectedTotal - totalAmount).toFixed(2)}`,
          },
      } as GeminiVoucherResult;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`❌ Model ${modelName} failed (invoice image):`, lastError.message);
      clearModelCacheIfUnavailable(error);

      const errorMsg = lastError.message.toLowerCase();
      if (errorMsg.includes('not found') || errorMsg.includes('404')) {
        geminiDevLog(`  Model ${modelName} unavailable, next model...`);
        continue;
      }
      if (
        errorMsg.includes('empty model response') ||
        /unexpected token|json|parse|syntax|expected json/i.test(errorMsg)
      ) {
        geminiDevLog(`  Model ${modelName} bad output, next model...`);
        continue;
      }
      if (
        errorMsg.includes('api key') ||
        errorMsg.includes('401') ||
        errorMsg.includes('403') ||
        errorMsg.includes('quota') ||
        errorMsg.includes('429') ||
        errorMsg.includes('permission')
      ) {
        break;
      }
      geminiDevLog(`  Model ${modelName} error, next model if any...`);
      continue;
    }
  }

  console.error('All models failed (invoice image). Last error:', lastError);

  if (lastError) {
    const errorMsg = lastError.message.toLowerCase();

    if (errorMsg.includes('api key') || errorMsg.includes('api_key') || errorMsg.includes('invalid api key') || errorMsg.includes('401')) {
      throwGeminiProxyUnavailable(`Gemini rejected the request (often invalid or missing server GEMINI_API_KEY). Original: ${lastError.message}`);
    }

    if (errorMsg.includes('quota') || errorMsg.includes('429') || errorMsg.includes('rate limit')) {
      throw new Error(`API quota exhausted or limit reached\nOriginal error: ${lastError.message}`);
    }

    if (errorMsg.includes('permission') || errorMsg.includes('403') || errorMsg.includes('forbidden')) {
      throwGeminiProxyUnavailable(`Permission denied calling AI. Original: ${lastError.message}`);
    }

    if (errorMsg.includes('not found') || errorMsg.includes('404')) {
      throwGeminiProxyUnavailable(
        `No working Gemini model (404). Tried: ${POSSIBLE_MODELS.join(', ')}. Adjust GEMINI_MODEL_DEFAULT or GEMINI_ENFORCE_SERVER_MODEL on the server. Original: ${lastError.message}`,
      );
    }

    if (
      errorMsg.includes('network') ||
      errorMsg.includes('fetch') ||
      errorMsg.includes('connection') ||
      errorMsg.includes('timeout') ||
      errorMsg.includes('econnrefused') ||
      errorMsg.includes('failed to fetch') ||
      errorMsg.includes('generativelanguage.googleapis.com')
    ) {
      throwGeminiProxyUnavailable(`Network error reaching AI (check device connectivity and that gemini-proxy is deployed). Original: ${lastError.message}`);
    }

    throwGeminiProxyUnavailable(`Invoice image recognition failed (${lastError.name}): ${lastError.message}`);
  }

  throw new Error('Invoice image recognition failed: Unknown error');
}

/** 从 URL 下载文件（图片或 PDF/文档）为 base64 + mimeType，供文档识别使用 */
async function downloadFileToBase64(fileUrl: string, mimeHint?: string): Promise<{ base64: string; mimeType: string }> {
  const pathPart = fileUrl.split(/[#?]/)[0];
  let mimeType = mimeHint ?? 'image/jpeg';
  if (!mimeHint) {
    if (pathPart.includes('.pdf')) mimeType = 'application/pdf';
    else if (pathPart.includes('.png')) mimeType = 'image/png';
    else if (pathPart.includes('.gif')) mimeType = 'image/gif';
    else if (pathPart.includes('.webp')) mimeType = 'image/webp';
    else if (/\.docx$/i.test(pathPart)) {
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (/\.doc$/i.test(pathPart)) {
      mimeType = 'application/msword';
    }
  }
  if (Platform.OS === 'web') {
    const blobToBase64 = (blob: Blob): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve((dataUrl.split(',')[1]) ?? '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    const match = fileUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (match) {
      const [, bucket, path] = match;
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error) throw new Error(`Storage download failed: ${error.message}`);
      if (!data) throw new Error('Storage download returned no data');
      const base64 = await blobToBase64(data);
      return { base64, mimeType };
    }
    try {
      const res = await fetch(fileUrl, { mode: 'cors' });
      if (!res.ok) throw new Error(`Document fetch failed: ${res.status} ${res.statusText}`);
      const blob = await res.blob();
      const base64 = await blobToBase64(blob);
      return { base64, mimeType };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('fetch') || msg.includes('CORS') || msg.includes('NetworkError')) {
        throw new Error('PDF/文档下载失败，请检查网络或存储 CORS 设置');
      }
      throw e;
    }
  }
  const ext =
    mimeType === 'application/pdf'
      ? 'pdf'
      : mimeType.includes('wordprocessingml.document') || mimeType === 'application/msword'
        ? 'docx'
        : 'jpg';
  const downloadResult = await FileSystem.downloadAsync(fileUrl, FileSystem.documentDirectory + `temp-doc-${Date.now()}.${ext}`);
  if (!downloadResult.uri) throw new Error('Failed to download file from URL');
  const base64 = await FileSystem.readAsStringAsync(downloadResult.uri, { encoding: FileSystem.EncodingType.Base64 });
  try { await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true }); } catch (_) {}
  return { base64, mimeType };
}

/**
 * 小票/支出文档识别（PDF 等）：解析部分与图片不同，数据规则与返回格式与 recognizeReceipt 一致，prompt 组合提交。
 */
export async function recognizeReceiptFromDocument(fileUrl: string, mimeHint?: string): Promise<GeminiReceiptResult> {
  const currentApiKey = getCurrentGeminiApiKey();
  const currentGenAI = new GoogleGenerativeAI(currentApiKey);
  if (!availableModelCache) {
    try {
      availableModelCache = await getAvailableImageModel() ?? null;
    } catch (_) {}
  }

  let categoryNames: string[] = [];
  try {
    const categories = await getCategories('expense');
    categoryNames = categories.map(cat => cat.name);
  } catch (_) { categoryNames = [...DEFAULT_EXPENSE_CATEGORIES]; }
  if (categoryNames.length === 0) categoryNames = [...DEFAULT_EXPENSE_CATEGORIES];

  let attributionNames: string[] = [];
  try {
    const attributions = await getAttributions('expense');
    attributionNames = attributions.map(p => p.name);
  } catch (_) { attributionNames = [...DEFAULT_EXPENSE_ATTRIBUTIONS]; }
  if (attributionNames.length === 0) attributionNames = [...DEFAULT_EXPENSE_ATTRIBUTIONS];

  let paymentAccountNames: string[] = [];
  try {
    const accounts = await getAccountsForOptions();
    paymentAccountNames = accounts.map(pa => pa.name);
  } catch (_) {}

  let supplierNamesImg: string[] = [];
  try {
    const entities = await getEntityOptions();
    supplierNamesImg = entities.map(e => e.name);
  } catch (_) {}

  // 货币：优先按使用频次取前几种，兜底 USD
  let userCurrencies: string[] = [];
  try {
    userCurrencies = await getCurrenciesByUsage();
  } catch (_) {
    // 兼容旧实现：getMostFrequentCurrency 返回单个值
    try {
      const most = await getMostFrequentCurrency();
      if (most) userCurrencies = [most];
    } catch (_) {}
  }
  const defaultCurrency = userCurrencies.length > 0 ? userCurrencies[0] : 'USD';
  const currencyList =
    userCurrencies.length > 0 ? userCurrencies.slice(0, 6).join(', ') : 'USD, CAD, MXN';
  const supplierListImg = supplierNamesImg.join(', ');
  const categoryList = toUnrankedOptionList(categoryNames).join(', ');
  const attributionNamesCsv = toUnrankedOptionList(attributionNames).join(', ');
  const paymentAccountList = paymentAccountNames.join(', ');

  const extractionRules = buildReceiptExtractionRules({
    supplierListImg,
    categoryList,
    attributionNamesCsv,
    paymentAccountList,
    defaultCurrency,
    currencyList,
    defaultAttributionName: 'Personal',
  });
  const prompt = RECEIPT_DOCUMENT_PARSE_INTRO + extractionRules;

  const { base64, mimeType } = await downloadFileToBase64(fileUrl, mimeHint);
  if (isSpreadsheetMime(mimeType, fileUrl)) {
    const plain = spreadsheetBase64ToPlainText(base64, mimeType, fileUrl);
    return recognizeReceiptFromText(plain);
  }
  if (isWordDocumentMime(mimeType, fileUrl)) {
    const plain = await wordDocumentBase64ToPlainText(base64);
    return recognizeReceiptFromText(plain);
  }
  const filePart = { inlineData: { data: base64, mimeType } };

  const modelsToTry = geminiModelsToTry(availableModelCache, {
    promptTextLength: prompt.length,
    inlineBase64Length: base64.length,
    mimeType,
  });

  const defaultCategory = categoryNames.length > 0 ? categoryNames[0] : 'Meal';
  let lastError: Error | null = null;

  for (const modelName of modelsToTry) {
    try {
      const model = currentGenAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([prompt, filePart]);
      const text = result.response.text();
      if (!text || !String(text).trim()) {
        throw new Error('Empty model response');
      }
      let jsonText = text.trim();
      if (jsonText.startsWith('```json')) jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      else if (jsonText.startsWith('```')) jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      const parsedResult: GeminiReceiptResult = JSON.parse(jsonText);
      ensureGeminiParsedReceiptItems(parsedResult as unknown as Record<string, unknown>, {
        categoryNames,
        defaultAttributionName: 'Personal',
      });
      const paymentAccountName = parsedResult.paymentAccountName || (parsedResult as any).paymentAccount;
      const imageQuality = parsedResult.imageQuality ? {
        clarity: parsedResult.imageQuality.clarity !== undefined ? Number(parsedResult.imageQuality.clarity) : undefined,
        completeness: parsedResult.imageQuality.completeness !== undefined ? Number(parsedResult.imageQuality.completeness) : undefined,
        clarityComment: parsedResult.imageQuality.clarityComment,
        completenessComment: parsedResult.imageQuality.completenessComment,
      } : undefined;
      const dataConsistency = parsedResult.dataConsistency ? {
        itemsSum: parsedResult.dataConsistency.itemsSum !== undefined ? Number(parsedResult.dataConsistency.itemsSum) : undefined,
        itemsSumMatchesTotal: parsedResult.dataConsistency.itemsSumMatchesTotal !== undefined ? Boolean(parsedResult.dataConsistency.itemsSumMatchesTotal) : undefined,
        missingItems: parsedResult.dataConsistency.missingItems !== undefined ? Boolean(parsedResult.dataConsistency.missingItems) : undefined,
        consistencyComment: parsedResult.dataConsistency.consistencyComment,
      } : undefined;
      const calculatedItemsSum = parsedResult.items.reduce((sum, item) => sum + (Number((item as any).price ?? (item as any).amount) || 0), 0);
      const totalAmount = Number(parsedResult.totalAmount) || 0;
      const inferredTax = totalAmount - calculatedItemsSum;
      const tax = inferredTax > 0 ? Number(inferredTax.toFixed(2)) : 0;
      const expectedTotal = calculatedItemsSum + tax;
      const actualItemsSumMatches = Math.abs(expectedTotal - totalAmount) <= 0.01;
      return {
        supplierName: parsedResult.supplierName || 'Unknown Supplier',
        supplierInfo: parsedResult.supplierInfo ? {
          taxNumber: parsedResult.supplierInfo.taxNumber && parsedResult.supplierInfo.taxNumber !== 'null' ? parsedResult.supplierInfo.taxNumber : undefined,
          phone: parsedResult.supplierInfo.phone && parsedResult.supplierInfo.phone !== 'null' ? parsedResult.supplierInfo.phone : undefined,
          address: parsedResult.supplierInfo.address && parsedResult.supplierInfo.address !== 'null' ? parsedResult.supplierInfo.address : undefined,
        } : undefined,
        date: normalizeShortDate(parsedResult.date || getLocalDateString()),
        totalAmount,
        currency: parsedResult.currency || 'USD',
        paymentAccountName,
        tax,
        taxJurisdictionCountry: null,
        taxJurisdictionRegion: null,
        items: parsedResult.items.map((item: any) => ({
          ...resolveReadableItemName(item),
          categoryName: item.categoryName ?? item.category ?? defaultCategory,
          price: Number(item.price ?? item.amount ?? 0),
          attributionName: item.attributionName ?? item.purposeName ?? item.purpose ?? 'Personal',
          isAsset: item.isAsset !== undefined ? Boolean(item.isAsset) : false,
          confidence: item.confidence !== undefined ? Number(item.confidence) : 0.8,
        })),
        confidence: parsedResult.confidence !== undefined ? Number(parsedResult.confidence) : 0.8,
        imageQuality,
        dataConsistency: dataConsistency || {
          itemsSum: calculatedItemsSum,
          itemsSumMatchesTotal: actualItemsSumMatches,
          missingItems: !actualItemsSumMatches && calculatedItemsSum < totalAmount,
          consistencyComment: actualItemsSumMatches ? 'Items sum matches total' : `Items sum (${calculatedItemsSum.toFixed(2)}) differs from total (${totalAmount.toFixed(2)})`,
        },
      };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      clearModelCacheIfUnavailable(e);
      continue;
    }
  }
  throw lastError || new Error('Receipt document recognition failed');
}

/**
 * 仅商户税号/电话/地址的独立识别（历史兼容）。
 * 主流程应以 recognizeReceipt 单次 JSON 中的 supplierInfo 为准并已写库；请勿在主链路再次调用以免重复传图。
 */
export async function recognizeSupplierInfo(
  imageUrl: string,
  supplierName: string
): Promise<{
  taxNumber?: string;
  phone?: string;
  address?: string;
}> {
  const currentApiKey = getCurrentGeminiApiKey();

  const currentGenAI = new GoogleGenerativeAI(currentApiKey);

  const prompt = `You are a receipt analysis expert. Focus ONLY on extracting detailed merchant/supplier information from this receipt image.

SUPPLIER NAME CONTEXT: "${supplierName}"

Your task is to extract COMPLETE merchant information with MAXIMUM DETAIL. Scan the ENTIRE receipt systematically: header, footer, sides, corners, and every section.

EXTRACT THE FOLLOWING INFORMATION:

1. Tax number (taxNumber) - CRITICAL: Extract ALL tax identification numbers if present anywhere on the receipt.
   * United States formats:
     - EIN (Employer Identification Number): XX-XXXXXXX (e.g., 12-3456789)
     - Look for labels: "EIN", "Tax ID", "Federal Tax ID", "Employer ID", "Tax ID#", "Tax Identification Number"
   * Canada formats:
     - GST/HST Number: 9 digits, may include RT (e.g., 123456789RT0001, GST/HST #123456789)
     - PST Number: Provincial Sales Tax number
     - QST Number: Quebec Sales Tax number
     - Look for labels: "GST", "HST", "PST", "QST", "GST/HST #", "Tax Registration #", "Business Number", "BN"
   * Other formats:
     - Business Number (BN): 9 digits (Canada)
     - State Tax ID (varies by US state)
   * Common locations: Near store name at top, footer, near tax calculation section, registration section
   * **Extract ALL tax numbers if multiple are present. Combine them with commas if multiple.**
   * **CRITICAL: Even if partially visible or unclear, extract what you can see. Do not omit tax numbers.**

2. Phone (phone) - CRITICAL: Extract the phone number if available anywhere on the receipt.
   * Formats:
     - (XXX) XXX-XXXX (e.g., (416) 555-1234)
     - XXX-XXX-XXXX (e.g., 416-555-1234)
     - XXX.XXX.XXXX (e.g., 416.555.1234)
     - 1-XXX-XXX-XXXX (with country code)
     - Toll-free: 1-800-XXX-XXXX, 1-888-XXX-XXXX, etc.
   * Common locations: Header, footer, customer service section, contact section
   * Common labels: "Phone:", "Tel:", "Call:", "Customer Service:", "T:", "P:", "Phone #", "Tel #", "Contact:"
   * **Extract the main business phone number. If multiple numbers, prefer the primary business number.**
   * **CRITICAL: Extract phone numbers even if partially visible. Include area codes and country codes if present.**

3. Address (address) - CRITICAL: Extract the COMPLETE business address with ALL details.
   * Format: Street address, City, State/Province, ZIP/Postal Code
   * Examples:
     - US: "123 Main St, New York, NY 10001"
     - Canada: "123 Main St, Toronto, ON M5H 2N2"
   * Include ALL visible details:
     - Unit/suite number if present (e.g., "Suite 200", "Unit 5", "#101")
     - Street direction if present (e.g., "North", "South", "E", "W")
     - Full state/province name or abbreviation
     - Complete ZIP/postal code
     - Building name if present
   * Common locations: Header, footer, dedicated address section, near store name
   * Common labels: "Address:", "Location:", "Store Address:", "Business Address:", "Registered Address:"
   * **Prefer the physical store/business address over mailing or registered address.**
   * **CRITICAL: Extract the COMPLETE address including street number, street name, city, state/province, and postal/ZIP code. Do not omit any part if visible.**

Return ONLY valid JSON format without any extra text:
{
  "taxNumber": "12-3456789 or GST/HST #123456789 (Extract ALL tax numbers if visible. Use null ONLY if truly not found after scanning entire receipt)",
  "phone": "(416) 555-1234 or 416-555-1234 (Extract main business phone if visible. Use null ONLY if truly not found)",
  "address": "123 Main Street, Toronto, ON M5H 2N2 (Extract COMPLETE address including street, city, state/province, ZIP/postal code if visible. Use null ONLY if truly not found)"
}`;

  try {
    // 下载图片
    const downloadResult = await FileSystem.downloadAsync(
      imageUrl,
      FileSystem.documentDirectory + `temp-supplier-${Date.now()}.jpg`
    );

    if (!downloadResult.uri) {
      console.warn('Failed to download image for supplier info recognition');
      return {};
    }

    const base64 = await FileSystem.readAsStringAsync(downloadResult.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    try {
      await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true });
    } catch (e) {
      console.warn('Failed to delete temp file:', e);
    }

    let mimeType = 'image/jpeg';
    if (imageUrl.includes('.png')) {
      mimeType = 'image/png';
    } else if (imageUrl.includes('.gif')) {
      mimeType = 'image/gif';
    } else if (imageUrl.includes('.webp')) {
      mimeType = 'image/webp';
    }

    const imagePart = {
      inlineData: {
        data: base64,
        mimeType: mimeType,
      },
    };

    const modelsToTry = geminiModelsToTry(availableModelCache, {
      promptTextLength: prompt.length,
      inlineBase64Length: base64.length,
      mimeType,
    });

    for (const modelName of modelsToTry) {
      try {
        geminiDevLog(`[Supplier Info] Trying model: ${modelName}...`);
        const model = currentGenAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent([prompt, imagePart]);
        const apiResponse = await result.response;
        const text = apiResponse.text();
        geminiDevLog(`[Supplier Info] ✅ Model ${modelName} worked! Response:`, text);

        // 提取JSON部分
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
          jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        const parsedResult = JSON.parse(jsonText);

        return {
          taxNumber: parsedResult.taxNumber && parsedResult.taxNumber !== 'null' ? parsedResult.taxNumber : undefined,
          phone: parsedResult.phone && parsedResult.phone !== 'null' ? parsedResult.phone : undefined,
          address: parsedResult.address && parsedResult.address !== 'null' ? parsedResult.address : undefined,
        };
      } catch (error) {
        console.warn(`[Supplier Info] Model ${modelName} failed:`, error);
        continue;
      }
    }

    console.warn('[Supplier Info] All models failed for supplier info recognition');
    return {};
  } catch (error) {
    console.error('[Supplier Info] Error recognizing supplier info:', error);
    return {};
  }
}

// 从文字识别小票内容
export async function recognizeReceiptFromText(text: string): Promise<GeminiReceiptResult> {
  // 重新获取 API Key（确保使用最新的值）
  const currentApiKey = getCurrentGeminiApiKey();

  const currentGenAI = new GoogleGenerativeAI(currentApiKey);

  geminiDevLog('Starting receipt recognition with text...');
  geminiDevLog('Text input:', text);

  // 支出：分类与用途
  let categoryNames: string[] = [];
  try {
    const categories = await getCategories('expense');
    categoryNames = categories.map(cat => cat.name);
  } catch (error) {
    console.warn('Failed to fetch expense categories, using default list:', error);
    categoryNames = [...DEFAULT_EXPENSE_CATEGORIES];
  }
  if (categoryNames.length === 0) categoryNames = [...DEFAULT_EXPENSE_CATEGORIES];

  let attributionNames: string[] = [];
  try {
    const attributions = await getAttributions('expense');
    attributionNames = attributions.map(p => p.name);
  } catch (error) {
    console.warn('Failed to fetch expense attributions, using default list:', error);
    attributionNames = [...DEFAULT_EXPENSE_ATTRIBUTIONS];
  }
  if (attributionNames.length === 0) attributionNames = [...DEFAULT_EXPENSE_ATTRIBUTIONS];

  let paymentAccountNames: string[] = [];
  try {
    const accounts = await getAccountsForOptions();
    paymentAccountNames = accounts.map(pa => pa.name);
  } catch (error) {
    console.warn('Failed to fetch payment accounts:', error);
  }

  let userCurrencies: string[] = [];
  try {
    userCurrencies = await getCurrenciesByUsage();
    geminiDevLog('User currencies by usage:', userCurrencies);
  } catch (error) {
    console.warn('Failed to fetch currency usage:', error);
  }

  let supplierNames: string[] = [];
  try {
    const entities = await getEntityOptions();
    supplierNames = entities.map((e) => e.name);
  } catch (e) {
    console.warn('Failed to fetch suppliers:', e);
  }

  const categoryList = toUnrankedOptionList(categoryNames).join(', ');
  const attributionNamesCsv = toUnrankedOptionList(attributionNames).join(', ');
  const paymentAccountList = paymentAccountNames.length > 0 ? paymentAccountNames.join(', ') : '';
  const supplierList = supplierNames.length > 0 ? supplierNames.join(', ') : '';
  const defaultCurrency = userCurrencies.length > 0 ? userCurrencies[0] : 'USD';
  const currencyList = userCurrencies.length > 0 ? userCurrencies.join(', ') : 'USD, CAD, CNY';

  const now = new Date();
  const today = getLocalDateString(now);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentDay = now.getDate();
  const dow = now.getDay();
  const daysBack = dow === 5 ? 7 : dow < 5 ? dow + 2 : 1;
  const lastFridayStr = getLocalDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack));

  const prompt = `Extract receipt/purchase from text. Return ONLY valid JSON, no markdown.

Rules: Gibberish/no real content → confidence 0.1, supplierName "Unknown", totalAmount 0, items []. For supplierName, categoryName, attributionName, paymentAccountName: pick from injected lists if match, else return new value (will create). For categoryName/attributionName, prioritize semantic fit, not list position/frequency (frequency is only weak tie-breaker). Choose categoryName/attributionName by combining each line's "name" and "itemAlias": if "name" is SKU/code-like and itemAlias is clearer, rely more on itemAlias meaning. Also use receipt-level context (entity/supplier identity, merchant type, header keywords, tax jurisdiction, account/payment hints, and basket pattern across lines) to disambiguate. Prefer provided customer options whenever semantically close; create new only when no option fits. Dates YYYY-MM-DD; categoryName and attributionName from lists. Relative: today=${today}, yesterday=day before ${today}, 上周五/last Friday=${lastFridayStr}. Ambiguous dates → closest to ${today}; year missing → ${currentYear} or ${currentYear - 1}.
Items: at least one. ${RECEIPT_JSON_ITEMS_RULE} Example item: ${JSON.stringify(RECEIPT_JSON_ITEMS_EXAMPLE)}. Infer single item from total if needed.

Data: today=${today}, 上周五=${lastFridayStr}. Suppliers [${supplierList || 'None'}]. Currencies [${currencyList}], default ${defaultCurrency}. Accounts [${paymentAccountList || 'None'}]. Categories [${categoryList}]. Attributions [${attributionNamesCsv}], default "Personal".

Output JSON keys: supplierName, date, totalAmount, currency, paymentAccountName (optional), items (array of { name, itemAlias (required when name is code-like), categoryName, attributionName, price }), dataConsistency{itemsSum,itemsSumMatchesTotal,missingItems,consistencyComment}, confidence(0-1).

User text:
"${text}"`;

  try {
    // 首先尝试从 API 获取可用模型
    let availableModel: string | null = null;
    try {
      availableModel = await getAvailableImageModel();
      if (availableModel) {
        geminiDevLog('✅ Found available model via API:', availableModel);
      }
    } catch (error) {
      console.warn('⚠️  Could not fetch available models from API:', error);
    }

    const modelsToTry = geminiModelsToTry(availableModel, { promptTextLength: prompt.length });

    let lastError: Error | null = null;

    for (const modelName of modelsToTry) {
      try {
        geminiDevLog(`Trying model: ${modelName}`);
        const model = currentGenAI.getGenerativeModel({ model: modelName });

        // 使用文本提示
        const result = await model.generateContent(prompt);

        const response = await result.response;
        const textResponse = response.text();
        geminiDevLog('Gemini response:', textResponse);

        // 解析JSON响应
        const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }

        const parsedResult: any = JSON.parse(jsonMatch[0]);

        // 如果供应商名称为空或为"Unknown Supplier"，且有商品项，使用第一个商品名称作为供应商名称
        if ((!parsedResult.supplierName || parsedResult.supplierName === 'Unknown Supplier') && parsedResult.items && Array.isArray(parsedResult.items) && parsedResult.items.length > 0) {
          const firstItem = parsedResult.items[0];
          if (firstItem && firstItem.name) {
            geminiDevLog('Supplier name not found, using first item name as supplier name:', firstItem.name);
            parsedResult.supplierName = firstItem.name;
          }
        }

        // 验证必需字段
        if (!parsedResult.supplierName || !parsedResult.date || parsedResult.totalAmount === undefined) {
          console.error('Missing required fields:', {
            supplierName: !!parsedResult.supplierName,
            date: !!parsedResult.date,
            totalAmount: parsedResult.totalAmount !== undefined,
          });
          throw new Error('Missing required fields: supplierName, date, or totalAmount');
        }

        // 确保 items 是数组且不为空
        if (!parsedResult.items) {
          console.warn('No items field in response, creating default item from total amount');
          // 如果没有items，创建一个默认item
          parsedResult.items = [{
            name: 'General Purchase',
            categoryName: categoryNames[0] || 'Meal',
            attributionName: 'Personal',
            price: parsedResult.totalAmount - (parsedResult.tax || 0),
          }];
        } else if (!Array.isArray(parsedResult.items)) {
          console.warn('Items field is not an array, converting to array');
          parsedResult.items = [];
        } else if (parsedResult.items.length === 0) {
          console.warn('Items array is empty, creating default item from total amount');
          // 如果items为空，创建一个默认item
          parsedResult.items = [{
            name: 'General Purchase',
            categoryName: categoryNames[0] || 'Shopping',
            price: parsedResult.totalAmount - (parsedResult.tax || 0),
          }];
        }

        // 统一 item 字段：与图片/语音同一套 schema（name, categoryName, attributionName, price）
        parsedResult.items = parsedResult.items.map((item: any) => {
          const readable = resolveReadableItemName(item);
          const price = item.price !== undefined && item.price !== null ? Number(item.price) : Number(item.amount);
          const attributionName = item.attributionName ?? item.purposeName ?? item.purpose ?? 'Personal';
          const categoryName = item.categoryName ?? item.category;
          const base: any = {
            name: readable.name,
            price,
            attributionName,
            categoryName,
          };
          if (readable.itemAlias) base.itemAlias = readable.itemAlias;
          if (item.isAsset !== undefined) base.isAsset = Boolean(item.isAsset);
          if (item.confidence !== undefined) base.confidence = Number(item.confidence);
          return base;
        }).filter((item: any) => {
          if (item.name == null || item.name === '' || (item.price === undefined || isNaN(item.price)) || !item.categoryName) {
            console.warn('Invalid item found, skipping:', item);
            return false;
          }
          return true;
        });

        // 如果过滤后items为空，创建默认item
        if (parsedResult.items.length === 0) {
          console.warn('All items were invalid, creating default item');
          parsedResult.items = [{
            name: 'General Purchase',
            categoryName: categoryNames[0] || 'Meal',
            attributionName: 'Personal',
            price: parsedResult.totalAmount - (parsedResult.tax || 0),
          }];
        }

        geminiDevLog('Parsed result items count:', parsedResult.items.length);
        geminiDevLog('Parsed result:', {
          supplierName: parsedResult.supplierName,
          date: parsedResult.date,
          totalAmount: parsedResult.totalAmount,
          itemsCount: parsedResult.items.length,
        });

        // 确保 dataConsistency 存在
        if (!parsedResult.dataConsistency) {
          parsedResult.dataConsistency = {};
        }

        // 计算itemsSum如果未提供
        if (parsedResult.items && parsedResult.items.length > 0) {
          if (parsedResult.dataConsistency.itemsSum === undefined) {
            parsedResult.dataConsistency.itemsSum = parsedResult.items.reduce(
              (sum: number, item: any) => sum + (Number(item.price) || 0),
              0
            );
          }
          if (parsedResult.dataConsistency.itemsSumMatchesTotal === undefined) {
            const itemsSum = parsedResult.dataConsistency.itemsSum;
            const total = Number(parsedResult.totalAmount) || 0;
            const tax = Number(parsedResult.tax) || 0;
            parsedResult.dataConsistency.itemsSumMatchesTotal = Math.abs(itemsSum + tax - total) < 0.01;
          }
        } else {
          // 如果没有items，设置默认值
          parsedResult.dataConsistency.itemsSum = 0;
          parsedResult.dataConsistency.itemsSumMatchesTotal = false;
        }

        // 确保 confidence 存在
        if (parsedResult.confidence === undefined) {
          parsedResult.confidence = 0.8; // 默认置信度
        }

        // 确保 currency 存在，使用默认币种
        if (!parsedResult.currency) {
          parsedResult.currency = defaultCurrency;
        }

        // 短日期归一化：取与今天最接近的合法解释（锚点今天）
        parsedResult.date = normalizeShortDate(parsedResult.date);

        parsedResult.taxJurisdictionCountry = null;
        parsedResult.taxJurisdictionRegion = null;
        delete parsedResult.tax_jurisdiction_country;
        delete parsedResult.tax_jurisdiction_region;

        geminiDevLog('Final parsed result:', {
          supplierName: parsedResult.supplierName,
          date: parsedResult.date,
          totalAmount: parsedResult.totalAmount,
          currency: parsedResult.currency,
          itemsCount: parsedResult.items.length,
          items: parsedResult.items.map((item: any) => ({ name: item.name, price: item.price })),
        });

        return parsedResult as GeminiReceiptResult;
      } catch (error) {
        console.warn(`Model ${modelName} failed:`, error);
        clearModelCacheIfUnavailable(error);
        lastError = error instanceof Error ? error : new Error(String(error));
        continue;
      }
    }

    throw lastError || new Error('All models failed');
  } catch (error) {
    console.error('Error recognizing receipt from text:', error);
    throw error;
  }
}

// 从音频识别小票内容
export async function recognizeReceiptFromAudio(audioUri: string): Promise<GeminiReceiptResult> {
  // 重新获取 API Key（确保使用最新的值）
  const currentApiKey = getCurrentGeminiApiKey();

  const currentGenAI = new GoogleGenerativeAI(currentApiKey);

  geminiDevLog('Starting receipt recognition with audio...');
  geminiDevLog('Audio URI:', audioUri);

  // 获取用户的分类列表
  let categoryNames: string[] = [];
  try {
    const categories = await getCategories('expense');
    categoryNames = categories.map(cat => cat.name);
  } catch (error) {
    console.warn('Failed to fetch expense categories, using default list:', error);
    categoryNames = [...DEFAULT_EXPENSE_CATEGORIES];
  }
  if (categoryNames.length === 0) categoryNames = [...DEFAULT_EXPENSE_CATEGORIES];

  let attributionNames: string[] = [];
  try {
    const attributions = await getAttributions('expense');
    attributionNames = attributions.map(p => p.name);
  } catch (error) {
    console.warn('Failed to fetch expense attributions, using default list:', error);
    attributionNames = [...DEFAULT_EXPENSE_ATTRIBUTIONS];
  }
  if (attributionNames.length === 0) attributionNames = [...DEFAULT_EXPENSE_ATTRIBUTIONS];

  let paymentAccountNames: string[] = [];
  try {
    const accounts = await getAccountsForOptions();
    paymentAccountNames = accounts.map(pa => pa.name);
  } catch (error) {
    console.warn('Failed to fetch payment accounts:', error);
  }

  let userCurrencies: string[] = [];
  try {
    userCurrencies = await getCurrenciesByUsage();
    geminiDevLog('User currencies by usage:', userCurrencies);
  } catch (error) {
    console.warn('Failed to fetch currency usage:', error);
  }

  let supplierNamesAudio: string[] = [];
  try {
    const entities = await getEntityOptions();
    supplierNamesAudio = entities.map((e) => e.name);
  } catch (e) {
    console.warn('Failed to fetch suppliers:', e);
  }

  const categoryList = toUnrankedOptionList(categoryNames).join(', ');
  const attributionNamesCsv = toUnrankedOptionList(attributionNames).join(', ');
  const paymentAccountList = paymentAccountNames.length > 0 ? paymentAccountNames.join(', ') : '';
  const supplierListAudio = supplierNamesAudio.length > 0 ? supplierNamesAudio.join(', ') : '';
  const defaultCurrency = userCurrencies.length > 0 ? userCurrencies[0] : 'USD';
  const currencyList = userCurrencies.length > 0 ? userCurrencies.join(', ') : 'USD, CAD, CNY';

  const today = new Date();
  const todayStr = getLocalDateString(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);

  const prompt = `Extract receipt/purchase from this audio. Return ONLY valid JSON, no markdown.

Rules: Unclear/noise-only audio → confidence 0.1, supplierName "Unknown", totalAmount 0, items []. For supplierName, categoryName, attributionName, paymentAccountName: pick from injected lists if match, else return new value (will create). For categoryName/attributionName, prioritize semantic fit, not list position/frequency (frequency is only weak tie-breaker). Only extract what you actually hear.
Items: at least one. ${RECEIPT_JSON_ITEMS_RULE} Example item: ${JSON.stringify(RECEIPT_JSON_ITEMS_EXAMPLE)}.

Data: today=${todayStr}, yesterday=${yesterdayStr}. Suppliers [${supplierListAudio || 'None'}]. Currencies [${currencyList}], default ${defaultCurrency}. Accounts [${paymentAccountList || 'None'}]. Categories [${categoryList}]. Attributions [${attributionNamesCsv}], default "Personal".

Output JSON keys: supplierName, date (YYYY-MM-DD), totalAmount, currency, paymentAccountName (optional), items (array of { name, itemAlias(optional), categoryName, attributionName, price }), dataConsistency{itemsSum,itemsSumMatchesTotal,missingItems,consistencyComment}, confidence(0-1).`;

  try {
    // 读取音频文件
    // 使用 legacy API 读取音频文件（与新版本 API 兼容）
    const audioBase64 = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // 获取音频文件的MIME类型（假设是m4a格式，Expo录音默认格式）
    const mimeType = 'audio/m4a';

    // 首先尝试从 API 获取可用模型（支持多模态的模型通常也支持音频）
    let availableModel: string | null = null;
    try {
      availableModel = await getAvailableImageModel();
      if (availableModel) {
        geminiDevLog('✅ Found available model via API:', availableModel);
      }
    } catch (error) {
      console.warn('⚠️  Could not fetch available models from API:', error);
    }

    const modelsToTry = geminiModelsToTry(availableModel, {
      promptTextLength: prompt.length,
      inlineBase64Length: audioBase64.length,
      mimeType,
    });

    let lastError: Error | null = null;

    for (const modelName of modelsToTry) {
      try {
        geminiDevLog(`Trying model: ${modelName}`);
        const model = currentGenAI.getGenerativeModel({ model: modelName });

        // 使用音频和文本提示
        const result = await model.generateContent([
          {
            inlineData: {
              data: audioBase64,
              mimeType: mimeType,
            },
          },
          prompt,
        ]);

        const response = await result.response;
        const text = response.text();
        geminiDevLog('Gemini response:', text);

        // 解析JSON响应
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }

        const parsedResult: any = JSON.parse(jsonMatch[0]);

        // 验证必需字段
        if (!parsedResult.supplierName || !parsedResult.date || parsedResult.totalAmount === undefined) {
          throw new Error('Missing required fields in response');
        }

        // 统一 item 字段：与图片/文字同一套 schema（name, categoryName, attributionName, price）
        if (parsedResult.items && Array.isArray(parsedResult.items)) {
          parsedResult.items = parsedResult.items.map((item: any) => {
            const readable = resolveReadableItemName(item);
            const price = item.price !== undefined && item.price !== null ? Number(item.price) : Number(item.amount ?? 0);
            const attributionName = item.attributionName ?? item.purposeName ?? item.purpose ?? 'Personal';
            const categoryName = item.categoryName ?? item.category;
            const base: any = { name: readable.name, price, attributionName, categoryName };
            if (readable.itemAlias) base.itemAlias = readable.itemAlias;
            if (item.isAsset !== undefined) base.isAsset = Boolean(item.isAsset);
            if (item.confidence !== undefined) base.confidence = Number(item.confidence);
            return base;
          }).filter((item: any) => item.name != null && item.name !== '' && !isNaN(item.price) && item.categoryName);
        }

        // 计算itemsSum如果未提供
        if (parsedResult.items && parsedResult.items.length > 0) {
          if (parsedResult.dataConsistency?.itemsSum === undefined) {
            parsedResult.dataConsistency = parsedResult.dataConsistency || {};
            parsedResult.dataConsistency.itemsSum = parsedResult.items.reduce(
              (sum: number, item: any) => sum + (item.price || 0),
              0
            );
          }
          if (parsedResult.dataConsistency?.itemsSumMatchesTotal === undefined) {
            const itemsSum = parsedResult.dataConsistency.itemsSum;
            const total = parsedResult.totalAmount || 0;
            const tax = parsedResult.tax || 0;
            parsedResult.dataConsistency.itemsSumMatchesTotal = Math.abs(itemsSum + tax - total) < 0.01;
          }
        }

        // 确保 currency 存在，使用默认币种
        if (!parsedResult.currency) {
          parsedResult.currency = defaultCurrency;
        }

        return parsedResult as GeminiReceiptResult;
      } catch (error) {
        console.warn(`Model ${modelName} failed:`, error);
        clearModelCacheIfUnavailable(error);
        lastError = error instanceof Error ? error : new Error(String(error));
        continue;
      }
    }

    throw lastError || new Error('All models failed');
  } catch (error) {
    console.error('Error recognizing receipt from audio:', error);
    throw error;
  }
}

// ---------- 按凭证类型识别（由列表页入口决定类型，不由大模型判断） ----------

/** 按凭证类型从文字识别：receipt 用 supplierName，invoice 用 customerName，其余结构一致 */
export async function recognizeVoucherFromText(text: string, voucherType: VoucherLogType): Promise<GeminiVoucherResult> {
  if (voucherType === 'receipt') {
    const r = await recognizeReceiptFromText(text);
    return { ...r, customerName: undefined } as GeminiVoucherResult;
  }
  if (voucherType === 'invoice') {
    return recognizeInvoiceFromText(text);
  }
  // inbound/outbound 暂未实现，回退为 receipt
  const r = await recognizeReceiptFromText(text);
  return { ...r, customerName: undefined } as GeminiVoucherResult;
}

/** 发票文字识别：输出 customerName、items、totalAmount、date、currency、paymentAccountName 等 */
async function recognizeInvoiceFromText(text: string): Promise<GeminiVoucherResult> {
  const currentApiKey = getCurrentGeminiApiKey();
  const currentGenAI = new GoogleGenerativeAI(currentApiKey);

  // 收入：分类与用途
  let categoryNames: string[] = [];
  try {
    const categories = await getCategories('income');
    categoryNames = categories.map(cat => cat.name);
  } catch {
    categoryNames = [...DEFAULT_INCOME_CATEGORIES];
  }
  if (categoryNames.length === 0) categoryNames = [...DEFAULT_INCOME_CATEGORIES];

  let attributionNames: string[] = [];
  try {
    const attributions = await getAttributions('income');
    attributionNames = attributions.map(p => p.name);
  } catch {
    attributionNames = [...DEFAULT_INCOME_ATTRIBUTIONS];
  }
  if (attributionNames.length === 0) attributionNames = [...DEFAULT_INCOME_ATTRIBUTIONS];

  let paymentAccountNames: string[] = [];
  try {
    const accounts = await getAccountsForOptions();
    paymentAccountNames = accounts.map(pa => pa.name);
  } catch {}

  let userCurrencies: string[] = [];
  try {
    userCurrencies = await getCurrenciesByUsage();
  } catch {}
  let customerNames: string[] = [];
  try {
    const entities = await getEntityOptions();
    customerNames = entities.map((e) => e.name);
  } catch (e) {
    console.warn('Failed to fetch customers:', e);
  }
  const categoryList = toUnrankedOptionList(categoryNames).join(', ');
  const attributionNamesCsv = toUnrankedOptionList(attributionNames).join(', ');
  const paymentAccountList = paymentAccountNames.length > 0 ? paymentAccountNames.join(', ') : '';
  const customerList = customerNames.length > 0 ? customerNames.join(', ') : '';
  const defaultCurrency = userCurrencies.length > 0 ? userCurrencies[0] : 'USD';
  const currencyList = userCurrencies.length > 0 ? userCurrencies.join(', ') : 'USD, CAD, CNY';
  const now = new Date();
  const today = getLocalDateString(now);
  const currentYear = now.getFullYear();

  const prompt = `Extract INVOICE (sales / money received) from text. Return ONLY valid JSON, no markdown.

Rules: Gibberish/no real content → confidence 0.1, customerName "Unknown", totalAmount 0, items []. For customerName, categoryName, attributionName, paymentAccountName: pick from injected lists if match, else return new value (will create). For categoryName/attributionName, prioritize semantic fit, not list position/frequency (frequency is only weak tie-breaker). Dates YYYY-MM-DD; use ${today} if not mentioned.

Data: today=${today}. Customers [${customerList || 'None'}]. Currencies [${currencyList}], default ${defaultCurrency}. Accounts [${paymentAccountList || 'None'}]. Categories [${categoryList}]. Attributions [${attributionNamesCsv}], default "Employer".

Single pass only: include supplierInfo for the customer/payer taxNumber, phone, address when mentioned (JSON key supplierInfo; null when absent)—no second parsing step.

Output: customerName, supplierInfo{taxNumber,phone,address}, date, totalAmount, currency, paymentAccountName (optional), tax (default 0), items[] where each item includes name, itemAlias(optional), categoryName, attributionName, price, dataConsistency{itemsSum,itemsSumMatchesTotal,missingItems,consistencyComment}, confidence(0-1).

User input:
"${text}"`;

  let availableModel: string | null = null;
  try {
    availableModel = await getAvailableImageModel();
  } catch {}
  const modelsToTry = geminiModelsToTry(availableModel, { promptTextLength: prompt.length });
  let lastError: Error | null = null;

  for (const modelName of modelsToTry) {
    try {
      const model = currentGenAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const textResponse = result.response.text();
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed: any = JSON.parse(jsonMatch[0]);

      parsed.supplierInfo = normalizePrintedPartyContact(parsed.supplierInfo ?? parsed.customerInfo);

      if (!parsed.customerName) parsed.customerName = 'Customer';
      if (!parsed.date) parsed.date = today;
      parsed.date = normalizeShortDate(parsed.date);
      if (parsed.totalAmount === undefined) parsed.totalAmount = 0;
      if (!parsed.items || !Array.isArray(parsed.items)) parsed.items = [{ name: 'Sale', categoryName: categoryNames[0] || 'Sales', attributionName: attributionNames[0] || 'Employer', price: parsed.totalAmount || 0 }];
      parsed.items = parsed.items.map((item: any) => {
        const readable = resolveReadableItemName(item);
        const attributionName =
          (item.attributionName ?? item.purposeName ?? item.purpose ?? attributionNames[0]) || 'Employer';
        return { ...item, name: readable.name, ...(readable.itemAlias ? { itemAlias: readable.itemAlias } : {}), attributionName };
      }).filter((item: any) => item.name != null && item.price !== undefined && item.categoryName);
      if (parsed.items.length === 0) parsed.items = [{ name: 'Sale', categoryName: categoryNames[0] || 'Sales', attributionName: attributionNames[0] || 'Employer', price: parsed.totalAmount || 0 }];
      if (!parsed.currency) parsed.currency = defaultCurrency;
      if (parsed.confidence === undefined) parsed.confidence = 0.8;
      if (!parsed.dataConsistency) parsed.dataConsistency = {};

      return parsed as GeminiVoucherResult;
    } catch (error) {
      clearModelCacheIfUnavailable(error);
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
  }
  throw lastError || new Error('All models failed');
}

/** 发票/收入文档解析引导：先读文档再提取，数据规则与返回格式与文字/图片一致 */
const INVOICE_DOCUMENT_PARSE_INTRO = 'You are a financial expert. You are given a DOCUMENT (PDF or Word), not a photo. First read and parse the entire document content (all text, tables, layout). Then extract INVOICE (sales / money received) information using the EXACT SAME rules and JSON output format as for invoice text. Return ONLY valid JSON, no markdown.\n\n';

/** 发票文档识别（PDF 等）：解析部分与图片不同，数据规则与返回格式与 recognizeInvoiceFromText 一致，prompt 组合提交 */
export async function recognizeInvoiceFromDocument(fileUrl: string, mimeHint?: string): Promise<GeminiVoucherResult> {
  const currentApiKey = getCurrentGeminiApiKey();
  let categoryNames: string[] = [];
  try {
    const categories = await getCategories('income');
    categoryNames = categories.map(cat => cat.name);
  } catch {
    categoryNames = [...DEFAULT_INCOME_CATEGORIES];
  }
  if (categoryNames.length === 0) categoryNames = [...DEFAULT_INCOME_CATEGORIES];
  let attributionNames: string[] = [];
  try {
    const attributions = await getAttributions('income');
    attributionNames = attributions.map(p => p.name);
  } catch {
    attributionNames = [...DEFAULT_INCOME_ATTRIBUTIONS];
  }
  if (attributionNames.length === 0) attributionNames = [...DEFAULT_INCOME_ATTRIBUTIONS];
  let paymentAccountNames: string[] = [];
  try {
    const accounts = await getAccountsForOptions();
    paymentAccountNames = accounts.map(pa => pa.name);
  } catch {}
  let customerNames: string[] = [];
  try {
    const entities = await getEntityOptions();
    customerNames = entities.map((e) => e.name);
  } catch {}
  const customerList = customerNames.length > 0 ? customerNames.join(', ') : 'None';
  const categoryList = toUnrankedOptionList(categoryNames).join(', ');
  const attributionNamesCsv = toUnrankedOptionList(attributionNames).join(', ');
  const paymentAccountList = paymentAccountNames.length > 0 ? paymentAccountNames.join(', ') : 'None';
  const userCurrencies = await getCurrenciesByUsage();
  const defaultCurrency = userCurrencies.length > 0 ? userCurrencies[0] : 'USD';
  const currencyList = userCurrencies.length > 0 ? userCurrencies.join(', ') : 'USD, CAD, CNY';
  const today = getLocalDateString();

  const rulesAndData = `Rules: Gibberish/no real content → confidence 0.1, customerName "Unknown", totalAmount 0, items []. For customerName, categoryName, attributionName, paymentAccountName: pick from injected lists if match, else return new value (will create). For categoryName/attributionName, prioritize semantic fit, not list position/frequency (frequency is only weak tie-breaker). Dates YYYY-MM-DD; use ${today} if not mentioned.

Data: today=${today}. Customers [${customerList}]. Currencies [${currencyList}], default ${defaultCurrency}. Accounts [${paymentAccountList}]. Categories [${categoryList}]. Attributions [${attributionNamesCsv}], default "Employer".

Single pass only: include supplierInfo for the customer/payer taxNumber, phone, address as printed (JSON key supplierInfo; null when absent).

Output: customerName, supplierInfo{taxNumber,phone,address}, date, totalAmount, currency, paymentAccountName (optional), tax (default 0), items[] where each item includes name, itemAlias(optional), categoryName, attributionName, price, dataConsistency{itemsSum,itemsSumMatchesTotal,missingItems,consistencyComment}, confidence(0-1).`;

  const prompt = INVOICE_DOCUMENT_PARSE_INTRO + rulesAndData;
  const { base64, mimeType } = await downloadFileToBase64(fileUrl, mimeHint);
  if (isSpreadsheetMime(mimeType, fileUrl)) {
    const plain = spreadsheetBase64ToPlainText(base64, mimeType, fileUrl);
    return recognizeInvoiceFromText(plain);
  }
  if (isWordDocumentMime(mimeType, fileUrl)) {
    const plain = await wordDocumentBase64ToPlainText(base64);
    return recognizeInvoiceFromText(plain);
  }
  const filePart = { inlineData: { data: base64, mimeType } };
  const currentGenAI = new GoogleGenerativeAI(currentApiKey);
  let availableModel: string | null = null;
  try {
    availableModel = await getAvailableImageModel();
  } catch {}
  const modelsToTry = geminiModelsToTry(availableModel, {
    promptTextLength: prompt.length,
    inlineBase64Length: base64.length,
    mimeType,
  });
  let lastError: Error | null = null;
  for (const modelName of modelsToTry) {
    try {
      const model = currentGenAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([prompt, filePart]);
      const textResponse = result.response.text();
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed: any = JSON.parse(jsonMatch[0]);
      parsed.supplierInfo = normalizePrintedPartyContact(parsed.supplierInfo ?? parsed.customerInfo);
      if (!parsed.customerName) parsed.customerName = 'Customer';
      if (!parsed.date) parsed.date = today;
      parsed.date = normalizeShortDate(parsed.date);
      if (parsed.totalAmount === undefined) parsed.totalAmount = 0;
      if (!parsed.items || !Array.isArray(parsed.items)) parsed.items = [{ name: 'Sale', categoryName: categoryNames[0] || 'Sales', attributionName: attributionNames[0] || 'Employer', price: parsed.totalAmount || 0 }];
      parsed.items = parsed.items.map((item: any) => {
        const readable = resolveReadableItemName(item);
        const attributionName =
          (item.attributionName ?? item.purposeName ?? item.purpose ?? attributionNames[0]) || 'Employer';
        return { ...item, name: readable.name, ...(readable.itemAlias ? { itemAlias: readable.itemAlias } : {}), attributionName };
      }).filter((item: any) => item.name != null && item.price !== undefined && item.categoryName);
      if (parsed.items.length === 0) parsed.items = [{ name: 'Sale', categoryName: categoryNames[0] || 'Sales', attributionName: attributionNames[0] || 'Employer', price: parsed.totalAmount || 0 }];
      if (!parsed.currency) parsed.currency = defaultCurrency;
      if (parsed.confidence === undefined) parsed.confidence = 0.8;
      if (!parsed.dataConsistency) parsed.dataConsistency = {};
      return parsed as GeminiVoucherResult;
    } catch (error) {
      clearModelCacheIfUnavailable(error);
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
  }
  throw lastError || new Error('All models failed');
}

/** 按凭证类型从语音识别 */
export async function recognizeVoucherFromAudio(audioUri: string, voucherType: VoucherLogType): Promise<GeminiVoucherResult> {
  if (voucherType === 'receipt') {
    const r = await recognizeReceiptFromAudio(audioUri);
    return { ...r, customerName: undefined } as GeminiVoucherResult;
  }
  if (voucherType === 'invoice') {
    return recognizeInvoiceFromAudio(audioUri);
  }
  const r = await recognizeReceiptFromAudio(audioUri);
  return { ...r, customerName: undefined } as GeminiVoucherResult;
}

/** 发票语音识别：与文字相同结构，输出 customerName 等 */
async function recognizeInvoiceFromAudio(audioUri: string): Promise<GeminiVoucherResult> {
  const currentApiKey = getCurrentGeminiApiKey();
  const currentGenAI = new GoogleGenerativeAI(currentApiKey);

  let categoryNames: string[] = [];
  try {
    const categories = await getCategories('income');
    categoryNames = categories.map(cat => cat.name);
  } catch {
    categoryNames = [...DEFAULT_INCOME_CATEGORIES];
  }
  if (categoryNames.length === 0) categoryNames = [...DEFAULT_INCOME_CATEGORIES];
  let attributionNames: string[] = [];
  try {
    const attributions = await getAttributions('income');
    attributionNames = attributions.map(p => p.name);
  } catch {
    attributionNames = [...DEFAULT_INCOME_ATTRIBUTIONS];
  }
  if (attributionNames.length === 0) attributionNames = [...DEFAULT_INCOME_ATTRIBUTIONS];
  let paymentAccountNames: string[] = [];
  try {
    const accounts = await getAccountsForOptions();
    paymentAccountNames = accounts.map(pa => pa.name);
  } catch {}
  let userCurrencies: string[] = [];
  try {
    userCurrencies = await getCurrenciesByUsage();
  } catch {}
  let customerNamesAudio: string[] = [];
  try {
    const entities = await getEntityOptions();
    customerNamesAudio = entities.map((e) => e.name);
  } catch (e) {
    console.warn('Failed to fetch customers:', e);
  }
  const categoryList = toUnrankedOptionList(categoryNames).join(', ');
  const attributionNamesCsv = toUnrankedOptionList(attributionNames).join(', ');
  const paymentAccountList = paymentAccountNames.length > 0 ? paymentAccountNames.join(', ') : '';
  const customerListAudio = customerNamesAudio.length > 0 ? customerNamesAudio.join(', ') : '';
  const defaultCurrency = userCurrencies.length > 0 ? userCurrencies[0] : 'USD';
  const currencyList = userCurrencies.length > 0 ? userCurrencies.join(', ') : 'USD, CAD, CNY';
  const today = getLocalDateString();

  const prompt = `Extract INVOICE (sales / money received) from this audio. Return ONLY valid JSON, no markdown.

Rules: Unclear/noise-only audio → confidence 0.1, customerName "Unknown", totalAmount 0, items []. For customerName, categoryName, attributionName, paymentAccountName: pick from injected lists if match, else return new value (will create). For categoryName/attributionName, prioritize semantic fit, not list position/frequency (frequency is only weak tie-breaker). Only extract what you actually hear.

Data: today=${today}. Customers [${customerListAudio || 'None'}]. Currencies [${currencyList}], default ${defaultCurrency}. Accounts [${paymentAccountList || 'None'}]. Categories [${categoryList}]. Attributions [${attributionNamesCsv}], default "Employer".

Single pass: include supplierInfo for customer taxNumber, phone, address when clearly spoken (JSON key supplierInfo).

Return ONLY valid JSON: customerName, supplierInfo{taxNumber,phone,address}, date (YYYY-MM-DD), totalAmount, currency, tax, paymentAccountName, items (name, itemAlias(optional), categoryName, attributionName, price), dataConsistency (itemsSum, itemsSumMatchesTotal, missingItems, consistencyComment), confidence(0-1).`;

  const audioBase64 = await FileSystem.readAsStringAsync(audioUri, { encoding: FileSystem.EncodingType.Base64 });
  let availableModel: string | null = null;
  try {
    availableModel = await getAvailableImageModel();
  } catch {}
  const modelsToTry = geminiModelsToTry(availableModel, {
    promptTextLength: prompt.length,
    inlineBase64Length: audioBase64.length,
    mimeType: 'audio/m4a',
  });
  let lastError: Error | null = null;

  for (const modelName of modelsToTry) {
    try {
      const model = currentGenAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        { inlineData: { data: audioBase64, mimeType: 'audio/m4a' } },
        prompt,
      ]);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed: any = JSON.parse(jsonMatch[0]);
      parsed.supplierInfo = normalizePrintedPartyContact(parsed.supplierInfo ?? parsed.customerInfo);
      if (!parsed.customerName) parsed.customerName = 'Customer';
      if (!parsed.date) parsed.date = today;
      parsed.date = normalizeShortDate(parsed.date);
      if (parsed.totalAmount === undefined) parsed.totalAmount = 0;
      if (!parsed.items || !Array.isArray(parsed.items)) parsed.items = [{ name: 'Sale', categoryName: categoryNames[0] || 'Sales', attributionName: attributionNames[0] || 'Employer', price: parsed.totalAmount || 0 }];
      parsed.items = parsed.items.map((item: any) => {
        const readable = resolveReadableItemName(item);
        const attributionName =
          (item.attributionName ?? item.purposeName ?? item.purpose ?? attributionNames[0]) || 'Employer';
        return { ...item, name: readable.name, ...(readable.itemAlias ? { itemAlias: readable.itemAlias } : {}), attributionName };
      }).filter((item: any) => item.name != null && item.price !== undefined && item.categoryName);
      if (parsed.items.length === 0) parsed.items = [{ name: 'Sale', categoryName: categoryNames[0] || 'Sales', attributionName: attributionNames[0] || 'Employer', price: parsed.totalAmount || 0 }];
      if (!parsed.currency) parsed.currency = defaultCurrency;
      if (parsed.confidence === undefined) parsed.confidence = 0.8;
      if (!parsed.dataConsistency) parsed.dataConsistency = {};
      return parsed as GeminiVoucherResult;
    } catch (error) {
      clearModelCacheIfUnavailable(error);
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
  }
  throw lastError || new Error('All models failed');
}

// ---------- 入库/出库识别（另一套 prompt：货物流，明细为 数量+单位+单价） ----------

const INBOUND_JSON_EXAMPLE = (today: string) => `{
  "documentNo": "CK-06072",
  "supplierName": "某某科技有限公司",
  "warehouseName": "4#",
  "locationName": "E位",
  "date": "${today}",
  "inboundType": "采购入库",
  "totalAmount": 4030,
  "totalAmountChinese": "肆仟零佰叁拾零元",
  "currency": "CNY",
  "handlerName": "严某",
  "warehouseKeeperName": "周某",
  "accountantName": "周某",
  "remarks": null,
  "items": [
    {"lineNo": 1, "productCode": "001", "productName": "红外线探测仪", "specification": "A", "quantity": 5, "qualifiedQuantity": 5, "defectiveQuantity": 0, "unit": "个", "unitPrice": 300, "amount": 1500, "skuCode": "001", "remarks": null},
    {"lineNo": 2, "productCode": "002", "productName": "触摸开关", "specification": "A", "quantity": 10, "qualifiedQuantity": 9, "defectiveQuantity": 1, "unit": "个", "unitPrice": 130, "amount": 1300, "skuCode": "002", "remarks": null}
  ],
  "confidence": 0.9
}`;

/** 入库单文档解析引导：先读全文/表格再提取，与图片解析不同；数据规则与返回格式与图片一致 */
const INBOUND_DOCUMENT_PARSE_INTRO = `You are a warehouse/inventory expert. You are given a DOCUMENT (PDF or image of 入库单). First read and parse the entire document (tables, layout). Then extract INBOUND (入库) information. Return ONLY valid JSON, no markdown.

`;

/** 出库单文档解析引导：先读全文/表格再提取；数据规则与返回格式与图片一致 */
const OUTBOUND_DOCUMENT_PARSE_INTRO = `You are a warehouse/inventory expert. You are given a DOCUMENT (PDF or image of 出库单). First read and parse the entire document (tables, layout). Then extract OUTBOUND (出库) information. Return ONLY valid JSON, no markdown.

`;

function normalizeInboundItems(items: any[], defaultDate: string): any[] {
  return items
    .filter(
      (it: any) =>
        it &&
        (it.productName != null || it.name != null) &&
        (typeof it.quantity === 'number' || typeof it.quantity === 'string'),
    )
    .map((it: any, idx: number) => {
      const q = Number(it.quantity) || 1;
      const qualified = it.qualifiedQuantity != null ? Number(it.qualifiedQuantity) : undefined;
      const defective = it.defectiveQuantity != null ? Number(it.defectiveQuantity) : undefined;
      const unitPrice = it.unitPrice != null ? Number(it.unitPrice) : undefined;
      const amount = it.amount != null ? Number(it.amount) : (unitPrice != null ? q * unitPrice : undefined);
      return {
        lineNo: it.lineNo != null ? Number(it.lineNo) : idx + 1,
        productCode: it.productCode ?? it.code ?? undefined,
        productName: it.productName ?? it.name ?? 'Item',
        specification: it.specification ?? it.spec ?? undefined,
        quantity: q,
        qualifiedQuantity: qualified,
        defectiveQuantity: defective,
        unit: it.unit ?? '件',
        unitPrice,
        amount,
        skuCode: it.skuCode ?? it.code ?? it.sku ?? undefined,
        remarks: it.remarks ?? undefined,
      };
    });
}

const OUTBOUND_JSON_EXAMPLE = (today: string) => `{
  "documentNo": "2023/05/25-1",
  "customerName": "上海软件公司",
  "warehouseName": "中关村电器",
  "locationName": null,
  "date": "${today}",
  "totalAmount": 3604,
  "totalTax": 204,
  "currency": "CNY",
  "handlerName": null,
  "preparerName": "王罗",
  "accountantName": "林来",
  "remarks": null,
  "items": [
    {"lineNo": 1, "productName": "微波炉", "specification": null, "quantity": 1, "unit": "台", "unitPrice": 1000, "amount": 1000, "supplyPrice": 1000, "tax": 60, "skuCode": null, "remarks": null},
    {"lineNo": 2, "productName": "电脑", "specification": null, "quantity": 1, "unit": "个", "unitPrice": 2000, "amount": 2000, "supplyPrice": 2000, "tax": 120, "skuCode": null, "remarks": null}
  ],
  "confidence": 0.9
}`;

function normalizeOutboundItems(items: any[], defaultDate: string): any[] {
  return items
    .filter(
      (it: any) =>
        it &&
        (it.productName != null || it.name != null) &&
        (typeof it.quantity === 'number' || typeof it.quantity === 'string'),
    )
    .map((it: any, idx: number) => {
      const q = Number(it.quantity) || 1;
      const unitPrice = it.unitPrice != null ? Number(it.unitPrice) : undefined;
      const amount = it.amount != null ? Number(it.amount) : (unitPrice != null ? q * unitPrice : undefined);
      return {
        lineNo: it.lineNo != null ? Number(it.lineNo) : idx + 1,
        productName: it.productName ?? it.name ?? 'Item',
        specification: it.specification ?? it.spec ?? undefined,
        quantity: q,
        unit: it.unit ?? '件',
        unitPrice,
        amount,
        supplyPrice: it.supplyPrice != null ? Number(it.supplyPrice) : undefined,
        tax: it.tax != null ? Number(it.tax) : undefined,
        skuCode: it.skuCode ?? it.code ?? it.sku ?? undefined,
        remarks: it.remarks ?? undefined,
      };
    });
}

type InboundOptionLists = {
  supplierListIn: string;
  warehouseListIn: string;
  locationListIn: string;
  skuListIn: string;
};

async function loadInboundOptionLists(): Promise<InboundOptionLists> {
  let supplierListIn = '';
  let warehouseListIn = '';
  let locationListIn = '';
  let skuListIn = '';
  try {
    const [suppliers, warehouses, skus] = await Promise.all([
      getEntityOptions(),
      getWarehousesForOptions(),
      getSkusForOptions(),
    ]);
    supplierListIn = suppliers.map((s) => s.name).join(', ');
    warehouseListIn = warehouses.map((w) => w.name).join(', ');
    const locNames: string[] = [];
    for (const w of warehouses) {
      const locs = await getLocationsByWarehouseForOptions(w.id);
      locNames.push(...locs.map((l) => l.name));
    }
    locationListIn = [...new Set(locNames)].join(', ');
    skuListIn = skus.map((s) => (s.code ? `${s.code}(${s.name})` : s.name)).join(', ');
  } catch (e) {
    console.warn('Failed to fetch inbound options:', e);
  }
  return { supplierListIn, warehouseListIn, locationListIn, skuListIn };
}

function buildInboundExtractionRules(today: string, lists: InboundOptionLists): string {
  const { supplierListIn, warehouseListIn, locationListIn, skuListIn } = lists;
  return `Rules: For supplierName, warehouseName, locationName, skuCode/productCode: pick from injected lists if match, else return new value (will create). date YYYY-MM-DD, use ${today} if missing; ambiguous slash dates → closest to today.

Data: today=${today}. Suppliers [${supplierListIn || 'None'}]. Warehouses [${warehouseListIn || 'None'}]. Locations [${locationListIn || 'None'}]. SKUs (code or name) [${skuListIn || 'None'}].

HEADER: documentNo, supplierName, warehouseName, locationName, date, inboundType, totalAmount, totalAmountChinese, currency, handlerName, warehouseKeeperName, accountantName, remarks.
ITEMS (array, REQUIRED): lineNo, productCode, productName, specification, quantity, qualifiedQuantity, defectiveQuantity, unit, unitPrice, amount, skuCode, remarks. Output confidence(0-1).`;
}

function parseInboundModelJson(textResponse: string, today: string): GeminiInboundOutboundResult {
  const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');
  const parsed: any = JSON.parse(jsonMatch[0]);
  if (!parsed.supplierName) parsed.supplierName = 'Supplier';
  if (!parsed.date) parsed.date = today;
  parsed.date = normalizeShortDate(parsed.date);
  if (!parsed.items || !Array.isArray(parsed.items)) parsed.items = [];
  parsed.items = normalizeInboundItems(parsed.items, today);
  if (parsed.items.length === 0) parsed.items = [{ productName: 'Goods', quantity: 1, unit: '件', unitPrice: parsed.totalAmount }];
  if (parsed.confidence === undefined) parsed.confidence = 0.8;
  return parsed as GeminiInboundOutboundResult;
}

/** 入库单文字识别：按样例表格最完整字段提取 */
export async function recognizeInboundFromText(text: string): Promise<GeminiInboundOutboundResult> {
  const currentApiKey = getCurrentGeminiApiKey();
  const today = getLocalDateString();
  const lists = await loadInboundOptionLists();
  const prompt = `Extract INBOUND (入库单) from text. INBOUND = goods received from supplier. Return ONLY valid JSON, no markdown.

${buildInboundExtractionRules(today, lists)}

User input:
"${text}"`;

  const currentGenAI = new GoogleGenerativeAI(currentApiKey);
  const modelsToTry = geminiModelsToTry(null, { promptTextLength: prompt.length });
  let lastError: Error | null = null;
  for (const modelName of modelsToTry) {
    try {
      const model = currentGenAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const textResponse = result.response.text();
      return parseInboundModelJson(textResponse, today);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
  }
  throw lastError || new Error('All models failed');
}

/** 入库单语音识别：音频一次 multimodal 调用，与文字路径同一 schema（不再先转写再解析） */
export async function recognizeInboundFromAudio(audioUri: string): Promise<GeminiInboundOutboundResult> {
  const currentApiKey = getCurrentGeminiApiKey();
  const today = getLocalDateString();
  const lists = await loadInboundOptionLists();
  const prompt = `Extract INBOUND (入库单) from the attached audio. INBOUND = goods received from supplier. Return ONLY valid JSON, no markdown.

${buildInboundExtractionRules(today, lists)}

Listen to the audio and output one JSON object. Unclear or noise-only audio → still return valid JSON with appropriate confidence; use empty or minimal items when nothing usable is heard.`;

  const audioBase64 = await FileSystem.readAsStringAsync(audioUri, { encoding: FileSystem.EncodingType.Base64 });
  const currentGenAI = new GoogleGenerativeAI(currentApiKey);
  let availableModel: string | null = null;
  try {
    availableModel = await getAvailableImageModel();
  } catch {}
  const modelsToTry = geminiModelsToTry(availableModel, {
    promptTextLength: prompt.length,
    inlineBase64Length: audioBase64.length,
    mimeType: 'audio/m4a',
  });
  let lastError: Error | null = null;
  for (const modelName of modelsToTry) {
    try {
      const model = currentGenAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        { inlineData: { data: audioBase64, mimeType: 'audio/m4a' } },
        prompt,
      ]);
      const textResponse = result.response.text();
      return parseInboundModelJson(textResponse, today);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      clearModelCacheIfUnavailable(error);
      continue;
    }
  }
  throw lastError || new Error('All models failed');
}

type OutboundOptionLists = {
  customerListOut: string;
  warehouseListOut: string;
  locationListOut: string;
  skuListOut: string;
};

async function loadOutboundOptionLists(): Promise<OutboundOptionLists> {
  let customerListOut = '';
  let warehouseListOut = '';
  let locationListOut = '';
  let skuListOut = '';
  try {
    const [customers, warehouses, skus] = await Promise.all([
      getEntityOptions(),
      getWarehousesForOptions(),
      getSkusForOptions(),
    ]);
    customerListOut = customers.map((c) => c.name).join(', ');
    warehouseListOut = warehouses.map((w) => w.name).join(', ');
    const locNames: string[] = [];
    for (const w of warehouses) {
      const locs = await getLocationsByWarehouseForOptions(w.id);
      locNames.push(...locs.map((l) => l.name));
    }
    locationListOut = [...new Set(locNames)].join(', ');
    skuListOut = skus.map((s) => (s.code ? `${s.code}(${s.name})` : s.name)).join(', ');
  } catch (e) {
    console.warn('Failed to fetch outbound options:', e);
  }
  return { customerListOut, warehouseListOut, locationListOut, skuListOut };
}

function buildOutboundExtractionRules(today: string, lists: OutboundOptionLists): string {
  const { customerListOut, warehouseListOut, locationListOut, skuListOut } = lists;
  return `Rules: For customerName, warehouseName, locationName, skuCode: pick from injected lists if match, else return new value (will create). date YYYY-MM-DD, use ${today} if missing; ambiguous slash dates → closest to today.

Data: today=${today}. Customers [${customerListOut || 'None'}]. Warehouses [${warehouseListOut || 'None'}]. Locations [${locationListOut || 'None'}]. SKUs (code or name) [${skuListOut || 'None'}].

HEADER: documentNo, customerName, warehouseName, locationName, date, totalAmount, totalTax, currency, handlerName, preparerName, accountantName, remarks.
ITEMS (array, REQUIRED): lineNo, productName, specification, quantity, unit, unitPrice, amount, supplyPrice, tax, skuCode, remarks. Output confidence(0-1).`;
}

function parseOutboundModelJson(textResponse: string, today: string): GeminiInboundOutboundResult {
  const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');
  const parsed: any = JSON.parse(jsonMatch[0]);
  if (!parsed.customerName) parsed.customerName = 'Customer';
  if (!parsed.date) parsed.date = today;
  parsed.date = normalizeShortDate(parsed.date);
  if (!parsed.items || !Array.isArray(parsed.items)) parsed.items = [];
  parsed.items = normalizeOutboundItems(parsed.items, today);
  if (parsed.items.length === 0) parsed.items = [{ productName: 'Goods', quantity: 1, unit: '件', unitPrice: parsed.totalAmount }];
  if (parsed.confidence === undefined) parsed.confidence = 0.8;
  return parsed as GeminiInboundOutboundResult;
}

/** 出库单文字识别：按样例表格最完整字段提取 */
export async function recognizeOutboundFromText(text: string): Promise<GeminiInboundOutboundResult> {
  const currentApiKey = getCurrentGeminiApiKey();
  const today = getLocalDateString();
  const lists = await loadOutboundOptionLists();
  const prompt = `Extract OUTBOUND (出库单) from text. OUTBOUND = goods shipped to customer. Return ONLY valid JSON, no markdown.

${buildOutboundExtractionRules(today, lists)}

User input:
"${text}"`;

  const currentGenAI = new GoogleGenerativeAI(currentApiKey);
  const modelsToTry = geminiModelsToTry(null, { promptTextLength: prompt.length });
  let lastError: Error | null = null;
  for (const modelName of modelsToTry) {
    try {
      const model = currentGenAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const textResponse = result.response.text();
      return parseOutboundModelJson(textResponse, today);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
  }
  throw lastError || new Error('All models failed');
}

/** 出库单语音识别：音频一次 multimodal 调用，与文字路径同一 schema（不再先转写再解析） */
export async function recognizeOutboundFromAudio(audioUri: string): Promise<GeminiInboundOutboundResult> {
  const currentApiKey = getCurrentGeminiApiKey();
  const today = getLocalDateString();
  const lists = await loadOutboundOptionLists();
  const prompt = `Extract OUTBOUND (出库单) from the attached audio. OUTBOUND = goods shipped to customer. Return ONLY valid JSON, no markdown.

${buildOutboundExtractionRules(today, lists)}

Listen to the audio and output one JSON object. Unclear or noise-only audio → still return valid JSON with appropriate confidence; use empty or minimal items when nothing usable is heard.`;

  const audioBase64 = await FileSystem.readAsStringAsync(audioUri, { encoding: FileSystem.EncodingType.Base64 });
  const currentGenAI = new GoogleGenerativeAI(currentApiKey);
  let availableModel: string | null = null;
  try {
    availableModel = await getAvailableImageModel();
  } catch {}
  const modelsToTry = geminiModelsToTry(availableModel, {
    promptTextLength: prompt.length,
    inlineBase64Length: audioBase64.length,
    mimeType: 'audio/m4a',
  });
  let lastError: Error | null = null;
  for (const modelName of modelsToTry) {
    try {
      const model = currentGenAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        { inlineData: { data: audioBase64, mimeType: 'audio/m4a' } },
        prompt,
      ]);
      const textResponse = result.response.text();
      return parseOutboundModelJson(textResponse, today);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      clearModelCacheIfUnavailable(error);
      continue;
    }
  }
  throw lastError || new Error('All models failed');
}

/** 从 URL 下载图片并转为 base64 + mimeType（入库/出库图片识别复用） */
async function downloadImageToBase64(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
  const downloadResult = await FileSystem.downloadAsync(
    imageUrl,
    FileSystem.documentDirectory + `temp-img-${Date.now()}.jpg`
  );
  if (!downloadResult.uri) throw new Error('Failed to download image from URL');
  const base64 = await FileSystem.readAsStringAsync(downloadResult.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  try {
    await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true });
  } catch (_) {}
  let mimeType = 'image/jpeg';
  if (imageUrl.includes('.png')) mimeType = 'image/png';
  else if (imageUrl.includes('.gif')) mimeType = 'image/gif';
  else if (imageUrl.includes('.webp')) mimeType = 'image/webp';
  return { base64, mimeType };
}

/** 入库单图片识别：按样例表格最完整字段提取（与文字识别同一结构） */
export async function recognizeInboundFromImage(imageUrl: string): Promise<GeminiInboundOutboundResult> {
  const currentApiKey = getCurrentGeminiApiKey();
  const today = getLocalDateString();
  const prompt = `You are a warehouse/inventory expert. Analyze this IMAGE of an INBOUND document (入库单). INBOUND = goods received from a supplier. Extract ALL visible information. Return ONLY valid JSON, no markdown.

CURRENT DATE: ${today}. For ambiguous short slash dates, choose the date closest to today.

HEADER: documentNo, supplierName, warehouseName, locationName, date, inboundType, totalAmount, totalAmountChinese, currency, handlerName, warehouseKeeperName, accountantName, remarks.
ITEMS (array, REQUIRED): lineNo, productCode, productName, specification, quantity, qualifiedQuantity, defectiveQuantity, unit, unitPrice, amount, skuCode, remarks.

Example structure:
${INBOUND_JSON_EXAMPLE(today)}`;

  const { base64, mimeType } = await downloadImageToBase64(imageUrl);
  const imagePart = { inlineData: { data: base64, mimeType } };
  const currentGenAI = new GoogleGenerativeAI(currentApiKey);
  let availableModel: string | null = null;
  try {
    availableModel = await getAvailableImageModel();
  } catch (_) {}
  const modelsToTry = geminiModelsToTry(availableModel, {
    promptTextLength: prompt.length,
    inlineBase64Length: base64.length,
    mimeType,
  });
  let lastError: Error | null = null;
  for (const modelName of modelsToTry) {
    try {
      const model = currentGenAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([prompt, imagePart]);
      const textResponse = result.response.text();
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed: any = JSON.parse(jsonMatch[0]);
      if (!parsed.supplierName) parsed.supplierName = 'Supplier';
      if (!parsed.date) parsed.date = today;
      parsed.date = normalizeShortDate(parsed.date);
      if (!parsed.items || !Array.isArray(parsed.items)) parsed.items = [];
      parsed.items = normalizeInboundItems(parsed.items, today);
      if (parsed.items.length === 0) parsed.items = [{ productName: 'Goods', quantity: 1, unit: '件', unitPrice: parsed.totalAmount }];
      if (parsed.confidence === undefined) parsed.confidence = 0.8;
      return parsed as GeminiInboundOutboundResult;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
  }
  throw lastError || new Error('All models failed');
}

/** 出库单图片识别：按样例表格最完整字段提取（与文字识别同一结构） */
export async function recognizeOutboundFromImage(imageUrl: string): Promise<GeminiInboundOutboundResult> {
  const currentApiKey = getCurrentGeminiApiKey();
  const today = getLocalDateString();
  const prompt = `You are a warehouse/inventory expert. Analyze this IMAGE of an OUTBOUND document (出库单). OUTBOUND = goods shipped to a customer. Extract ALL visible information. Return ONLY valid JSON, no markdown.

CURRENT DATE: ${today}. For ambiguous short slash dates, choose the date closest to today.

HEADER: documentNo, customerName, warehouseName, locationName, date, totalAmount, totalTax, currency, handlerName, preparerName, accountantName, remarks.
ITEMS (array, REQUIRED): lineNo, productName, specification, quantity, unit, unitPrice, amount, supplyPrice, tax, skuCode, remarks.

Example structure:
${OUTBOUND_JSON_EXAMPLE(today)}`;

  const { base64, mimeType } = await downloadImageToBase64(imageUrl);
  const imagePart = { inlineData: { data: base64, mimeType } };
  const currentGenAI = new GoogleGenerativeAI(currentApiKey);
  let availableModel: string | null = null;
  try {
    availableModel = await getAvailableImageModel();
  } catch (_) {}
  const modelsToTry = geminiModelsToTry(availableModel, {
    promptTextLength: prompt.length,
    inlineBase64Length: base64.length,
    mimeType,
  });
  let lastError: Error | null = null;
  for (const modelName of modelsToTry) {
    try {
      const model = currentGenAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([prompt, imagePart]);
      const textResponse = result.response.text();
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed: any = JSON.parse(jsonMatch[0]);
      if (!parsed.customerName) parsed.customerName = 'Customer';
      if (!parsed.date) parsed.date = today;
      parsed.date = normalizeShortDate(parsed.date);
      if (!parsed.items || !Array.isArray(parsed.items)) parsed.items = [];
      parsed.items = normalizeOutboundItems(parsed.items, today);
      if (parsed.items.length === 0) parsed.items = [{ productName: 'Goods', quantity: 1, unit: '件', unitPrice: parsed.totalAmount }];
      if (parsed.confidence === undefined) parsed.confidence = 0.8;
      return parsed as GeminiInboundOutboundResult;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
  }
  throw lastError || new Error('All models failed');
}

/** 入库单文档识别（PDF 等）：文档解析引导 + 与图片相同的数据规则与 JSON */
export async function recognizeInboundFromDocument(fileUrl: string, mimeHint?: string): Promise<GeminiInboundOutboundResult> {
  const currentApiKey = getCurrentGeminiApiKey();
  const today = getLocalDateString();
  const rulesAndExample = `CURRENT DATE: ${today}. For ambiguous short slash dates, choose the date closest to today.

HEADER: documentNo, supplierName, warehouseName, locationName, date, inboundType, totalAmount, totalAmountChinese, currency, handlerName, warehouseKeeperName, accountantName, remarks.
ITEMS (array, REQUIRED): lineNo, productCode, productName, specification, quantity, qualifiedQuantity, defectiveQuantity, unit, unitPrice, amount, skuCode, remarks.

Example structure:
${INBOUND_JSON_EXAMPLE(today)}`;
  const prompt = INBOUND_DOCUMENT_PARSE_INTRO + rulesAndExample;

  const { base64, mimeType } = await downloadFileToBase64(fileUrl, mimeHint);
  if (isSpreadsheetMime(mimeType, fileUrl)) {
    const plain = spreadsheetBase64ToPlainText(base64, mimeType, fileUrl);
    return recognizeInboundFromText(plain);
  }
  if (isWordDocumentMime(mimeType, fileUrl)) {
    const plain = await wordDocumentBase64ToPlainText(base64);
    return recognizeInboundFromText(plain);
  }
  const filePart = { inlineData: { data: base64, mimeType } };
  const currentGenAI = new GoogleGenerativeAI(currentApiKey);
  let availableModel: string | null = null;
  try {
    availableModel = await getAvailableImageModel();
  } catch (_) {}
  const modelsToTry = geminiModelsToTry(availableModel, {
    promptTextLength: prompt.length,
    inlineBase64Length: base64.length,
    mimeType,
  });
  let lastError: Error | null = null;
  for (const modelName of modelsToTry) {
    try {
      const model = currentGenAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([prompt, filePart]);
      const textResponse = result.response.text();
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed: any = JSON.parse(jsonMatch[0]);
      if (!parsed.supplierName) parsed.supplierName = 'Supplier';
      if (!parsed.date) parsed.date = today;
      parsed.date = normalizeShortDate(parsed.date);
      if (!parsed.items || !Array.isArray(parsed.items)) parsed.items = [];
      parsed.items = normalizeInboundItems(parsed.items, today);
      if (parsed.items.length === 0) parsed.items = [{ productName: 'Goods', quantity: 1, unit: '件', unitPrice: parsed.totalAmount }];
      if (parsed.confidence === undefined) parsed.confidence = 0.8;
      return parsed as GeminiInboundOutboundResult;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
  }
  throw lastError || new Error('All models failed');
}

// ---------------------------------------------------------------------------
// Client Assistant: extract client/contact info from text, document, or image
// ---------------------------------------------------------------------------

const CLIENT_EXTRACTION_PROMPT = `You are a data extraction assistant. Extract client/contact records from the given content (text, document, or image of business cards or client lists).

For each person or organization contact found, extract:
- email (REQUIRED): valid email address. If none found for a row, omit that row.
- contactName (optional): person name
- orgName (optional): company or organization name
- address (optional): full or partial address

Sources may be: pasted text (CSV-like, line-separated, or prose), PDF/Word client lists, or images of business cards. Return one record per contact; merge multiple cards in one image into multiple records.

Return ONLY valid JSON, no markdown or explanation:
{
  "clients": [
    { "email": "user@example.com", "contactName": "John Doe", "orgName": "Acme Inc", "address": "123 Main St, City" }
  ]
}
If no valid email is found in the content, return { "clients": [] }.`;

function buildClientRecognitionResult(clients: ExtractedClient[]): ClientRecognitionResult {
  const valid = clients.filter((c) => c.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim()));
  let completeCount = 0;
  let incompleteCount = 0;
  for (const c of valid) {
    const hasName = !!(c.contactName?.trim() || c.orgName?.trim());
    if (hasName) completeCount++;
    else incompleteCount++;
  }
  return {
    clients: valid.map((c) => ({
      email: c.email.trim().toLowerCase(),
      contactName: c.contactName?.trim() || undefined,
      orgName: c.orgName?.trim() || undefined,
      address: c.address?.trim() || undefined,
    })),
    summary: {
      totalCount: valid.length,
      completeCount,
      incompleteCount,
    },
  };
}

/** Client Assistant: extract client list from pasted text or typed list. */
export async function recognizeClientsFromText(text: string): Promise<ClientRecognitionResult> {
  const currentApiKey = getCurrentGeminiApiKey();
  const currentGenAI = new GoogleGenerativeAI(currentApiKey);
  const prompt = `${CLIENT_EXTRACTION_PROMPT}\n\nContent to parse:\n${text}`;
  const modelsToTry = geminiModelsToTry(null, { promptTextLength: prompt.length });
  let lastError: Error | null = null;
  for (const modelName of modelsToTry) {
    try {
      const model = currentGenAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const textResponse = result.response.text();
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed: { clients?: ExtractedClient[] } = JSON.parse(jsonMatch[0]);
      const list = Array.isArray(parsed.clients) ? parsed.clients : [];
      return buildClientRecognitionResult(list);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
  }
  throw lastError || new Error('Client extraction from text failed');
}

/** Client Assistant: extract client list from document (PDF/Word) or image URL. */
export async function recognizeClientsFromDocument(fileUrl: string, mimeHint?: string): Promise<ClientRecognitionResult> {
  const currentApiKey = getCurrentGeminiApiKey();
  const { base64, mimeType } = await downloadFileToBase64(fileUrl, mimeHint);
  if (isSpreadsheetMime(mimeType, fileUrl)) {
    const plain = spreadsheetBase64ToPlainText(base64, mimeType, fileUrl);
    return recognizeClientsFromText(plain);
  }
  if (isWordDocumentMime(mimeType, fileUrl)) {
    const plain = await wordDocumentBase64ToPlainText(base64);
    return recognizeClientsFromText(plain);
  }
  const filePart = { inlineData: { data: base64, mimeType } };
  const currentGenAI = new GoogleGenerativeAI(currentApiKey);
  let availableModel: string | null = null;
  try {
    availableModel = await getAvailableImageModel();
  } catch (_) {}
  const modelsToTry = geminiModelsToTry(availableModel, {
    promptTextLength: CLIENT_EXTRACTION_PROMPT.length,
    inlineBase64Length: base64.length,
    mimeType,
  });
  let lastError: Error | null = null;
  for (const modelName of modelsToTry) {
    try {
      const model = currentGenAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([CLIENT_EXTRACTION_PROMPT, filePart]);
      const textResponse = result.response.text();
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed: { clients?: ExtractedClient[] } = JSON.parse(jsonMatch[0]);
      const list = Array.isArray(parsed.clients) ? parsed.clients : [];
      return buildClientRecognitionResult(list);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
  }
  throw lastError || new Error('Client extraction from document failed');
}

/** Client Assistant: extract client list from image URL (e.g. business card photo). */
export async function recognizeClientsFromImage(imageUrl: string): Promise<ClientRecognitionResult> {
  return recognizeClientsFromDocument(imageUrl, 'image/jpeg');
}

/** 出库单文档识别（PDF 等）：文档解析引导 + 与图片相同的数据规则与 JSON */
export async function recognizeOutboundFromDocument(fileUrl: string, mimeHint?: string): Promise<GeminiInboundOutboundResult> {
  const currentApiKey = getCurrentGeminiApiKey();
  const today = getLocalDateString();
  const rulesAndExample = `CURRENT DATE: ${today}. For ambiguous short slash dates, choose the date closest to today.

HEADER: documentNo, customerName, warehouseName, locationName, date, totalAmount, totalTax, currency, handlerName, preparerName, accountantName, remarks.
ITEMS (array, REQUIRED): lineNo, productName, specification, quantity, unit, unitPrice, amount, supplyPrice, tax, skuCode, remarks.

Example structure:
${OUTBOUND_JSON_EXAMPLE(today)}`;
  const prompt = OUTBOUND_DOCUMENT_PARSE_INTRO + rulesAndExample;

  const { base64, mimeType } = await downloadFileToBase64(fileUrl, mimeHint);
  if (isSpreadsheetMime(mimeType, fileUrl)) {
    const plain = spreadsheetBase64ToPlainText(base64, mimeType, fileUrl);
    return recognizeOutboundFromText(plain);
  }
  if (isWordDocumentMime(mimeType, fileUrl)) {
    const plain = await wordDocumentBase64ToPlainText(base64);
    return recognizeOutboundFromText(plain);
  }
  const filePart = { inlineData: { data: base64, mimeType } };
  const currentGenAI = new GoogleGenerativeAI(currentApiKey);
  let availableModel: string | null = null;
  try {
    availableModel = await getAvailableImageModel();
  } catch (_) {}
  const modelsToTry = geminiModelsToTry(availableModel, {
    promptTextLength: prompt.length,
    inlineBase64Length: base64.length,
    mimeType,
  });
  let lastError: Error | null = null;
  for (const modelName of modelsToTry) {
    try {
      const model = currentGenAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([prompt, filePart]);
      const textResponse = result.response.text();
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed: any = JSON.parse(jsonMatch[0]);
      if (!parsed.customerName) parsed.customerName = 'Customer';
      if (!parsed.date) parsed.date = today;
      parsed.date = normalizeShortDate(parsed.date);
      if (!parsed.items || !Array.isArray(parsed.items)) parsed.items = [];
      parsed.items = normalizeOutboundItems(parsed.items, today);
      if (parsed.items.length === 0) parsed.items = [{ productName: 'Goods', quantity: 1, unit: '件', unitPrice: parsed.totalAmount }];
      if (parsed.confidence === undefined) parsed.confidence = 0.8;
      return parsed as GeminiInboundOutboundResult;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
  }
  throw lastError || new Error('All models failed');
}
