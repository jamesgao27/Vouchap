/**
 * 报税附件：根据文件内容识别文档类别，并自动匹配到项目的某个 task（用于 chat-to-log attachments 模式，不再由用户选 task）。
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAvailableImageModel } from './gemini-helper';

export interface TaxDocumentTaskMatcherContext {
  /** 报税辖区：CANADA | USA */
  taxCountry: string | null;
  /** 报税场景：T1, T2, 1040, 1120-S 等 */
  taxScenario: string | null;
}

export interface TaxDocumentTaskOption {
  id: string;
  title: string;
}

const POSSIBLE_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

/** Web 上使用 fetch 转 base64；Native 使用 expo-file-system（downloadAsync 在 web 不可用） */
async function downloadImageToBase64(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
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
    FileSystem.documentDirectory + `temp-tax-matcher-${Date.now()}.jpg`
  );
  if (!downloadResult.uri) throw new Error('Failed to download image from URL');
  const base64 = await FileSystem.readAsStringAsync(downloadResult.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  try {
    await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true });
  } catch (_) {}
  return { base64, mimeType };
}

function buildTaskMatcherPrompt(context: TaxDocumentTaskMatcherContext, tasks: TaxDocumentTaskOption[]): string {
  const jurisdiction = context.taxCountry === 'CANADA' ? 'Canada (CRA)' : context.taxCountry === 'USA' ? 'USA (IRS)' : 'North America';
  const scenario = context.taxScenario || 'general tax';
  const taskList = tasks.map((t) => `- id: "${t.id}", title: "${t.title}"`).join('\n');

  return `You are a North American tax document expert. Your task is to look at the provided image and decide which TASK from the list below this document best belongs to.

Context: Jurisdiction ${jurisdiction}, tax scenario: ${scenario}.

Common document types you might see (for matching to task titles):
- Canada: T4, T5, T4A, RRSP slip, donation receipt, financial statement, GST/HST, T2 schedules.
- USA: W-2, 1099-INT, 1099-DIV, 1098, 1099-MISC, K-1, S-corp forms.

TASK LIST (you must return one of these task ids):
${taskList}

Instructions:
1. Identify the document type/category from the image (e.g. T4, W-2, receipt, bank statement).
2. Choose the task whose title best matches this document type. Use semantic matching: e.g. "T4" document -> task titled "T4 slips" or "Employment income (T4)" or similar.
3. If no task clearly fits, pick the most general one (e.g. "Other documents" or the first task in the list).
4. Return ONLY valid JSON, no markdown. Example: {"task_id": "uuid-here"}

Output format: {"task_id": "<one of the ids from the list above>"}`;
}

/**
 * 根据附件图片识别文档类别，并返回应关联的 project todo (task) id。
 * 用于 chat-to-log attachments 模式：上传后自动匹配任务，无需用户选择。
 */
export async function classifyTaxDocumentAndPickTask(
  imageUrl: string,
  context: TaxDocumentTaskMatcherContext,
  tasks: TaxDocumentTaskOption[]
): Promise<{ taskId: string }> {
  if (tasks.length === 0) throw new Error('No tasks to match');
  const currentApiKey = Constants.expoConfig?.extra?.geminiApiKey || process.env.EXPO_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  if (!currentApiKey || currentApiKey === 'placeholder-key') {
    const err = new Error('Gemini API Key 未配置') as any;
    err.code = 'GEMINI_API_KEY_MISSING';
    throw err;
  }

  const prompt = buildTaskMatcherPrompt(context, tasks);
  const { base64, mimeType } = await downloadImageToBase64(imageUrl);
  const imagePart = { inlineData: { data: base64, mimeType } };
  const genAI = new GoogleGenerativeAI(currentApiKey);
  let availableModel: string | null = null;
  try {
    availableModel = await getAvailableImageModel();
  } catch (_) {}
  const modelsToTry = availableModel ? [availableModel, ...POSSIBLE_MODELS] : POSSIBLE_MODELS;
  const validIds = new Set(tasks.map((t) => t.id));
  let lastError: Error | null = null;

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([prompt, imagePart]);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed = JSON.parse(jsonMatch[0]) as { task_id?: string };
      const taskId = parsed?.task_id && validIds.has(parsed.task_id) ? parsed.task_id : null;
      if (taskId) return { taskId };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      continue;
    }
  }

  // 识别失败或无有效 task_id 时兜底：使用第一个任务
  return { taskId: tasks[0].id };
}
