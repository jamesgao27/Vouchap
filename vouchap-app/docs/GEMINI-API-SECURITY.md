# Gemini API security (Vouchap)

## Architecture

| Layer | Responsibility |
|-------|----------------|
| **Mobile / Web app** | Calls Supabase Edge Function `gemini-proxy` with the user JWT. No Google API key in the bundle. |
| **`gemini-proxy`** | Holds `GEMINI_API_KEY` (Supabase secret). Validates session via `auth.getUser()`. Forwards `generateContent` / `listModels`. |
| **Google Cloud** | Restrict key by API + IP/app as needed; rotate on leak. |

Client placeholder: `app.config.js` → `extra.geminiApiKey = 'server-side-gemini-proxy'` (not a real key).

## Configure secrets (server only)

```bash
cd vouchap-app
supabase secrets set GEMINI_API_KEY=your_key_here
supabase functions deploy gemini-proxy
```

Optional function env:

- `GEMINI_PROXY_ALLOWED_ORIGINS` — comma-separated web Origins (e.g. production web URL). Omit for mobile (`*` when no Origin).
- `GEMINI_MODEL_DEFAULT` / `GEMINI_ENFORCE_SERVER_MODEL` — server-side model policy.

## Do not

- Put `EXPO_PUBLIC_GEMINI_API_KEY` in EAS, `.env`, or source.
- Commit keys matching `AIza…` (pre-commit hook blocks staged leaks).
- Log full API keys in app or Edge logs.

## Optional local smoke test (not used by the app)

From repo root, with a **local-only** env var (never commit):

```bash
GEMINI_API_KEY=... node test-gemini-api-simple.js
```

## Ops checklist

- [ ] `GEMINI_API_KEY` only in Supabase secrets
- [ ] Remove obsolete `EXPO_PUBLIC_GEMINI_API_KEY` from EAS if present
- [ ] GCP: API restrictions + usage alerts
- [ ] Web production: set `GEMINI_PROXY_ALLOWED_ORIGINS`
- [ ] Rotate key if ever exposed in git or docs
