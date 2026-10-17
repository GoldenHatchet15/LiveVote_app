import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { prisma } from '../db.js';
import { sessionManager } from '../session/manager.js';
import { buildResultsCsv } from '../session/csv.js';

export const sessionsRouter = Router();
sessionsRouter.use(requireAdmin);

// Manually delete a session's player data (privacy, M6). Removes the session
// row, which cascades to its players and answers, and drops it from memory.
sessionsRouter.delete('/:id/data', async (req, res) => {
  sessionManager.dispose(req.params.id);
  await prisma.session.deleteMany({ where: { id: req.params.id } });
  res.json({ ok: true });
});

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
