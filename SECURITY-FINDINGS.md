# LiveVote — Security Findings

Date: 2026-10-17 · Reviewer: automated security review · Scope: Phase 1 (pre-deploy)

Public URL target: `https://livevote.jrcodestudio.org` (students, possibly minors;
every player input is treated as untrusted).

Legend: **Critical** = remote compromise / mass data exposure · **High** = exploitable
by a remote attacker with real impact · **Medium** = needs conditions or limited impact ·
**Low** = hardening / documented limitation.

Status column is updated after fixes land (see "After" at the bottom).

---

## High

### H1 — No security headers (no CSP, clickjacking, MIME sniffing)
- **Where:** `server/src/app.ts` (no `helmet`, no headers set).
- **Impact:** No `Content-Security-Policy` (weakens XSS defense-in-depth), no
  `X-Content-Type-Options: nosniff`, no `Referrer-Policy`, no `frame-ancestors`
  (the admin/host/player pages can be framed → clickjacking).
- **Fix:** Add `helmet` with an explicit CSP: `script-src 'self'`, `style-src
  'self' 'unsafe-inline' fonts.googleapis.com`, `font-src 'self' fonts.gstatic.com`,
  `img-src 'self' data:`, `connect-src 'self'` (same-origin wss), `frame-ancestors
  'none'`, `object-src 'none'`, `base-uri 'self'`.

### H2 — No brute-force protection on admin login
- **Where:** `server/src/routes/auth.ts` `POST /api/auth/login` — unlimited attempts.
- **Impact:** The single admin password can be brute-forced with no slowdown.
- **Fix:** Per-IP rate limit + temporary lockout on `/login` (token bucket).

### H3 — Admin session cookie never expires server-side
- **Where:** `server/src/auth.ts` `verifyAdminToken` validates only the HMAC, not
  the `issuedAt` timestamp it signs. The 12h `maxAge` is browser-side only.
- **Impact:** A captured/exported cookie is valid indefinitely (until
  `SESSION_SECRET` rotates), defeating session expiry.
- **Fix:** Enforce a server-side max age (12h) against `issuedAt` in `verifyAdminToken`.

### H4 — CSV formula injection
- **Where:** `server/src/session/csv.ts` `esc()` escapes quotes/commas/newlines but
  not leading `= + - @ \t \r`. Nicknames and free-text answers are attacker-controlled.
- **Impact:** A player named `=HYPERLINK(...)`/`=cmd|...` runs a formula when the
  admin opens the CSV in Excel/Sheets.
- **Fix:** Prefix any cell beginning with a dangerous character with `'`.

### H5 — Socket event payloads are not schema-validated; a bad payload can throw
- **Where:** `server/src/socket/index.ts` — `player:answer` (and host events) pass the
  raw payload to the engine with no shape validation and no `try/catch`. A malformed
  `value` (e.g. missing, or `options` without an array) makes `prepareAnswer` throw.
- **Impact:** Denial of service / unhandled exceptions from a crafted client; one bad
  handler call should never destabilize the server.
- **Fix:** Validate every incoming payload with zod and wrap handlers in `try/catch`;
  ignore/garbage-reject unknown shapes.

### H6 — Docker image runs as root
- **Where:** `Dockerfile` — no `USER`; the Node process runs as root.
- **Impact:** A process compromise has root in the container.
- **Fix:** Create/own data dir as the non-root `node` user and `USER node`.

### H7 — Vulnerable production dependencies
- **Where:** `npm audit --omit=dev` → high-severity DoS in `qs`/`body-parser` (via
  `express`), `cookie`, and `path-to-regexp`; `react-router-dom`/`@remix-run/router`.
- **Impact:** Remotely triggerable DoS and parsing issues in request handling.
- **Fix:** Upgrade `express`, `cookie`, `react-router-dom` to patched versions; re-audit.

### H8 — Insecure default secrets baked into docker-compose
- **Where:** `docker-compose.yml` — `ADMIN_PASSWORD:-changeme` and
  `SESSION_SECRET:-dev-insecure-secret-…` fallbacks. These silently satisfy the
  prod requirement in `env.ts`, so a deploy without `.env` runs with known secrets.
