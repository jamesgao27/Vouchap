import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function parseAllowedOrigins(): string[] | null {
  const raw = Deno.env.get('GEMINI_PROXY_ALLOWED_ORIGINS')?.trim();
  if (!raw) return null;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeadersForRequest(req: Request): Record<string, string> {
  const allowed = parseAllowedOrigins();
  const origin = req.headers.get('Origin') || '';
  const allowOrigin =
    allowed == null || allowed.length === 0
      ? '*'
      : !origin
        ? '*'
        : allowed.includes(origin)
          ? origin
          : 'null';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

const DEFAULT_MODEL = Deno.env.get('GEMINI_MODEL_DEFAULT') || 'gemini-1.5-flash';
const ENFORCE_SERVER_MODEL = Deno.env.get('GEMINI_ENFORCE_SERVER_MODEL') === 'true';

function jsonResponse(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeadersForRequest(req), 'Content-Type': 'application/json' },
  });
}

async function requireAuthenticatedUser(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse(req, { success: false, error: 'Unauthorized' }, 401);
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    return jsonResponse(req, { success: false, error: 'Server misconfigured.' }, 503);
  }
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.id) {
    return jsonResponse(req, { success: false, error: 'Unauthorized' }, 401);
  }
  return { userId: user.id };
}

Deno.serve(async (req) => {
  const cors = corsHeadersForRequest(req);
  const allowed = parseAllowedOrigins();
  const origin = req.headers.get('Origin') || '';
  if (allowed && allowed.length > 0 && origin && !allowed.includes(origin)) {
    return jsonResponse(req, { success: false, error: 'Forbidden origin' }, 403);
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth instanceof Response) return auth;

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return jsonResponse(req, { success: false, error: 'GEMINI_API_KEY is missing on server.' }, 503);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();
    const clientModel = String(body?.model || '').trim();
    const model = ENFORCE_SERVER_MODEL ? DEFAULT_MODEL : (clientModel || DEFAULT_MODEL);
    const genAI = new GoogleGenerativeAI(apiKey);

    if (action === 'listModels') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
      if (!response.ok) {
        return jsonResponse(
          req,
          { success: false, error: `listModels failed: ${response.status}` },
          400,
        );
      }
      const data = await response.json();
      return jsonResponse(req, { success: true, models: data?.models || [] });
    }

    if (action === 'generateContent') {
      const contents = Array.isArray(body?.contents) ? body.contents : [];
      if (contents.length === 0) {
        return jsonResponse(req, { success: false, error: 'contents is required' }, 400);
      }
      const result = await genAI.getGenerativeModel({ model }).generateContent(contents);
      const text = result?.response?.text?.();
      if (!text) {
        return jsonResponse(req, { success: false, error: 'Gemini returned empty text' }, 502);
      }
      return jsonResponse(req, { success: true, text, modelUsed: model });
    }

    return jsonResponse(req, { success: false, error: 'Unsupported action' }, 400);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return jsonResponse(req, { success: false, error: msg }, 500);
  }
});
