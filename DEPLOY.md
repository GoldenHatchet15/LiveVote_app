# LiveVote — Production Deployment (Cloudflare Tunnel)

Public URL: **https://livevote.jrcodestudio.org**

## Architecture

```
            ┌─────────────── Cloudflare edge ───────────────┐
 Players    │  TLS termination · WAF · (optional) Access     │
 & host  ───┼──►  livevote.jrcodestudio.org                  │
 (any net)  └───────────────────────┬───────────────────────┘
                                     │  encrypted tunnel (outbound only)
                         ┌───────────┴────────────┐
                         │   Docker host (your PC) │
                         │  ┌────────────┐         │
                         │  │ cloudflared│──┐      │
                         │  └────────────┘  │ internal docker net
                         │  ┌────────────┐  │      │
                         │  │   app:3000 │◄─┘  (NO published port)
                         │  │  + SQLite  │  volume: livevote-data
                         │  └────────────┘         │
                         └─────────────────────────┘
```

- The app container **publishes no host port** — the only ingress is the tunnel.
- `cloudflared` makes an **outbound** connection to Cloudflare, so no inbound
  firewall rules / port-forwarding are needed.
- SQLite lives on the named volume `livevote-data` and survives rebuilds.

## Prerequisites

- Docker + Docker Compose on the host.
- The domain `jrcodestudio.org` already on your Cloudflare account.
- This repo checked out on the host.

## 1. Configure `.env`

```bash
cp .env.prod.example .env
```

Fill in `.env`:

