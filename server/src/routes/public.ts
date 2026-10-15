import { Router } from 'express';
import { sessionManager } from '../session/manager.js';
import { isValidPinFormat } from '../util/pin.js';
import { env } from '../env.js';

export const publicRouter = Router();

// Client bootstrap config (safe to expose).
publicRouter.get('/config', (_req, res) => {
  res.json({ publicBaseUrl: env.publicBaseUrl });
});

// Lightweight PIN check so the player page can show "no such game" before the
// socket handshake. Never leaks questions or answers.
publicRouter.get('/session/:pin', (req, res) => {
  const pin = req.params.pin;
  if (!isValidPinFormat(pin)) {
    res.json({ exists: false, joinable: false });
    return;
  }
  const engine = sessionManager.getByPin(pin);
  if (!engine) {
    res.json({ exists: false, joinable: false });
    return;
  }
  res.json({
    exists: true,
    joinable: engine.state === 'LOBBY',
    title: engine.title,
    state: engine.state,
  });
});