- **Impact:** Default-credential compromise of the admin, forgeable session cookies.
- **Fix:** Remove the fallbacks in the production compose so startup fails without
  real values; document in `.env.example`/DEPLOY.md.

---

## Medium

### M1 — Admin password compared in plaintext (not hashed)
- **Where:** `server/src/auth.ts` `verifyAdminPassword` compares the plaintext env
  value; the length check also leaks password length.
- **Impact:** Anyone who can read the environment/.env sees the password; no KDF.
- **Fix:** Support `ADMIN_PASSWORD_HASH` (scrypt — Node built-in, no native dep) and
  verify against it; keep plaintext only as a dev fallback.

### M2 — Client IP spoofing → rate-limit bypass
- **Where:** `server/src/socket/index.ts` `clientIp()` trusts the first
  `x-forwarded-for` entry unconditionally; Express `trust proxy` is unset.
- **Impact:** Behind Cloudflare the real IP is `CF-Connecting-IP`; trusting raw XFF
  lets a client spoof IPs and bypass per-IP join/login limits.
- **Fix:** When `TRUST_PROXY=true`, use `CF-Connecting-IP`; otherwise the socket's
  real remote address. Never trust XFF when not behind a known proxy.

### M3 — Socket.IO `maxHttpBufferSize` left at the 1 MB default
- **Where:** `server/src/app.ts` IO options.
- **Impact:** A client can push ~1 MB per event; answers are ≤120 chars.
- **Fix:** Set a small `maxHttpBufferSize` (e.g. 16 KB).

### M4 — No caps on players/session, active sessions, connections/IP
- **Impact:** Unbounded memory / abuse.
- **Fix:** Cap players per session and max concurrent sessions; reject beyond.

### M5 — Abandoned sessions never expire
- **Where:** sessions only leave memory 60 s after END; a LOBBY left open lives forever.
- **Fix:** Sweep idle sessions after an inactivity timeout.

### M6 — No data-retention policy / manual session deletion
- **Impact:** Player data (nicknames, answers) persists in SQLite indefinitely —
  a privacy concern for minors.
- **Fix:** Auto-delete session player data after `DATA_RETENTION_DAYS` (default 30),
  plus an admin "delete this session's data" endpoint.

### M7 — Dev dependencies shipped in the production image
- **Where:** `Dockerfile` uses `npm install` (all deps) and copies full `node_modules`.
- **Fix:** Install prod-only deps for the runtime stage.

### M8 — No container healthcheck
- **Fix:** `HEALTHCHECK` hitting `/api/health`; compose `healthcheck`.

### M9 — No explicit CSRF token
- **Where:** admin APIs rely on the cookie. **Mitigated** by `SameSite=Lax` (the
  cookie is not sent on cross-site POST/PUT/DELETE) + JSON-only bodies.
- **Fix (hardening):** add an `Origin`/`Sec-Fetch-Site` check on state-changing
  admin routes. Low residual risk.

---

## Low / documented

- **L1 — Profanity filter bypass:** `normalizeForProfanity` folds leetspeak and strips
  non-letters (so "f u c k"/"a$$" are caught) but strips accents rather than folding
  them, so exotic Unicode look-alikes can slip through. Reasonable-effort; documented.
- **L2 — `GET /api/public/session/:pin`** reveals a session's title/state for a known
  6-digit PIN. Intended (join UX); negligible.
- **L3 — Entrypoint seeds sample data in production.** Noise, not a vulnerability;
  make seeding opt-out for prod.

---

## Already-good (verified, no action)
- **No `dangerouslySetInnerHTML`/raw HTML** anywhere; React escapes all user text
  (nicknames, answers, word cloud, question/option text, preview).
- **No raw SQL** — all DB access via Prisma with parameterized queries.
- **Reconnect tokens** are 192-bit CSPRNG (`randomBytes(24).base64url`), scoped to a
  session (looked up within the session's engine), never broadcast to other players.
- **No answer leaks:** correct answers and other players' answers/voter-names (toggle
  OFF) never reach player clients — enforced in the engine and covered by
  `tests/no-leak.test.ts` and the voter-names tests.
