/**
 * 报税附件：按前述提示词调用 Gemini 识别图片，返回 summary / doc_type / extracted_data，供写回 project_todo_attachments。
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAvailableImageModel } from './gemini-helper';
import {
  buildTaxFilingRecognitionPrompt,
  type TaxFilingProjectContext,
  type TaxFilingTodoContext,
} from './tax-filing-recognition-prompt';

const POSSIBLE_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

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
    FileSystem.documentDirectory + `temp-tax-recognize-${Date.now()}.jpg`
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

export interface TaxFilingRecognitionResult {
  summary: string;
  doc_type: string;
  extracted_data: Record<string, unknown>;
  confidence_score?: number;
}

/**
 * 使用报税识别提示词对图片进行识别，返回结构化结果（写回 attachment 用）。
 */
export async function runTaxFilingRecognition(
  imageUrl: string,
  projectContext: TaxFilingProjectContext,
  todoContext?: TaxFilingTodoContext,
  userInstructions?: string
): Promise<TaxFilingRecognitionResult> {
  const currentApiKey = Constants.expoConfig?.extra?.geminiApiKey || process.env.EXPO_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  if (!currentApiKey || currentApiKey === 'placeholder-key') {
    const err = new Error('Gemini API Key 未配置') as any;
    err.code = 'GEMINI_API_KEY_MISSING';
    throw err;
  }

  const prompt = buildTaxFilingRecognitionPrompt({ projectContext, todoContext, userInstructions });
  const { base64, mimeType } = await downloadImageToBase64(imageUrl);
  const imagePart = { inlineData: { data: base64, mimeType } };
  const genAI = new GoogleGenerativeAI(currentApiKey);
  let availableModel: string | null = null;
  try {
    availableModel = await getAvailableImageModel();
  } catch (_) {}
  const modelsToTry = availableModel ? [availableModel, ...POSSIBLE_MODELS] : POSSIBLE_MODELS;
  let lastError: Error | null = null;

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([prompt, imagePart]);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed = JSON.parse(jsonMatch[0]) as {
        summary?: string;
        doc_type?: string;
        extracted_data?: Record<string, unknown>;
        confidence_score?: number;
      };
      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary : 'Tax document',
        doc_type: typeof parsed.doc_type === 'string' ? parsed.doc_type : 'UNKNOWN',
        extracted_data: parsed.extracted_data && typeof parsed.extracted_data === 'object' ? parsed.extracted_data : {},
        confidence_score: typeof parsed.confidence_score === 'number' ? parsed.confidence_score : undefined,
      };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      continue;
    }
  }
  throw lastError || new Error('Recognition failed');
}
