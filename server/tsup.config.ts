import { defineConfig } from 'tsup';

// Bundle the server (and the workspace `shared` source it imports) into a
// single ESM file so production `node dist/index.js` needs no workspace
// resolution. The Prisma client and native bits stay external.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  bundle: true,
  splitting: false,
  external: ['@prisma/client', '.prisma/client'],
  noExternal: ['@livevote/shared'],
});