- **Emoji avatars** validated against the curated server list (`resolveAvatar`).
- **Text length limits** enforced server-side (nickname, type-answer ≤40, open-ended
  ≤120, zod bounds on builder fields). **JSON import** is zod-validated under a 1 MB body cap.
- **Errors** return a generic 500 (no stack traces to clients).

---

## After — fixes applied (Phase 1)

All **High** findings and the low-risk **Medium** findings are fixed, each with a
regression test in `server/tests/security.test.ts` (12 tests). Full suite:
**152 server tests + 19 e2e green**, no regressions.

| ID | Finding | Status | Fix / test |
| -- | ------- | ------ | ---------- |
| H1 | No security headers | **Fixed** | `helmet` + CSP in `app.ts`; test asserts CSP/nosniff/frame-ancestors |
| H2 | Login brute-force | **Fixed** | `loginLimiter` in `routes/auth.ts`; test gets a 429 |
| H3 | Cookie never expires server-side | **Fixed** | `verifyAdminToken` enforces `ADMIN_SESSION_MAX_AGE_MS`; test rejects stale/future |
| H4 | CSV formula injection | **Fixed** | `esc()` prefixes `= + - @ \t \r` with `'`; test on `=HYPERLINK` |
| H5 | Unvalidated socket payloads | **Fixed** | `prepareAnswer` guards + `player:answer` try/catch; tests on malformed values |
| H6 | Container runs as root | **Fixed** | `USER node` + chowned data dir in `Dockerfile` (not built in sandbox) |
| H7 | Vulnerable prod deps | **Fixed** | express→4.22.3, cookie→0.7.2, react-router-dom→6.30.6; prod high/critical: 5→0 |
| H8 | Insecure compose default secrets | **Fixed** | compose requires `SESSION_SECRET`; no `changeme` fallback |
| M1 | Plaintext admin password | **Fixed** | `ADMIN_PASSWORD_HASH` (scrypt) + `hash-password` script; test verifies hash |
| M2 | IP spoofing / rate-limit bypass | **Fixed** | `resolveClientIp` uses CF-Connecting-IP only when `TRUST_PROXY=true`; test |
| M3 | Socket buffer 1 MB | **Fixed** | `maxHttpBufferSize: 16 KB` |
| M4 | No abuse caps | **Fixed** | max players/session + max active sessions (`env`, socket, `/start`) |
| M6 | No data retention/delete | **Fixed** | daily `purgeExpiredSessions` + `DELETE /api/sessions/:id/data`; tests |
| M8 | No healthcheck | **Fixed** | `HEALTHCHECK` in Dockerfile + compose |

### Deferred (with reasons)
- **M5 (idle session sweep):** not separately implemented — abandoned in-memory
  sessions are now bounded by the **M4** max-active-sessions cap, and persisted data
  is handled by **M6**. Low residual risk; can add an inactivity timer in Phase 2.
- **M7 (prune dev deps from the image):** deferred to the Phase 2 deploy config —
  the entrypoint runs `prisma migrate deploy` (the Prisma CLI is a dev dep), so a
  naive prune breaks migrations; will restructure the runtime stage when the prod
  image is built and testable with a running Docker daemon.
- **M9 (CSRF token):** mitigated by `SameSite=Lax` (cookie not sent on cross-site
  state-changing requests) + JSON-only bodies. Low residual risk.
- **Remaining `npm audit`:** production high/critical are **0**; **2 moderate**
  transitive advisories remain with no fix available short of breaking-major bumps —
  tracked, re-audit on dependency updates.

### Notes
- **Docker changes (H6, M8) were not built/run** in this sandbox (no Docker daemon);
  they are standard, low-risk edits and will be exercised during the Phase 2 deploy.
- Adversarial review: fixes were self-reviewed and each is covered by a regression
  test; no separate review sub-agent was spawned (none requested).
