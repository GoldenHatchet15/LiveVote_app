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
- **Show voter names on results** (per set, **off by default**). When on, the
  host REVEAL screen lists which players chose each option (correct answers use
  the correct-answer highlight in Quiz mode), with up to 10 names per option and
  a **+N more** control to expand the rest. Players are shown a small
  *"your name will be shown with your answer"* notice so voting is never
  secretly attributed.

**Showing voter names.** The setting is saved on the question set and is carried
through JSON export/import. The host can also **override it per session** with
the toggle in the lobby or the controls bar (keyboard shortcut `N`); the
override changes only that session and never edits the saved set. Toggling takes
effect from the next reveal, or immediately if the host is already on a reveal.

> **Privacy.** Voter names are sent **only to the host**, and **only when the
> setting is on** — this is enforced on the server, not just hidden in the UI.
> Players never receive other players' answers, and the CSV export (which
> already contains per-player answers for the admin) is unchanged.

### Question types

Each question has a **type** (picked when you add it). Only its relevant fields
show in the builder, and the preview renders exactly what players will see.

| Type | Modes | Player input | Quiz scoring | Reveal |
| --- | --- | --- | --- | --- |
| **Multiple choice** | Poll + Quiz | 2–4 options, one answer | correct option | bar chart |
| **Multiple select** | Poll + Quiz | 2–6 options, pick several → Submit | full points for the **exact** correct set | bar chart |
| **True / False** | Poll + Quiz | two big buttons (labels localizable) | correct option | bar chart |
| **Type answer** | Quiz only | short text (≤40) | speed-based when it matches an accepted answer | accepted answer(s), % correct, common wrong answers |
| **Open ended** | Poll only | free text (≤120) | — | **word cloud** or **answer wall** (host can hide any response) |
| **Slider** | Poll + Quiz | drag a number | full within tolerance, scaled down to 2× tolerance, 0 beyond | distribution on a number line (correct marked / average) |
| **Ordering** | Quiz only | drag/tap 3–5 items into order | full points for the **exact** order | correct order + % correct |
| **Rating** | Poll only | 1–5 stars or 1–10 | — | distribution + average |
| **Write-in Vote** | Poll only | type an answer (autocomplete) | — | matching answers **grouped** into bars with the name tags of everyone who voted |

- **Type-answer matching** ignores case, extra spaces and accents
  (`canción` = `cancion`); a per-question **exact match** toggle turns that off.
- **Slider scoring**: full `basePoints` within `±tolerance`, then a linear
  falloff to `0` at `2×tolerance`, times the speed factor; the speed bonus still
  applies.
- **Open-ended** responses are HTML-sanitized and profanity-filtered on submit;
  hidden responses are excluded from the word cloud and the wall.
- **Changing a question's type** warns before discarding incompatible fields.

#### Write-in Vote

Players type a free answer; matching answers are grouped into one "vote" and the
reveal shows each as a bar (sorted by count, ties alphabetical) with the name
tags of everyone who gave that answer underneath. Great for "which classmate
is most likely to…" style questions.

- **Matching** (server-side): two answers match when equal after normalization —
  case-insensitive, trimmed + inner spaces collapsed, accents ignored
  (`José` = `Jose`), and trailing `.`/`!`/`?` dropped. **No automatic fuzzy
  matching** — typos stay separate.
- **Display label**: a matching *suggested answer*'s spelling, else the most
  common original spelling (ties → first submitted), title-cased.
- **Suggested answers** (optional roster): players get autocomplete; an
  **"only suggested answers"** toggle turns it into a pick-from-list vote
  (rejected server-side otherwise).
- **Host tools on the reveal**: *Possible duplicates* suggestions (edit-distance
  ≤1 for 4+ char answers, e.g. `Jose`/`Joes`) with one-click **Merge** and
  **Undo**; **Hide** a whole group or an individual answer (removed from the
  screen + counts, kept in the CSV marked `hidden`); an optional **review before
  reveal** gate. Top 8 groups show; the rest collapse into "other answers".
- **Privacy**: defaults to names **on** (the point of the type) but respects the
  session toggle — off shows counts only, and the server sends no names. Players
  never receive other players' answers or names. Write-in never affects scores.
- **Show voter names** works with every type — names appear under each option,
  grouped under *Correct* / each common wrong answer / each rating value /
  *Correct*-*Incorrect*, by closest guess (slider), or on each answer-wall card
  (the word cloud stays anonymous).
- The seed includes a **"Mixed Question Types"** set with one of every type.

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

## Player avatars and colours

When joining, each player enters a nickname and picks an **emoji avatar** from a
curated grid of **30** friendly emojis (animals, food, objects — no faces,
flags, or hands), or hits **Random**. Only the curated list is accepted
(validated server-side). Each player is also given a **colour** from a palette of
**16** distinct colours, assigned **round-robin** as players join so nearby
players look different; colours repeat only once the palette is exhausted.

- **Name tags** are pills — emoji + nickname on the player's colour, with a
  border and automatic (WCAG AA) text colour, so they never read as an answer
  tile. They appear in the **host lobby**, the **reveal** screens (with
  show-voter-names on), the **leaderboard** and **podium**, and on the
  **player's own phone** header.
- **Avatars are unique** within a session while unused ones remain; if everyone's
  in and the pool is exhausted, duplicates are allowed.
- **Reconnecting keeps** the same emoji and colour; a **kicked** player frees
  their emoji back into the pool.
- The **CSV export** includes each player's emoji and colour.

**Emoji artwork:** the 30 avatar SVGs are **bundled in the repo**
(`client/public/twemoji/`) from [Twemoji](https://github.com/twitter/twemoji) so
they render identically on the projector and every phone, with no network
dependency. Twemoji graphics are © Twitter, Inc. and other contributors,
licensed under **[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)**. If
an asset can't be loaded, the native glyph is shown instead.

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
- **End-to-end / multi-device (Playwright):** one host context + several player
  contexts play full **Quiz** and **Poll** games, plus reconnect, kick, the
  "show voter names" feature, and the end-of-session → dashboard regression —
  asserting scores, leaderboard order and chart counts.
  ```bash
  npm run test:e2e:install   # one-time: download the Chromium browser
  npm run test:e2e           # the whole e2e suite (builds + boots the app)
  npx playwright test voter-names   # just one spec
  ```
- **Load test (100 concurrent clients):** part of `npm test` — it opens 100
  sockets in one session and asserts no answer is dropped and every player gets
  a result. Run it alone with:
  ```bash
  npm test -w server -- load
  ```
- **Run everything (what CI runs):**
  ```bash
  npm run typecheck && npm run build && npm test && npm run test:e2e
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
