import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type SetSummary } from '../lib/api';

export function SetList({ onLogout }: { onLogout: () => void }) {
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  async function refresh() {
    try {
      setSets(await api.listSets());
    } catch {
      setError('Could not load sets');
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function start(id: string) {
    const { sessionId } = await api.startSession(id);
    navigate(`/host/${sessionId}`);
  }

  async function remove(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    await api.deleteSet(id);
    void refresh();
  }

  async function onImport(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const created = await api.importSet(parsed);
      navigate(`/admin/set/${created.id}`);
    } catch {
      setError('Import failed — is it a valid LiveVote JSON export?');
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl font-extrabold text-brand">LiveVote</h1>
          <p className="text-ink/60">Question sets</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-ghost"
            onClick={async () => {
              await api.logout();
              onLogout();
            }}
          >
            Log out
          </button>
          <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          <Link to="/admin/set/new" className="btn-primary">
            + New set
          </Link>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      {error && <p className="mb-4 text-sm font-medium text-brand">{error}</p>}

      {sets === null ? (
        <p className="text-ink/50">Loading…</p>
      ) : sets.length === 0 ? (
        <div className="card text-center text-ink/60">
          No sets yet. Create one or import a JSON export.
        </div>
      ) : (
        <ul className="grid gap-3">
          {sets.map((s) => (
            <li key={s.id} className="card flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold">{s.title}</h2>
                <p className="truncate text-sm text-ink/50">
                  {s.questionCount} question{s.questionCount === 1 ? '' : 's'}
                  {s.description ? ` · ${s.description}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <a className="btn-ghost" href={api.exportUrl(s.id)}>
                  Export
                </a>
                <Link className="btn-ghost" to={`/admin/set/${s.id}`}>
                  Edit
                </Link>
                <button className="btn-ghost text-brand" onClick={() => remove(s.id, s.title)}>
                  Delete
                </button>
                <button
                  className="btn-primary"
                  disabled={s.questionCount === 0}
                  onClick={() => void start(s.id)}
                >
                  Start session
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
