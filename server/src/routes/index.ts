import { Router } from 'express';
import { authRouter } from './auth.js';
import { setsRouter } from './sets.js';
import { sessionsRouter } from './sessions.js';
import { publicRouter } from './public.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => res.json({ ok: true }));
apiRouter.use('/auth', authRouter);
apiRouter.use('/public', publicRouter);
apiRouter.use('/sets', setsRouter);
apiRouter.use('/sessions', sessionsRouter);
