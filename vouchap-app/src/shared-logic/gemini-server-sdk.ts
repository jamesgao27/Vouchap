import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** When Edge returns 4xx/5xx, functions-js sets data=null and throws FunctionsHttpError; JSON body is on error.context (Response). */
async function readEdgeFunctionJsonError(error: unknown): Promise<string | undefined> {
  if (!(error instanceof FunctionsHttpError)) return undefined;
  const res = error.context as unknown;
  if (!res || typeof (res as Response).clone !== 'function') return undefined;
  try {
    const response = res as Response;
    const ct = response.headers.get('Content-Type') || '';
    if (!ct.includes('application/json')) return undefined;
    const body: unknown = await response.clone().json();
    if (body && typeof body === 'object') {
      const o = body as { error?: unknown; message?: unknown };
      if (typeof o.error === 'string' && o.error.trim()) return o.error.trim();
      if (typeof o.message === 'string' && o.message.trim()) return o.message.trim();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

type InlineDataPart = {
  inlineData: {
    data: string;
    mimeType: string;
  };
};

type TextPart = string;
type GeminiContent = TextPart | InlineDataPart;

type GeminiProxyGenerateResponse = {
  success: boolean;
  text?: string;
  modelUsed?: string;
  error?: string;
};

type GeminiProxyListModelsResponse = {
  success: boolean;
  models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
  error?: string;
};

class ProxyGeminiModel {
  private readonly model: string;

  constructor(model: string) {
    this.model = model;
  }

  async generateContent(contents: GeminiContent | GeminiContent[]) {
    const parts = Array.isArray(contents) ? contents : [contents];
    const body = {
      action: 'generateContent',
      model: this.model,
      contents: parts,
    };
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      let inlineChars = 0;
      for (const p of parts) {
        if (p && typeof p === 'object' && 'inlineData' in p) {
          const d = (p as InlineDataPart).inlineData?.data;
          if (typeof d === 'string') inlineChars += d.length;
        }
      }
      console.log('[gemini-proxy] invoking Edge Function generateContent', {
        model: this.model,
        inlineImageBase64Chars: inlineChars,
      });
    }
    const { data, error } = await supabase.functions.invoke('gemini-proxy', {
      body,
      timeout: 180_000,
    });
    const payload = (data ?? null) as GeminiProxyGenerateResponse | null;
    const serverMsg =
      typeof payload?.error === 'string' && payload.error.trim()
        ? payload.error.trim()
        : null;
    if (payload?.success && payload.text) {
      return {
        response: {
          text: () => payload.text as string,
        },
        modelUsed: payload.modelUsed,
      };
    }
    const httpDetail = await readEdgeFunctionJsonError(error);
    throw new Error(
      serverMsg ||
        httpDetail ||
        (error instanceof Error ? error.message : String(error)) ||
        'Gemini proxy returned empty result',
    );
  }
}

export class GoogleGenerativeAI {
  constructor(_apiKey: string) {}

  getGenerativeModel(opts: { model: string }) {
    return new ProxyGeminiModel(opts.model);
  }
}

export async function listModelsViaGeminiProxy(): Promise<
  Array<{ name: string; supportedGenerationMethods?: string[] }>
> {
  const { data, error } = await supabase.functions.invoke('gemini-proxy', {
    body: { action: 'listModels' },
    timeout: 60_000,
  });
  const payload = (data ?? null) as GeminiProxyListModelsResponse | null;
  const serverMsg =
    typeof payload?.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : null;
  if (payload?.success) {
    return payload.models ?? [];
  }
  const httpDetail = await readEdgeFunctionJsonError(error);
  throw new Error(serverMsg || httpDetail || error?.message || 'Gemini proxy listModels failed');
}
