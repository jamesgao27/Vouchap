import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_MODEL = Deno.env.get('GEMINI_MODEL_DEFAULT') || 'gemini-1.5-flash';
const ENFORCE_SERVER_MODEL = Deno.env.get('GEMINI_ENFORCE_SERVER_MODEL') === 'true';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return jsonResponse({ success: false, error: 'GEMINI_API_KEY is missing on server.' }, 503);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();
    const clientModel = String(body?.model || '').trim();
    const model = ENFORCE_SERVER_MODEL ? DEFAULT_MODEL : (clientModel || DEFAULT_MODEL);
    const genAI = new GoogleGenerativeAI(apiKey);

    if (action === 'listModels') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
      if (!response.ok) {
        const text = await response.text();
        return jsonResponse({ success: false, error: `listModels failed: ${response.status} ${text}` }, 400);
      }
      const data = await response.json();
      return jsonResponse({ success: true, models: data?.models || [] });
    }

    if (action === 'generateContent') {
      const contents = Array.isArray(body?.contents) ? body.contents : [];
      if (contents.length === 0) {
        return jsonResponse({ success: false, error: 'contents is required' }, 400);
      }
      const result = await genAI.getGenerativeModel({ model }).generateContent(contents);
      const text = result?.response?.text?.();
      if (!text) {
        return jsonResponse({ success: false, error: 'Gemini returned empty text' }, 502);
      }
      return jsonResponse({ success: true, text, modelUsed: model });
    }

    return jsonResponse({ success: false, error: 'Unsupported action' }, 400);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
