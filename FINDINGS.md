# LiveVote — Test Audit & Findings

Date: 2026-10-15

## 1. Test results

### Before this work
- Typecheck: **pass** (all workspaces)
- Server (Vitest): **51 passed**, 0 failed, 0 flaky
- E2E (Playwright): **3 passed**, 0 failed

### After this work (PR 1 — tests & fixes)
- Typecheck: **pass**
- Server (Vitest): **79 passed** (+28)
- E2E (Playwright): **10 passed** (+7)

No test was observed to be flaky across repeated local runs.

## 2. Audit — coverage before vs. added

| Area | Already covered | Added in PR 1 |
| --- | --- | --- |
| State machine | starts in LOBBY; START/SKIP/NEXT happy paths; POLL vs QUIZ branch; END from any state | invalid SKIP (from REVEAL/LEADERBOARD), invalid NEXT (LOBBY/QUESTION), invalid START after begin, answer outside QUESTION, start empty set |
| PIN | format generation/validation | **uniqueness across 60 concurrently-active sessions** (integration) |
| Join validation | nickname length/profanity/leet; PIN format; rate limiter | (unit coverage already strong; join paths exercised via socket tests) |
| Answers | duplicate, late, kicked, unknown option | — |
| Timers | timer expiry; all-answered early end | — |
| Scoring | formula, DOUBLE/NONE, streak bonus/cap/reset (unit) | **streak build + reset across multiple questions** (engine-level, end-to-end through reveals) |
| Poll scoring | poll reveal has no correct answers, no scoring | — |
| No answer leak | question:start + snapshot have no correctOptionIds; reveal host-only | (preserved; extended by the feature's privacy tests in PR 2) |
| Reconnect | e2e player refresh mid-question | engine-level identity/score preservation; **refresh mid-REVEAL** (e2e); snapshot restores personal result |
| Host disconnect/refresh | — | **session survives + host regains control** (integration) |
| Question builder | — (only via e2e set creation) | **schema validation** (quiz-no-correct, dup/empty options, <2 options, poll-with-correct, out-of-range, missing title) + **JSON export/import round-trip** + **invalid import fails gracefully** |
| Host flow | full poll, full quiz | **regression: back to dashboard after poll end / quiz end / ended-early** + **start a fresh session with no stale state**; **CSV export contents** (unit) |
| Player flow | refresh mid-game | **QR pre-fills PIN**, **double-tap doesn't double-submit**, **kicked screen**, **player game-over screen** |
| Multi-device | 50-client + 100-client socket; full 5-player e2e | **two simultaneous sessions don't leak** (integration) |
| Load | 100 concurrent, no dropped answers | — |

## 3. Bugs found

The existing suite was green and a full read of the engine, socket layer, manager,
routes and client turned up **no critical or major correctness bugs**. The gaps
were in *coverage*, not behaviour, so PR 1 is predominantly new tests plus the
regression test for the already-applied "Back to dashboard" fix.

### Minor observations (reported, not changed — low value / by design)

1. **`maybeAutoEnd` counts disconnected-but-not-kicked players as active.** If a
   player closes their phone mid-question, the question waits for the timer
   rather than ending as soon as the *connected* players have answered. This is
   intentional — a disconnected player may reconnect and still answer within the
   time limit — so it was left as-is.
2. **`SessionManager.uniquePin()` retries 50 times then returns whatever it has.**
   With a 10⁶ PIN space and only a handful of live sessions this never collides
   in practice; the new uniqueness test documents and guards the real behaviour.
   Not changed to avoid altering a working path.
3. **The per-IP join rate limiter (`RateLimiter(100, 10)`) is global.** A single
   NAT/classroom shares one bucket; capacity 100 matches the stated 30–100
   player target. Noted for operators running several large sessions from one IP.

None of these change behaviour relative to the original spec, so none were
"flagged to stop" per the task rules — they are informational.

## 4. What remains
- Docker `compose up --build` still needs to be executed on a host with a running
  Docker daemon (not available in the build sandbox). The image path
  (build → migrate → seed → serve on one port) is exercised locally via
  `npm run build && npm start`.
