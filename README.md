# LiveVote

A Kahoot-style live polling and quiz app for the classroom. Create question
sets, project a presenter screen with a game PIN, and let the room join from
their phones — no accounts, no app install. Built to stay reliable with
**30–100 simultaneous players**.

- **Poll mode** — gather opinions, see a live bar chart. No scoring.
- **Quiz mode** — compete for points with a speed-based scoring formula,
  streak bonuses, a between-question leaderboard, and a final podium.

The server is the single source of truth for session state, timers and scoring.
Clients only render state and send actions, and **correct answers are never sent
to a player's phone before the reveal**.

---

## Quickstart (under 10 minutes)

You need **Node.js 20+** (and optionally Docker). From a fresh clone:

```bash
# 1. Install dependencies for all workspaces
npm install

# 2. Create your env file and set an admin password
cp .env.example server/.env
#   then edit server/.env — at minimum set ADMIN_PASSWORD and SESSION_SECRET

# 3. Create the database and load the sample question sets
npm run db:migrate   # applies the schema
npm run db:seed      # adds one sample QUIZ set and one POLL set

# 4. Run everything (server on :3000, client dev server on :5173)
npm run dev
```

Now:

1. Open **http://localhost:5173/admin** and log in with your `ADMIN_PASSWORD`.
2. Pick a set and click **Start session** — you land on the presenter screen with a PIN and QR code.
3. On your phone (or another tab) open **http://localhost:5173/play**, enter the PIN and a nickname.
4. Press **Start** on the presenter screen and play.

> In development the client runs on **:5173** and proxies API + websocket
> traffic to the server on **:3000**. In production the server serves the built
> client directly on **:3000** (one origin, one port).

### Or run the whole stack with Docker

```bash
cp .env.example .env            # optional; compose has sane defaults
# edit ADMIN_PASSWORD / SESSION_SECRET / PUBLIC_BASE_URL in .env or your shell
docker compose up --build
```

This builds the app, runs migrations, seeds the sample sets, and serves
everything on **http://localhost:3000**. The SQLite database lives on a named
volume (`livevote-data`) so it survives restarts. Verify the seed data:

```bash
curl -s http://localhost:3000/api/public/config
# log in to see sets:
curl -s -c /tmp/cj -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' -d '{"password":"changeme"}'
curl -s -b /tmp/cj http://localhost:3000/api/sets | head
```

---

## Playing with a real class (laptop + phones on the same Wi-Fi)

Phones can't reach `localhost` on your laptop — they need your laptop's LAN IP.

1. Find your laptop's LAN IP (e.g. `192.168.1.42`):
   - macOS: `ipconfig getifaddr en0`
   - Linux: `hostname -I | awk '{print $1}'`
   - Windows: `ipconfig` → IPv4 Address
2. Set the public base URL and allowed origins in `server/.env`:
   ```ini
   PUBLIC_BASE_URL=http://192.168.1.42:3000
   CORS_ORIGINS=http://192.168.1.42:3000,http://localhost:5173
   ```
3. Build and run in production mode so everything is on one port:
   ```bash
   npm run build
   npm start         # serves client + API + sockets on :3000
   ```
4. Project **http://192.168.1.42:3000/host/...** (opened from the admin screen),
   and students open **http://192.168.1.42:3000/play** — or just scan the QR
   code on the presenter screen, which pre-fills the PIN.

Make sure your firewall allows inbound connections on port 3000, and that your
network isn't using "client isolation" (common on guest Wi-Fi), which blocks
phone↔laptop traffic.

---

## Deployment — laptop + Cloudflare Tunnel (recommended)

Cloudflare Tunnel gives your laptop a public HTTPS URL without opening ports or
configuring your router. Great for "run a quiz from my laptop, students join
from anywhere."

1. **Install cloudflared** — see
   <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>
   (`brew install cloudflared`, `winget install cloudflare.cloudflared`, or the
   Linux package).

2. **Run LiveVote in production** on port 3000:
   ```bash
   npm run build
   PUBLIC_BASE_URL=https://<your-tunnel-url> \
   CORS_ORIGINS=https://<your-tunnel-url> \
   npm start
   ```
   (You'll fill in the tunnel URL after the next step, then restart — or use a
   named tunnel with a stable hostname so the URL never changes.)

3. **Quick tunnel (ephemeral URL)** — in a second terminal:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
   It prints a URL like `https://random-words.trycloudflare.com`. Set
   `PUBLIC_BASE_URL` and `CORS_ORIGINS` to that URL and restart `npm start` so
   the QR code and join links point at the tunnel.

4. **Named tunnel (stable URL, for repeat use)**:
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create livevote
   # Map a hostname you control to the tunnel:
   cloudflared tunnel route dns livevote livevote.example.com
   # ~/.cloudflared/config.yml:
   #   tunnel: <TUNNEL_ID>
   #   credentials-file: /home/you/.cloudflared/<TUNNEL_ID>.json
   #   ingress:
   #     - hostname: livevote.example.com
   #       service: http://localhost:3000
   #     - service: http_status:404
   cloudflared tunnel run livevote
   ```
   Then set `PUBLIC_BASE_URL=https://livevote.example.com` (and the matching
   `CORS_ORIGINS`) and run `npm start`.

Because Socket.IO works over standard WebSockets/HTTP, Cloudflare Tunnel proxies
the realtime traffic with no extra configuration.

