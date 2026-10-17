import { Router } from 'express';
import { ZodError } from 'zod';
import {
  questionSetExportSchema,
  questionSetInputSchema,
  type QuestionSetInput,
} from '@livevote/shared';
import { requireAdmin } from '../auth.js';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { sessionManager } from '../session/manager.js';
import { questionsCreateInput, serializeSet, toInput } from './serialize.js';

export const setsRouter = Router();
setsRouter.use(requireAdmin);

const includeGraph = {
  questions: { include: { options: true } },
} as const;

function zodError(res: import('express').Response, err: ZodError): void {
  res.status(422).json({
    error: 'Validation failed',
    issues: err.issues.map((i) => ({ path: i.path, message: i.message })),
  });
}

// List all sets (summaries).
setsRouter.get('/', async (_req, res) => {
  const sets = await prisma.questionSet.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { questions: true } } },
  });
  res.json(
    sets.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      questionCount: s._count.questions,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  );
});

// Get one full set.
setsRouter.get('/:id', async (req, res) => {
  const set = await prisma.questionSet.findUnique({
    where: { id: req.params.id },
    include: includeGraph,
  });
  if (!set) {
    res.status(404).json({ error: 'Set not found' });
    return;
  }
  res.json(serializeSet(set));
});

// Create a set.
setsRouter.post('/', async (req, res) => {
  let input: QuestionSetInput;
  try {
    input = questionSetInputSchema.parse(req.body);
  } catch (err) {
    if (err instanceof ZodError) return zodError(res, err);
    throw err;
  }
  const set = await prisma.questionSet.create({
    data: {
      title: input.title,
      description: input.description,
      showVoterNames: input.showVoterNames,
      questions: { create: questionsCreateInput(input) },
    },
    include: includeGraph,
  });
  res.status(201).json(serializeSet(set));
});

// Replace a set (title/description/questions).
setsRouter.put('/:id', async (req, res) => {
  let input: QuestionSetInput;
  try {
    input = questionSetInputSchema.parse(req.body);
  } catch (err) {
    if (err instanceof ZodError) return zodError(res, err);
    throw err;
  }
  const existing = await prisma.questionSet.findUnique({
    where: { id: req.params.id },
  });
  if (!existing) {
    res.status(404).json({ error: 'Set not found' });
    return;
  }
  const set = await prisma.$transaction(async (tx) => {
    await tx.question.deleteMany({ where: { setId: req.params.id } });
    return tx.questionSet.update({
      where: { id: req.params.id },
      data: {
        title: input.title,
        description: input.description,
        showVoterNames: input.showVoterNames,
        questions: { create: questionsCreateInput(input) },
      },
      include: includeGraph,
    });
  });
  res.json(serializeSet(set));
});

// Delete a set.
setsRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.questionSet.findUnique({
    where: { id: req.params.id },
  });
  if (!existing) {
    res.status(404).json({ error: 'Set not found' });
    return;
  }
  await prisma.questionSet.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// Export a set as a JSON envelope.
setsRouter.get('/:id/export', async (req, res) => {
  const set = await prisma.questionSet.findUnique({
    where: { id: req.params.id },
    include: includeGraph,
  });
  if (!set) {
    res.status(404).json({ error: 'Set not found' });
    return;
  }
  const envelope = {
    schemaVersion: 1 as const,
    exportedAt: new Date().toISOString(),
    set: toInput(set),
  };
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${set.title.replace(/[^a-z0-9]+/gi, '_')}.json"`,
  );
  res.json(envelope);
});

// Import a set from an envelope or a raw set-input body.
setsRouter.post('/import', async (req, res) => {
  const asEnvelope = questionSetExportSchema.safeParse(req.body);
  let resolved: QuestionSetInput;
  if (asEnvelope.success) {
    resolved = asEnvelope.data.set;
  } else {
    const raw = questionSetInputSchema.safeParse(req.body);
    if (!raw.success) return zodError(res, raw.error);
    resolved = raw.data;
  }

  const set = await prisma.questionSet.create({
    data: {
      title: resolved.title,
      description: resolved.description,
      showVoterNames: resolved.showVoterNames,
      questions: { create: questionsCreateInput(resolved) },
    },
    include: includeGraph,
  });
  res.status(201).json(serializeSet(set));
});

// Start a session for a set.
setsRouter.post('/:id/start', async (req, res) => {
  // Cap concurrent sessions (M4).
  if (sessionManager.activeSessionCount >= env.maxActiveSessions) {
    res.status(503).json({ error: 'Too many active sessions — try again shortly' });
    return;
  }
  const engine = await sessionManager.createSession(req.params.id);
  if (!engine) {
    res.status(404).json({ error: 'Set not found' });
    return;
  }
  res.status(201).json({ sessionId: engine.sessionId, pin: engine.pin });
});
