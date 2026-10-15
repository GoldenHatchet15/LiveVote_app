import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@livevote/shared';

export type LiveSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Create a socket connected to the same origin (the server also serves the
 * client in production; in dev Vite proxies /socket.io to :3000). We include
 * credentials so the admin cookie reaches the server for host sockets.
 */
export function createSocket(): LiveSocket {
  return io({
    withCredentials: true,
    autoConnect: true,
    transports: ['websocket', 'polling'],
  });
}