> **Other targets.** The app is a single Node process serving static files + an
> API + Socket.IO, with SQLite on disk — so it also runs on a VPS (behind nginx)
> or a host like Render. Point `DATABASE_URL` at a persistent path, set
> `PUBLIC_BASE_URL`/`CORS_ORIGINS` to your public URL, and run the Docker image
> or `npm run build && npm start`.

---

## Environment variables

Set these in `server/.env` for local runs, or as environment variables in
Docker/hosting. See [`.env.example`](./.env.example).

| Variable          | Required | Default (dev)             | Purpose                                                            |
| ----------------- | -------- | ------------------------- | ------------------------------------------------------------------ |
| `ADMIN_PASSWORD`  | ✅ (prod) | `changeme`                | Password for `/admin` and `/host`.                                 |
| `SESSION_SECRET`  | ✅ (prod) | dev placeholder           | Signs the admin session cookie. Use a long random string.          |
| `PORT`            |          | `3000`                    | HTTP port (also serves the built client in production).            |
| `DATABASE_URL`    |          | `file:./dev.db`           | Prisma/SQLite location (relative to `server/prisma`).              |
| `PUBLIC_BASE_URL` |          | `http://localhost:3000`   | URL players join at — encoded in the QR code and shown on screen.  |
| `CORS_ORIGINS`    |          | `localhost:5173,:3000`    | Comma-separated allowed origins for the API/Socket.IO layer.       |
| `NODE_ENV`        |          | `development`             | `production` serves the built client and hardens the cookie.       |

Generate a strong secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Adding and managing question sets

**In the Question Builder** (`/admin`):

- **Create / edit** a set, then add questions. Each question has text, an
  optional image URL, 2–4 options, a mode (Quiz/Poll), correct answer(s)
  (required for Quiz), a time limit (10/20/30/60s or none), and a points value
  (Standard / Double / No points).
- **Reorder** questions by dragging the card (or the ↑/↓ buttons).
- **Preview** renders a question exactly as the presenter screen will show it.
- **Validation** mirrors the server: a Quiz question needs at least one correct
  option, and options must be non-empty and unique. Invalid sets can't be saved.
- **Export** a set to JSON (from the list or the editor). **Import** a JSON
  export to recreate it — the file is schema-validated with zod.

**Scoring (Quiz mode).** `points = round(1000 × (1 − (responseTime / timeLimit) / 2))`,
so a correct answer is worth 500–1000 depending on speed (a flat 1000 for
untimed questions). `DOUBLE` doubles the base; `NONE` awards 0. A streak adds
+100 per consecutive correct answer beyond the first, capped at +500. A wrong or
missing answer scores 0 and resets the streak. Poll questions never affect
scores.

**Download results.** After a session, the presenter's **CSV** button (or
`GET /api/sessions/:id/results.csv`) exports every player's answers, response
times and points.

---

## Project layout

```
shared/   TypeScript types, zod schemas, socket event contracts, scoring logic
server/   Express + Socket.IO + Prisma (SQLite). Single source of truth.
client/   React + Vite + Tailwind. Routes: /admin, /host/:id, /play
e2e/      Playwright end-to-end tests (host + multiple player contexts)
```

Key design points: typed socket contracts live in `shared/` so client and
server can't drift; the session engine (`server/src/session/engine.ts`) is pure
and synchronous so it's unit-tested without a DB or sockets; timers use server
timestamps and the client countdown is display-only.

### Useful scripts

| Command                       | What it does                                              |
| ----------------------------- | --------------------------------------------------------- |
| `npm run dev`                 | Run server (:3000) + client dev server (:5173).           |
| `npm run build`               | Build shared, server, and client for production.          |
| `npm start`                   | Run the built server (serves the client too).             |
| `npm run db:migrate`          | Apply database migrations.                                 |
| `npm run db:seed`             | Load the sample Quiz + Poll sets.                         |
| `npm run db:reset`            | Drop, re-migrate and re-seed the database.                |
| `npm test`                    | Server unit + integration tests (Vitest).                 |
| `npm run test:e2e`            | Playwright end-to-end tests (builds + boots the app).     |
| `npm run typecheck`           | Typecheck all workspaces.                                 |

---

## Testing

- **Unit & integration (Vitest):** the state machine, scoring formula, streaks,
  `DOUBLE`/`NONE` points, nickname/PIN/rate-limit utilities, REST auth, plus
  socket integration tests with **50** and **100** concurrent clients that
  assert no dropped answers. A dedicated test enforces that player payloads
  never contain `correctOptionIds` before the reveal.
  ```bash
  npm test                 # or: npm run test:coverage -w server
  ```
- **End-to-end (Playwright):** one host context + several player contexts play a
  full **Quiz** game and a full **Poll** game, asserting scores, leaderboard
  order and chart counts.
  ```bash
  npm run test:e2e:install   # one-time: download the Chromium browser
  npm run test:e2e
  ```

CI (`.github/workflows/ci.yml`) runs typecheck → build → unit/integration →
E2E on every push and pull request.

---

## Troubleshooting

- **Phones can't join:** you're probably using `localhost` — set
  `PUBLIC_BASE_URL` to your LAN IP or tunnel URL and restart. Check the firewall
  and that the Wi-Fi allows device-to-device traffic.
- **401 on the admin screen:** wrong `ADMIN_PASSWORD`, or the cookie didn't set
  (serving over plain HTTP in production sets a `Secure` cookie — use HTTPS, e.g.
  the Cloudflare Tunnel, in production).
- **"Session not found" on the host screen:** sessions live in the server's
  memory for the duration of a run; restarting the server ends active sessions.
  Start a new one from `/admin`.

## License

MIT
