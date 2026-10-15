import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SeedOption {
  text: string;
  correct?: boolean;
}
interface SeedQuestion {
  text: string;
  mode: 'POLL' | 'QUIZ';
  options: SeedOption[];
  timeLimitSec: number | null;
  points: 'STANDARD' | 'DOUBLE' | 'NONE';
  imageUrl?: string | null;
}
interface SeedSet {
  title: string;
  description: string;
  showVoterNames?: boolean;
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
  // Demonstrates the "show voter names" setting out of the box.
  showVoterNames: true,
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

async function createSet(set: SeedSet): Promise<void> {
  await prisma.questionSet.create({
    data: {
      title: set.title,
      description: set.description,
      showVoterNames: set.showVoterNames ?? false,
      questions: {
        create: set.questions.map((q, qi) => ({
          text: q.text,
          imageUrl: q.imageUrl ?? null,
          mode: q.mode,
          timeLimitSec: q.timeLimitSec,
          points: q.points,
          order: qi,
          options: {
            create: q.options.map((o, oi) => ({
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
    where: { title: { in: [QUIZ_SET.title, POLL_SET.title] } },
  });
  await createSet(QUIZ_SET);
  await createSet(POLL_SET);
  // eslint-disable-next-line no-console
  console.log('Seeded: "%s" and "%s"', QUIZ_SET.title, POLL_SET.title);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
