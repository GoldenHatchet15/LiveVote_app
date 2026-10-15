import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { sessionManager } from '../session/manager.js';
import { buildResultsCsv } from '../session/csv.js';

export const sessionsRouter = Router();
sessionsRouter.use(requireAdmin);

// Basic info for the host page to confirm a session exists.
sessionsRouter.get('/:id', (req, res) => {
  const engine = sessionManager.get(req.params.id);
  if (!engine) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({
    sessionId: engine.sessionId,
    pin: engine.pin,
    state: engine.state,
    title: engine.title,
    totalQuestions: engine.totalQuestions,
  });
});

// Download the results CSV.
sessionsRouter.get('/:id/results.csv', (req, res) => {
  const engine = sessionManager.get(req.params.id);
  const set = sessionManager.getSet(req.params.id);
  if (!engine || !set) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  const csv = buildResultsCsv(engine, set);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="livevote_${engine.pin}_results.csv"`,
  );
  res.send(csv);
});
