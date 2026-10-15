import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { api } from '../lib/api';
import { LoginGate } from './LoginGate';
import { SetList } from './SetList';
import { SetEditor } from './SetEditor';

export function AdminApp() {
  const [auth, setAuth] = useState<'loading' | 'in' | 'out'>('loading');

  useEffect(() => {
    api
      .me()
      .then((r) => setAuth(r.authenticated ? 'in' : 'out'))
      .catch(() => setAuth('out'));
  }, []);

  if (auth === 'loading') {
    return <div className="p-10 text-center text-ink/50">Loading…</div>;
  }
  if (auth === 'out') {
    return <LoginGate onSuccess={() => setAuth('in')} />;
  }

  return (
    <Routes>
      <Route index element={<SetList onLogout={() => setAuth('out')} />} />
      <Route path="set/new" element={<SetEditor mode="new" />} />
      <Route path="set/:id" element={<SetEditor mode="edit" />} />
    </Routes>
  );
}
