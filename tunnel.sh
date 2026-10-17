#!/usr/bin/env bash
#
# tunnel.sh — create the Cloudflare Tunnel and fully deploy LiveVote.
#
# What it does, idempotently:
#   1. Ensures .env has SESSION_SECRET + an admin password hash + public URL.
#   2. Creates (or reuses) a remotely-managed Cloudflare Tunnel via the API.
#   3. Points livevote.jrcodestudio.org at the app over the tunnel (ingress + DNS).
#   4. Writes TUNNEL_TOKEN into .env.
#   5. Builds and starts the production stack (app + cloudflared), with NO host port.
#   6. Waits for health and verifies the public URL.
#
# You need ONE thing first: a Cloudflare API token (see STEP 0). Everything else
# is automated. (Prefer the dashboard? DEPLOY.md has the manual click-by-click.)
#
# Usage:
#   CF_API_TOKEN=xxxxx ./tunnel.sh
#   # optional overrides: DOMAIN, SUBDOMAIN, TUNNEL_NAME, ADMIN_PASSWORD
set -euo pipefail
cd "$(dirname "$0")"

# ---------------------------------------------------------------- config
DOMAIN="${DOMAIN:-jrcodestudio.org}"
SUBDOMAIN="${SUBDOMAIN:-livevote}"
HOSTNAME_FQDN="${SUBDOMAIN}.${DOMAIN}"
TUNNEL_NAME="${TUNNEL_NAME:-livevote}"
APP_SERVICE="http://app:3000"
COMPOSE=()   # resolved in STEP 0 (docker compose v2, or docker-compose v1)
ENV_FILE=".env"
API="https://api.cloudflare.com/client/v4"

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# Read JSON on stdin, print the JS expression over `o`. e.g. pluck 'o.result[0].id'
pluck() {
  node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const o=JSON.parse(d);const v=(new Function("o","return ("+process.argv[1]+")"))(o);process.stdout.write(v==null?"":String(v))}catch(e){process.exit(3)}})' "$1"
}
set_env() { # set_env KEY VALUE  (update-or-append in .env)
  node -e 'const fs=require("fs");const[f,k,v]=process.argv.slice(1);let s=fs.existsSync(f)?fs.readFileSync(f,"utf8"):"";const re=new RegExp("^"+k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"=.*$","m");s=re.test(s)?s.replace(re,k+"="+v):(s+(s&&!s.endsWith("\n")?"\n":"")+k+"="+v+"\n");fs.writeFileSync(f,s)' "$ENV_FILE" "$1" "$2"
}
get_env() { [ -f "$ENV_FILE" ] && sed -n "s/^$1=//p" "$ENV_FILE" | head -1 || true; }

# Cloudflare API GET/POST/PUT with success check. Usage: cf METHOD PATH [JSON_BODY]
cf() {
  local method="$1" path="$2" body="${3:-}" resp
  if [ -n "$body" ]; then
    resp="$(curl -s -X "$method" "$API$path" -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" --data "$body")"
  else
    resp="$(curl -s -X "$method" "$API$path" -H "Authorization: Bearer $CF_API_TOKEN")"
  fi
  if [ "$(printf '%s' "$resp" | pluck 'o.success')" != "true" ]; then
    printf '%s\n' "$resp" >&2
    die "Cloudflare API call failed: $method $path"
  fi
  printf '%s' "$resp"
}

# ---------------------------------------------------------------- STEP 0
bold "STEP 0 — Preflight"
command -v node >/dev/null   || die "node is required"
command -v curl >/dev/null   || die "curl is required"
command -v docker >/dev/null || die "Docker is not installed. See: https://docs.docker.com/engine/install/ubuntu/"

# Resolve Docker Compose: v2 plugin ('docker compose') preferred, v1 fallback.
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose -f docker-compose.prod.yml)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose -f docker-compose.prod.yml)
else
  die "Docker Compose v2 not found. Install the plugin:
       sudo apt-get update && sudo apt-get install -y docker-compose-plugin
     then verify:  docker compose version"
