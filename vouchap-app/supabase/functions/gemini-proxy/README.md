# gemini-proxy

Server-side Gemini `generateContent` / `listModels`. Real API key only in Function secrets (`GEMINI_API_KEY`).

## Security

- **`verify_jwt = true`** (see `supabase/config.toml`): callers must use a valid Supabase session JWT.
- Function **re-validates** the user via `auth.getUser()` using `Authorization` + `SUPABASE_ANON_KEY`.
- Optional **`GEMINI_PROXY_ALLOWED_ORIGINS`**: comma-separated browser Origins (e.g. `https://app.example.com,https://example.com`). If set, requests with an `Origin` header not in the list get **403**. Omitted or empty keeps `*` (mobile clients often send no `Origin`).

## Deploy

```bash
cd vouchap-app
supabase functions deploy gemini-proxy
```
