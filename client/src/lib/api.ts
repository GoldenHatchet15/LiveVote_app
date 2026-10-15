import type { QuestionSet, QuestionSetInput } from '@livevote/shared';

export interface SetSummary {
  id: string;
  title: string;
  description: string | null;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: Array<{ path: (string | number)[]; message: string }>,
  ) {
    super(message);
  }
}

async function req<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, headers, ...rest } = init ?? {};
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
    ...rest,
  });
  if (!res.ok) {
    let message = res.statusText;
    let issues;
    try {
      const body = await res.json();
      message = body.error ?? message;
      issues = body.issues;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message, issues);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('application/json') ? res.json() : res.text()) as Promise<T>;
}

export const api = {
  // auth
  me: () => req<{ authenticated: boolean }>('/auth/me'),
  login: (password: string) =>
    req<{ ok: true }>('/auth/login', { method: 'POST', json: { password } }),
  logout: () => req<{ ok: true }>('/auth/logout', { method: 'POST' }),

  // config
  config: () => req<{ publicBaseUrl: string }>('/public/config'),

  // sets
  listSets: () => req<SetSummary[]>('/sets'),
  getSet: (id: string) => req<QuestionSet>(`/sets/${id}`),
  createSet: (input: QuestionSetInput) =>
    req<QuestionSet>('/sets', { method: 'POST', json: input }),
  updateSet: (id: string, input: QuestionSetInput) =>
    req<QuestionSet>(`/sets/${id}`, { method: 'PUT', json: input }),
  deleteSet: (id: string) =>
    req<{ ok: true }>(`/sets/${id}`, { method: 'DELETE' }),
  importSet: (payload: unknown) =>
    req<QuestionSet>('/sets/import', { method: 'POST', json: payload }),
  startSession: (id: string) =>
    req<{ sessionId: string; pin: string }>(`/sets/${id}/start`, {
      method: 'POST',
    }),

  // sessions
  getSession: (id: string) =>
    req<{
      sessionId: string;
      pin: string;
      state: string;
      title: string;
      totalQuestions: number;
    }>(`/sessions/${id}`),

  exportUrl: (id: string) => `/api/sets/${id}/export`,
  csvUrl: (sessionId: string) => `/api/sessions/${sessionId}/results.csv`,
};
