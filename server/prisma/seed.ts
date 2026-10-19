import { PrismaClient } from '@prisma/client';
import type { QuestionConfig, QuestionType } from '@livevote/shared';

const prisma = new PrismaClient();

interface SeedOption {
  text: string;
  correct?: boolean;
}
interface SeedQuestion {
  text: string;
  mode: 'POLL' | 'QUIZ';
  type?: QuestionType;
  config?: QuestionConfig;
  options?: SeedOption[];
  timeLimitSec: number | null;
  points: 'STANDARD' | 'DOUBLE' | 'NONE';
  imageUrl?: string | null;
}
interface SeedSet {
  title: string;
  description: string;
  showVoterNames?: boolean;
  showResultsSummary?: boolean;
  questions: SeedQuestion[];
}

const QUIZ_SET: SeedSet = {
  title: 'General Knowledge Quiz',
  description: 'A five-question warm-up covering a bit of everything.',
  questions: [
    {
      text: 'What is the capital of France?',
      mode: 'QUIZ',
      timeLimitSec: 20,
      points: 'STANDARD',
      options: [
        { text: 'Paris', correct: true },
        { text: 'Lyon' },
        { text: 'Marseille' },
        { text: 'Bordeaux' },
      ],
    },
    {
      text: 'Which planet is known as the Red Planet?',
      mode: 'QUIZ',
      timeLimitSec: 20,
      points: 'STANDARD',
      options: [
        { text: 'Venus' },
        { text: 'Mars', correct: true },
        { text: 'Jupiter' },
        { text: 'Saturn' },
      ],
    },
    {
      text: 'In computing, what does "HTTP" stand for?',
      mode: 'QUIZ',
      timeLimitSec: 30,
      points: 'DOUBLE',
      options: [
        { text: 'HyperText Transfer Protocol', correct: true },
        { text: 'High Transfer Text Protocol' },
        { text: 'Hyperlink Transmission Tool Process' },
        { text: 'Host Transfer Type Protocol' },
      ],
    },
    {
      text: 'Which of these is NOT a JavaScript framework?',
      mode: 'QUIZ',
      timeLimitSec: 20,
      points: 'STANDARD',
      options: [
        { text: 'React' },
        { text: 'Vue' },
        { text: 'Laravel', correct: true },
        { text: 'Svelte' },
      ],
    },
    {
      text: 'The speed of light is approximately 300,000 km/s. True or false?',
      mode: 'QUIZ',
      timeLimitSec: 10,
      points: 'STANDARD',
      options: [
        { text: 'True', correct: true },
        { text: 'False' },
      ],
    },
  ],
};

const POLL_SET: SeedSet = {
  title: 'Icebreaker Poll',
  description: 'No right answers — just see what the room thinks.',
  // Demonstrates "show voter names" and the end-of-session results summary.
  showVoterNames: true,
  showResultsSummary: true,
  questions: [
    {
      text: 'How are you feeling about today’s session?',
      mode: 'POLL',
      timeLimitSec: 20,
      points: 'NONE',
      options: [
        { text: 'Excited' },
        { text: 'Curious' },
        { text: 'Nervous' },
        { text: 'Need more coffee' },
      ],
    },
    {
      text: 'Which topic should we dig into first?',
      mode: 'POLL',
      timeLimitSec: 30,
      points: 'NONE',
      options: [
        { text: 'Frontend' },
        { text: 'Backend' },
        { text: 'Databases' },
        { text: 'DevOps' },
      ],
    },
    {
      text: 'Preferred way to learn?',
      mode: 'POLL',
      timeLimitSec: null,
      points: 'NONE',
      options: [
        { text: 'Hands-on projects' },
        { text: 'Reading docs' },
        { text: 'Watching videos' },
        { text: 'Pairing with someone' },
      ],
    },
    {
      text: 'Cats or dogs?',
      mode: 'POLL',
      timeLimitSec: 10,
      points: 'NONE',
      options: [{ text: 'Cats' }, { text: 'Dogs' }],
    },
  ],
};

