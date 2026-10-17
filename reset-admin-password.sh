#!/usr/bin/env bash
#
# reset-admin-password.sh — set a NEW LiveVote admin password.
# Prompts (hidden), regenerates the scrypt ADMIN_PASSWORD_HASH in .env, clears any
# plaintext ADMIN_PASSWORD, and restarts the app if the prod stack is running.
#
# Usage:  ./reset-admin-password.sh            (prompts)
#         ADMIN_PASSWORD='new-pw' ./reset-admin-password.sh   (non-interactive)
set -euo pipefail
cd "$(dirname "$0")"
ENV_FILE=".env"

command -v node >/dev/null || { echo "node is required" >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo ".env not found — run ./tunnel.sh first" >&2; exit 1; }

pw="${ADMIN_PASSWORD:-}"
if [ -z "$pw" ]; then
  printf 'New admin password (hidden): '; read -rs pw; printf '\n'
  printf 'Confirm: '; read -rs pw2; printf '\n'
  [ "$pw" = "$pw2" ] || { echo "passwords did not match" >&2; exit 1; }
fi
[ -n "$pw" ] || { echo "password cannot be empty" >&2; exit 1; }
[ "${#pw}" -ge 8 ] || echo "note: consider a longer password (>= 12 chars)"

HASH="$(node server/scripts/hash-password.mjs "$pw")"
unset pw pw2 2>/dev/null || true

# Update .env: set the hash, clear plaintext ADMIN_PASSWORD.
node -e '
  const fs=require("fs");const [f,hash]=process.argv.slice(1);
  let s=fs.readFileSync(f,"utf8");
  const set=(k,v)=>{const re=new RegExp("^"+k+"=.*$","m");s=re.test(s)?s.replace(re,k+"="+v):(s+(s&&!s.endsWith("\n")?"\n":"")+k+"="+v+"\n");};
  set("ADMIN_PASSWORD_HASH",hash); set("ADMIN_PASSWORD","");
  fs.writeFileSync(f,s);
' "$ENV_FILE" "$HASH"
echo "✓ ADMIN_PASSWORD_HASH updated in .env"

# Resolve compose (v2 plugin or v1 standalone) and apply if the stack is up.
COMPOSE=""
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose -f docker-compose.prod.yml";
elif command -v docker-compose >/dev/null 2>&1; then COMPOSE="docker-compose -f docker-compose.prod.yml"; fi

if [ -n "$COMPOSE" ] && $COMPOSE ps --services --filter status=running 2>/dev/null | grep -q '^app$'; then
  echo "Applying to the running app…"
  $COMPOSE up -d app
  echo "✓ admin password reset and applied. Old sessions remain valid until they expire;"
  echo "  to log everyone out now, also rotate SESSION_SECRET (see DEPLOY.md)."
else
  echo "✓ saved. The new password takes effect next time you start the stack:"
  echo "  $([ -n "$COMPOSE" ] && echo "$COMPOSE up -d" || echo "docker compose -f docker-compose.prod.yml up -d")"
fi
