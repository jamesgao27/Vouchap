import { supabase } from './supabase';

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
    const body = {
      action: 'generateContent',
      model: this.model,
      contents: Array.isArray(contents) ? contents : [contents],
    };
    const { data, error } = await supabase.functions.invoke('gemini-proxy', { body });
    if (error) {
      throw new Error(error.message || 'Gemini proxy request failed');
    }
    const payload = (data || {}) as GeminiProxyGenerateResponse;
    if (!payload.success || !payload.text) {
      throw new Error(payload.error || 'Gemini proxy returned empty result');
    }
    return {
      response: {
        text: () => payload.text as string,
      },
      modelUsed: payload.modelUsed,
    };
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
  });
  if (error) {
    throw new Error(error.message || 'Gemini proxy listModels failed');
  }
  const payload = (data || {}) as GeminiProxyListModelsResponse;
  if (!payload.success) {
    throw new Error(payload.error || 'Gemini proxy listModels failed');
  }
  return payload.models || [];
}
