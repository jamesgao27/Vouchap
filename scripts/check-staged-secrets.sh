#!/usr/bin/env bash
# Blocks committing Google API keys (AIza...) and common Gemini env lines in staged files.
set -euo pipefail

root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$root"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

staged="$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)"
if [ -z "$staged" ]; then
  exit 0
fi

fail=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -f "$f" ] || continue
  # Skip this hook script and gitleaks allowlist examples
  case "$f" in
    scripts/check-staged-secrets.sh|.gitleaks.toml) continue ;;
  esac
  if git diff --cached -- "$f" | grep -qE 'AIza[0-9A-Za-z_-]{20,}'; then
    echo "error: possible Google API key in staged diff: $f" >&2
    fail=1
  fi
  if git diff --cached -- "$f" | grep -qE '^\+.*EXPO_PUBLIC_GEMINI_API_KEY\s*='; then
    echo "error: do not commit EXPO_PUBLIC_GEMINI_API_KEY (use Supabase gemini-proxy): $f" >&2
    fail=1
  fi
done <<< "$staged"

if [ "$fail" -ne 0 ]; then
  echo "hint: store GEMINI_API_KEY in Supabase only — see vouchap-app/docs/GEMINI-API-SECURITY.md" >&2
  exit 1
fi

exit 0