fi

# Daemon reachable (and usable without sudo)?
if ! docker info >/dev/null 2>&1; then
  die "Can't talk to the Docker daemon. Likely one of:
       • daemon not running →  sudo systemctl enable --now docker
       • your user not in the docker group →  sudo usermod -aG docker \$USER   (then log out/in, or: newgrp docker)
     Verify with:  docker info"
fi
ok "docker ($(printf '%s ' "${COMPOSE[@]:0:1}")compose), node, curl present"

if [ -z "${CF_API_TOKEN:-}" ]; then
  cat <<'EOF'

  I need a Cloudflare API token. Create one at:
    https://dash.cloudflare.com/profile/api-tokens  →  Create Token  →  Custom token
  Permissions:
    • Account · Cloudflare Tunnel · Edit
    • Zone    · DNS · Edit          (Zone Resources → jrcodestudio.org)
  Then re-run:  CF_API_TOKEN=<token> ./tunnel.sh
EOF
  die "CF_API_TOKEN not set"
fi
ok "Cloudflare API token provided"

[ -f "$ENV_FILE" ] || { cp .env.prod.example "$ENV_FILE"; ok "created .env from .env.prod.example"; }

# ---------------------------------------------------------------- STEP 1
bold "STEP 1 — Secrets & URLs in .env"
set_env PUBLIC_BASE_URL "https://$HOSTNAME_FQDN"
set_env CORS_ORIGINS    "https://$HOSTNAME_FQDN"
ok "PUBLIC_BASE_URL / CORS_ORIGINS → https://$HOSTNAME_FQDN"

if [ -z "$(get_env SESSION_SECRET)" ]; then
  set_env SESSION_SECRET "$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
  ok "generated SESSION_SECRET"
else ok "SESSION_SECRET already set"; fi

if [ -z "$(get_env ADMIN_PASSWORD_HASH)" ]; then
  pw="${ADMIN_PASSWORD:-}"
  if [ -z "$pw" ]; then
    printf '  Enter a strong ADMIN password (input hidden): '; read -rs pw; printf '\n'
    [ -n "$pw" ] || die "admin password cannot be empty"
  fi
  set_env ADMIN_PASSWORD_HASH "$(node server/scripts/hash-password.mjs "$pw")"
  set_env ADMIN_PASSWORD ""
  ok "generated ADMIN_PASSWORD_HASH (scrypt)"
else ok "ADMIN_PASSWORD_HASH already set"; fi

# ---------------------------------------------------------------- STEP 2
bold "STEP 2 — Resolve Cloudflare account & zone"
# Derive both the zone id and the account id from the zone lookup — this needs
# only the Zone·DNS permission, avoiding a separate /accounts list call.
ZONE_JSON="$(cf GET "/zones?name=$DOMAIN")"
ZONE_ID="$(printf '%s' "$ZONE_JSON" | pluck 'o.result[0] ? o.result[0].id : ""')"
ACCOUNT_ID="$(printf '%s' "$ZONE_JSON" | pluck 'o.result[0] ? o.result[0].account.id : ""')"
[ -n "$ZONE_ID" ] || die "zone '$DOMAIN' not found for this token. Ensure the token has Zone·DNS·Edit scoped to $DOMAIN."
[ -n "$ACCOUNT_ID" ] || die "could not read the account id from the zone."
ok "zone $DOMAIN: $ZONE_ID"
ok "account: $ACCOUNT_ID"

# ---------------------------------------------------------------- STEP 3
bold "STEP 3 — Create or reuse the tunnel '$TUNNEL_NAME'"
TUNNEL_ID="$(cf GET "/accounts/$ACCOUNT_ID/cfd_tunnel?name=$TUNNEL_NAME&is_deleted=false" | pluck 'o.result[0] ? o.result[0].id : ""')"
if [ -z "$TUNNEL_ID" ]; then
  TUNNEL_ID="$(cf POST "/accounts/$ACCOUNT_ID/cfd_tunnel" "{\"name\":\"$TUNNEL_NAME\",\"config_src\":\"cloudflare\"}" | pluck 'o.result.id')"
  ok "created tunnel: $TUNNEL_ID"
