import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from 'react-router-dom';
import './index.css';
import { Landing } from './Landing';
import { AdminApp } from './admin/AdminApp';
import { HostApp } from './host/HostApp';
import { PlayApp } from './play/PlayApp';

const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/admin/*', element: <AdminApp /> },
  { path: '/host/:sessionId', element: <HostApp /> },
  { path: '/play', element: <PlayApp /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