| Variable | Value |
| --- | --- |
| `PUBLIC_BASE_URL` | `https://livevote.jrcodestudio.org` |
| `CORS_ORIGINS` | `https://livevote.jrcodestudio.org` |
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_PASSWORD_HASH` | `npm run hash-password -w server -- 'your-strong-password'` (paste the `scrypt$…`) |
| `TUNNEL_TOKEN` | from Cloudflare (step 2 below) |
| `DATA_RETENTION_DAYS` | `30` (or your policy) |

Leave `ADMIN_PASSWORD` blank when using the hash.

## Automated path — `./tunnel.sh` (recommended)

`tunnel.sh` does steps 1, 2 and "Run" below for you via the Cloudflare API:
generates the secrets/hash into `.env`, creates (or reuses) the tunnel, wires
`livevote.jrcodestudio.org` (ingress + DNS), writes `TUNNEL_TOKEN`, then builds
and starts the stack and verifies the public URL.

```bash
# 1) Create a Cloudflare API token (one time) at
#    https://dash.cloudflare.com/profile/api-tokens → Create Token → Custom:
#      • Account · Cloudflare Tunnel · Edit
#      • Zone    · DNS · Edit   (Zone Resources → jrcodestudio.org)
# 2) Run it (it will prompt for an admin password if none is set):
CF_API_TOKEN=<your-token> ./tunnel.sh
```

Re-running is safe (idempotent). After it finishes, do the optional Cloudflare
**Access** (step 3) and **zone settings** (step 4) below, then the verification
checklist. The manual dashboard steps follow if you prefer clicking.

## 2. Create the Cloudflare Tunnel (dashboard — manual alternative)

Cloudflare **Zero Trust → Networks → Tunnels → Create a tunnel**:

1. Choose **Cloudflared**, name it `livevote`, **Save**.
2. On "Install and run a connector", copy the **token** (the long string after
   `--token`). Put it in `.env` as `TUNNEL_TOKEN=…`. (Do **not** run the shown
   install command — our compose runs the connector.)
3. **Public Hostnames → Add a public hostname:**
   - Subdomain `livevote`, Domain `jrcodestudio.org`.
   - Service: **HTTP**, URL `app:3000` (the compose service name + port).
   - Save.

> WebSockets are on by default; nothing extra is needed. (If you ever add
> ingress rules manually, don't disable `noTLSVerify`/WebSocket for this host.)

## 3. (Recommended) Cloudflare Access on the admin surface

Protect the admin/presenter pages with a one-time-PIN to your email, **on top of**
the app password. **Confirm these path rules** (see "Public vs protected paths"):

- **Protect** (Access policy – your email): `/admin`, `/admin/*`, `/host`, `/host/*`,
  and the admin APIs `/api/sets*`, `/api/sessions*`, `/api/auth/*`.
- **Must stay PUBLIC** (no Access): `/`, `/play`, `/assets/*`, `/twemoji/*`,
  `/favicon*`, `/api/public/*`, and **`/socket.io/*`** (players' realtime — the app
  already enforces admin-only socket events via the signed cookie).

Zero Trust → **Access → Applications → Add → Self-hosted**, app domain
`livevote.jrcodestudio.org`, add a **path** `admin` (repeat for `host`,
`api/sets`, `api/sessions`, `api/auth`), policy **Allow → Emails → your email**,
one-time PIN. Leave the rest of the site unprotected.

## 4. Recommended Cloudflare zone settings

- **SSL/TLS → Overview:** Full (strict) is ideal; **Full** is fine for a tunnel.
- **SSL/TLS → Edge Certificates:** enable **Always Use HTTPS** and **Automatic
  HTTPS Rewrites**.
- **Security → WAF → Rate limiting rules:** add a rule on the join path, e.g.
  `http.request.uri.path contains "/api/public/session"` → 20 req/min per IP →
  Block/Challenge. (The app also rate-limits joins; this is defense in depth.)
- **Bot protection:** leave Bot Fight Mode **off** for this hostname (it can
  challenge students' phones). If you use Super Bot Fight Mode, allow
  "Definitely automated" challenges only, and verify a phone can still join.

## Public vs protected paths (why)

The SPA is one `index.html` for all client routes; Cloudflare Access matches by
URL path. Protecting `/admin*` and `/host*` stops the pages loading for
non-approved users, and protecting the admin APIs stops data access even if the
SPA shell is reached via client-side navigation. `/socket.io/*` is shared by
players and the host, so it must stay public — host-only socket events are
rejected server-side unless the request carries a valid admin session cookie.

## Run

```bash
docker compose -f docker-compose.prod.yml up -d --build   # start
docker compose -f docker-compose.prod.yml ps              # status
docker compose -f docker-compose.prod.yml logs -f app     # app logs
docker compose -f docker-compose.prod.yml logs -f cloudflared
docker compose -f docker-compose.prod.yml down            # stop
```

## Update to a new version (zero data loss)

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build   # rebuilds app, keeps volume
```

Migrations run automatically on start (`prisma migrate deploy`). The
`livevote-data` volume is untouched by rebuilds.

## Rotate the admin password / session secret

```bash
# New password hash:
npm run hash-password -w server -- 'new-strong-password'   # paste into .env ADMIN_PASSWORD_HASH
# New cookie secret (invalidates all existing admin sessions):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # into .env SESSION_SECRET
docker compose -f docker-compose.prod.yml up -d            # recreate app with new env
```

## Backup & restore

Daily backup (keep 7 days) via `scripts/backup-db.sh` — add to cron:

```bash
0 3 * * *  cd /path/to/livevote && ./scripts/backup-db.sh >> backups/backup.log 2>&1
```

**Restore:**

```bash
docker compose -f docker-compose.prod.yml stop app
gunzip -c backups/livevote-YYYYMMDD-HHMMSS.db.gz > /tmp/restore.db
docker compose -f docker-compose.prod.yml cp /tmp/restore.db app:/app/data/livevote.db
docker compose -f docker-compose.prod.yml start app
```

## If the host is a laptop

Keep it awake during sessions:

- **macOS:** `caffeinate -s` while running, or System Settings → Battery →
  Options → "Prevent automatic sleeping when the display is off" (plugged in).
- **Windows:** Settings → System → Power → Screen & sleep → Sleep = Never (plugged in).
- **Linux:** `systemd-inhibit --what=sleep docker compose … up` or disable sleep
  in your DE. Keep the laptop plugged in; Docker + the tunnel restart on boot
  (`restart: unless-stopped`), but the machine must be powered on.

## Verification checklist

- [ ] `https://livevote.jrcodestudio.org` loads with a valid cert; `http://` redirects.
- [ ] The app is **not** reachable at the host's LAN IP / `:3000` (no published port).
- [ ] Response headers include `content-security-policy`, `x-content-type-options`.
- [ ] Realtime uses **WebSocket**: DevTools → Network → WS shows a `websocket`
      connection to `/socket.io/` (status 101), not just `polling`.
- [ ] `/admin` and `/host` require auth; `/play` works from a phone on cellular.
- [ ] Production smoke test (below) passes; delete the test session afterwards.
- [ ] Reboot the host → `docker compose ps` shows app + cloudflared back `Up`.

### Production smoke test (Playwright against the live URL)

```bash
PLAYWRIGHT_BASE_URL=https://livevote.jrcodestudio.org \
  npx playwright test e2e/question-types.spec.ts
# then remove the test data: /admin → (session) or
# DELETE /api/sessions/<id>/data  (admin-authenticated)
```

> If `/admin` is behind Cloudflare Access, run the smoke test with a
> service-token/bypass, or temporarily scope Access to exclude the test run.

## Troubleshooting

- **Tunnel down / 1033 error:** `docker compose -f docker-compose.prod.yml logs
  cloudflared`. Check `TUNNEL_TOKEN` is correct and the connector shows
  "Registered tunnel connection". In the dashboard the tunnel should be **HEALTHY**.
- **502 Bad Gateway:** app not healthy. `logs app`; confirm the hostname points at
  `app:3000`; confirm `docker compose ps` shows app `healthy`.
- **WebSocket won't connect (stuck on polling):** ensure the public hostname
  service is `http://app:3000` (not https), and that no Cloudflare rule strips
  the `Upgrade` header. Socket.IO falls back to polling, so the app still works,
  but check the WS 101 as above.
- **Players rate-limited unexpectedly:** confirm `TRUST_PROXY=true` so per-IP
  limits key on `CF-Connecting-IP` (otherwise everyone shares the tunnel's IP).
- **401 loops on /admin:** the session cookie is `Secure` in prod — only works
  over HTTPS (the tunnel provides it). Don't test over plain `http://` to the host.
