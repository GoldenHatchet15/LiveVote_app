import type {
  PointsValue,
  Question,
  QuestionConfig,
  QuestionMode,
  QuestionSet,
  QuestionSetInput,
  QuestionType,
  TimeLimitSec,
} from '@livevote/shared';
import type { Prisma } from '@prisma/client';

type SetWithGraph = Prisma.QuestionSetGetPayload<{
  include: { questions: { include: { options: true } } };
}>;

function parseConfig(raw: string | null): QuestionConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as QuestionConfig) : {};
  } catch {
    return {};
  }
}

export function serializeSet(set: SetWithGraph): QuestionSet {
  const questions: Question[] = [...set.questions]
    .sort((a, b) => a.order - b.order)
    .map((q) => {
      const options = [...q.options]
        .sort((a, b) => a.index - b.index)
        .map((o) => ({ id: o.id, text: o.text, index: o.index }));
      return {
        id: q.id,
        text: q.text,
        imageUrl: q.imageUrl,
        mode: q.mode as QuestionMode,
        type: (q.type ?? 'MULTIPLE_CHOICE') as QuestionType,
        config: parseConfig(q.config),
        options,
        correctOptionIds: [...q.options]
          .filter((o) => o.isCorrect)
          .map((o) => o.id),
        timeLimitSec: (q.timeLimitSec ?? null) as TimeLimitSec,
        points: q.points as PointsValue,
        order: q.order,
      };
    });

  return {
    id: set.id,
    title: set.title,
    description: set.description,
    showVoterNames: set.showVoterNames,
    createdAt: set.createdAt.toISOString(),
    updatedAt: set.updatedAt.toISOString(),
    questions,
  };
}

/** Convert a stored set into the import/export input shape (no server ids). */
export function toInput(set: SetWithGraph): QuestionSetInput {
  return {
    title: set.title,
    description: set.description,
    showVoterNames: set.showVoterNames,
    questions: [...set.questions]
      .sort((a, b) => a.order - b.order)
      .map((q) => {
        const options = [...q.options].sort((a, b) => a.index - b.index);
        return {
          text: q.text,
          imageUrl: q.imageUrl ?? null,
          mode: q.mode as QuestionMode,
          type: (q.type ?? 'MULTIPLE_CHOICE') as QuestionType,
          config: parseConfig(q.config),
          options: options.map((o) => ({ text: o.text })),
          correctOptionIndices: options
            .map((o, i) => (o.isCorrect ? i : -1))
            .filter((i) => i >= 0),
          timeLimitSec: (q.timeLimitSec ?? null) as TimeLimitSec,
          points: q.points as PointsValue,
        };
      }),
  };
}

/** Build the nested Prisma create input for a set's questions. */
export function questionsCreateInput(input: QuestionSetInput) {
  return input.questions.map((q, qi) => ({
    text: q.text,
    imageUrl: q.imageUrl ?? null,
    mode: q.mode,
    type: q.type,
    config: q.config && Object.keys(q.config).length > 0 ? JSON.stringify(q.config) : null,
    timeLimitSec: q.timeLimitSec,
    points: q.points,
    order: qi,
    options: {
      create: q.options.map((o, oi) => ({
        text: o.text,
        index: oi,
        isCorrect: q.correctOptionIndices.includes(oi),
      })),
    },
  }));
}
