import { buildApp } from './app.js';
import { env } from './env.js';
import { disconnectDb } from './db.js';

const { server } = buildApp();

server.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `LiveVote server listening on http://localhost:${env.port} (${env.nodeEnv})`,
  );
  // eslint-disable-next-line no-console
  console.log(`Players join at: ${env.publicBaseUrl}/play`);
});

async function shutdown(signal: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\n${signal} received, shutting down...`);
  server.close();
  await disconnectDb();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