const MIXED_SET: SeedSet = {
  title: 'Mixed Question Types',
  description: 'One of every question type — great for a feature demo.',
  showVoterNames: true,
  showResultsSummary: true,
  questions: [
    {
      text: 'Which is the capital of Japan?',
      mode: 'QUIZ',
      type: 'MULTIPLE_CHOICE',
      timeLimitSec: 20,
      points: 'STANDARD',
      options: [{ text: 'Tokyo', correct: true }, { text: 'Kyoto' }, { text: 'Osaka' }, { text: 'Nara' }],
    },
    {
      text: 'Which of these are prime numbers?',
      mode: 'QUIZ',
      type: 'MULTI_SELECT',
      timeLimitSec: 25,
      points: 'STANDARD',
      options: [{ text: '2', correct: true }, { text: '4' }, { text: '5', correct: true }, { text: '9' }],
    },
    {
      text: 'The sun is a star.',
      mode: 'QUIZ',
      type: 'TRUE_FALSE',
      config: { trueLabel: 'True', falseLabel: 'False' },
      timeLimitSec: 15,
      points: 'STANDARD',
      options: [{ text: 'True', correct: true }, { text: 'False' }],
    },
    {
      text: 'How do you say "hello" in Spanish?',
      mode: 'QUIZ',
      type: 'TYPE_ANSWER',
      config: { acceptedAnswers: ['hola', 'buenos días'], exactMatch: false },
      timeLimitSec: 20,
      points: 'STANDARD',
    },
    {
      text: 'In one word, how is this session going?',
      mode: 'POLL',
      type: 'OPEN_ENDED',
      config: { revealStyle: 'WORD_CLOUD' },
      timeLimitSec: 30,
      points: 'NONE',
    },
    {
      text: 'What year did humans first land on the Moon?',
      mode: 'QUIZ',
      type: 'SLIDER',
      config: { min: 1940, max: 2000, step: 1, unit: null, correctValue: 1969, tolerance: 2 },
      timeLimitSec: 25,
      points: 'STANDARD',
    },
    {
      text: 'Put these planets in order from the Sun, nearest first.',
      mode: 'QUIZ',
      type: 'ORDERING',
      timeLimitSec: 30,
      points: 'STANDARD',
      // Listed in the CORRECT order; players see them shuffled.
      options: [{ text: 'Mercury' }, { text: 'Venus' }, { text: 'Earth' }, { text: 'Mars' }],
    },
    {
      text: 'How useful was today’s session?',
      mode: 'POLL',
      type: 'RATING',
      config: { scale: 5, lowLabel: 'Not at all', highLabel: 'Extremely' },
      timeLimitSec: 20,
      points: 'NONE',
    },
    {
      text: 'Which student is most likely to ride a skateboard to class?',
      mode: 'POLL',
      type: 'WRITE_IN',
      config: {
        suggestedAnswers: ['Carlos', 'José', 'Marta', 'Ana', 'Luis', 'Pedro', 'Kevin'],
        onlySuggested: false,
        maxAnswerLength: 40,
        reviewBeforeReveal: false,
      },
      timeLimitSec: 30,
      points: 'NONE',
    },
  ],
};

async function createSet(set: SeedSet): Promise<void> {
  await prisma.questionSet.create({
    data: {
      title: set.title,
      description: set.description,
      showVoterNames: set.showVoterNames ?? false,
      showResultsSummary: set.showResultsSummary ?? true,
      questions: {
        create: set.questions.map((q, qi) => ({
          text: q.text,
          imageUrl: q.imageUrl ?? null,
          mode: q.mode,
          type: q.type ?? 'MULTIPLE_CHOICE',
          config: q.config ? JSON.stringify(q.config) : null,
          timeLimitSec: q.timeLimitSec,
          points: q.points,
          order: qi,
          options: {
            create: (q.options ?? []).map((o, oi) => ({
              text: o.text,
              index: oi,
              isCorrect: o.correct ?? false,
            })),
          },
        })),
      },
    },
  });
}

async function main(): Promise<void> {
  // Reset only the seed sets so re-running is safe and idempotent.
  await prisma.questionSet.deleteMany({
    where: { title: { in: [QUIZ_SET.title, POLL_SET.title, MIXED_SET.title] } },
  });
  await createSet(QUIZ_SET);
  await createSet(POLL_SET);
  await createSet(MIXED_SET);
  // eslint-disable-next-line no-console
  console.log('Seeded: "%s", "%s" and "%s"', QUIZ_SET.title, POLL_SET.title, MIXED_SET.title);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
