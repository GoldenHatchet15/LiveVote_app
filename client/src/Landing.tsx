import { Link } from 'react-router-dom';
import { Shape } from './components/Shape';

export function Landing() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-10 p-6">
      <div className="text-center">
        <div className="mb-3 flex items-center justify-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              style={{ color: ['#e4002b', '#2563eb', '#f2b705', '#15803d'][i] }}
            >
              <Shape index={i} className="h-8 w-8" />
            </span>
          ))}
        </div>
        <h1 className="font-display text-6xl font-extrabold text-brand">LiveVote</h1>
        <p className="mt-2 text-lg text-ink/60">
          Kahoot-style live polls &amp; quizzes for the classroom.
        </p>
      </div>

      <div className="grid w-full max-w-md gap-4">
        <Link to="/play" className="btn-primary py-4 text-lg">
          Join a game
        </Link>
        <Link to="/admin" className="btn-dark py-4 text-lg">
          Host / Admin
        </Link>
      </div>

      <p className="text-sm text-ink/40">Server is the source of truth · no app install needed</p>
    </div>
  );
}
