import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev the client runs on :5173 and proxies API + websocket traffic to the
// server on :3000. In production the server serves the built client directly.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@livevote/shared': fileURLToPath(
        new URL('../shared/src/index.ts', import.meta.url),
      ),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true, // expose on LAN so phones can reach the dev client if needed
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