else ok "reusing tunnel: $TUNNEL_ID"; fi

# ---------------------------------------------------------------- STEP 4
bold "STEP 4 — Fetch tunnel token → .env"
TOKEN="$(cf GET "/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/token" | pluck 'o.result')"
[ -n "$TOKEN" ] || die "could not fetch tunnel token"
set_env TUNNEL_TOKEN "$TOKEN"
ok "TUNNEL_TOKEN written"

# ---------------------------------------------------------------- STEP 5
bold "STEP 5 — Route $HOSTNAME_FQDN → $APP_SERVICE (tunnel ingress)"
cf PUT "/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
  "{\"config\":{\"ingress\":[{\"hostname\":\"$HOSTNAME_FQDN\",\"service\":\"$APP_SERVICE\"},{\"service\":\"http_status:404\"}]}}" >/dev/null
ok "ingress set"

# ---------------------------------------------------------------- STEP 6
bold "STEP 6 — DNS CNAME $HOSTNAME_FQDN → tunnel (proxied)"
CNAME_CONTENT="$TUNNEL_ID.cfargotunnel.com"
REC_ID="$(cf GET "/zones/$ZONE_ID/dns_records?type=CNAME&name=$HOSTNAME_FQDN" | pluck 'o.result[0] ? o.result[0].id : ""')"
DNS_BODY="{\"type\":\"CNAME\",\"name\":\"$HOSTNAME_FQDN\",\"content\":\"$CNAME_CONTENT\",\"proxied\":true,\"ttl\":1}"
if [ -z "$REC_ID" ]; then
  cf POST "/zones/$ZONE_ID/dns_records" "$DNS_BODY" >/dev/null; ok "created CNAME → $CNAME_CONTENT"
else
  cf PUT "/zones/$ZONE_ID/dns_records/$REC_ID" "$DNS_BODY" >/dev/null; ok "updated CNAME → $CNAME_CONTENT"
fi

# ---------------------------------------------------------------- STEP 7
bold "STEP 7 — Build & start the stack"
"${COMPOSE[@]}" up -d --build
ok "docker compose up (app + cloudflared)"

# ---------------------------------------------------------------- STEP 8
bold "STEP 8 — Wait for health"
for i in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    ok "app healthy"; break
  fi
  [ "$i" = 30 ] && die "app did not become healthy — check: ${COMPOSE[*]} logs app"
  sleep 2
done

bold "STEP 9 — Verify the public URL"
printf '  waiting for the edge to serve https://%s …\n' "$HOSTNAME_FQDN"
for i in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "https://$HOSTNAME_FQDN/api/health" || true)"
  if [ "$code" = "200" ]; then ok "https://$HOSTNAME_FQDN/api/health → 200"; break; fi
  [ "$i" = 30 ] && printf '  (not 200 yet — DNS/tunnel can take a minute; check %s/api/health)\n' "$HOSTNAME_FQDN"
  sleep 3
done

bold "Done ✅  LiveVote is live at https://$HOSTNAME_FQDN"
cat <<EOF

Next (optional but recommended — see DEPLOY.md):
  • Cloudflare Access on /admin*, /host*, /api/sets*, /api/sessions*, /api/auth*
    (keep /, /play, /assets/*, /twemoji/*, /api/public/*, /socket.io/* PUBLIC).
  • Zone: Always Use HTTPS; a WAF rate-limit rule on /api/public/session.
  • Backups:  add to cron →  0 3 * * *  cd $(pwd) && ./scripts/backup-db.sh
Operate:
  ${COMPOSE[*]} ps | logs -f app | logs -f cloudflared | down
EOF
