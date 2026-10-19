import type { Server, Socket } from 'socket.io';
import {
  ErrorCodes,
  type ClientToServerEvents,
  type HostAction,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@livevote/shared';
import { readAdminCookie } from '../auth.js';
import { env } from '../env.js';
import { sessionManager } from '../session/manager.js';
import { validateNickname } from '../util/nickname.js';
import { isValidPinFormat } from '../util/pin.js';
import { RateLimiter } from '../util/rateLimiter.js';
import { resolveClientIp } from '../util/clientIp.js';
import { reconnectToken } from '../util/token.js';

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// Lenient enough for a whole class behind one NAT, strict enough to stop a
// runaway client: ~100 immediate joins then 10/sec sustained, per IP.
const joinLimiter = new RateLimiter(100, 10);

function clientIp(socket: TypedSocket): string {
  return resolveClientIp(socket.handshake.headers, socket.handshake.address);
}

export function registerSocketHandlers(io: TypedServer): void {
  sessionManager.attachIo(io);

  io.on('connection', (socket) => {
    socket.data.isAdmin = readAdminCookie(socket.handshake.headers.cookie);

    // ---------------------------------------------------------- host
    socket.on('host:join', ({ sessionId }, ack) => {
      if (!socket.data.isAdmin) {
        return ack({
          ok: false,
          code: ErrorCodes.NOT_AUTHENTICATED,
          message: 'Admin login required',
        });
      }
      const engine = sessionManager.get(sessionId);
      if (!engine) {
        return ack({
          ok: false,
          code: ErrorCodes.SESSION_NOT_FOUND,
          message: 'Session not found',
        });
      }
      socket.data.role = 'host';
      socket.data.sessionId = sessionId;
      void socket.join(sessionManager.rooms.all(sessionId));
      void socket.join(sessionManager.rooms.host(sessionId));
      engine.broadcastLobby();
      ack({ ok: true, snapshot: engine.hostSnapshot() });
    });

    socket.on('host:action', ({ sessionId, action }, ack) => {
      if (!socket.data.isAdmin) {
        return ack({ ok: false, code: ErrorCodes.NOT_AUTHENTICATED, message: 'Admin login required' });
      }
      const engine = sessionManager.get(sessionId);
      if (!engine) {
        return ack({ ok: false, code: ErrorCodes.SESSION_NOT_FOUND, message: 'Session not found' });
      }
      const result = runHostAction(engine, action);
      ack(result);
      if (action === 'END') {
        // Keep it around briefly so late clients can read the final state.
        setTimeout(() => sessionManager.dispose(sessionId), 60_000);
      }
    });

    socket.on('host:kick', ({ sessionId, playerId }, ack) => {
      if (!socket.data.isAdmin) {
        return ack({ ok: false, code: ErrorCodes.NOT_AUTHENTICATED, message: 'Admin login required' });
      }
      const engine = sessionManager.get(sessionId);
      if (!engine) {
        return ack({ ok: false, code: ErrorCodes.SESSION_NOT_FOUND, message: 'Session not found' });
      }
      sessionManager.kick(engine, playerId);
      ack({ ok: true });
    });

    socket.on('host:setVoterNames', ({ sessionId, enabled }, ack) => {
      if (!socket.data.isAdmin) {
        return ack({ ok: false, code: ErrorCodes.NOT_AUTHENTICATED, message: 'Admin login required' });
      }
      const engine = sessionManager.get(sessionId);
      if (!engine) {
        return ack({ ok: false, code: ErrorCodes.SESSION_NOT_FOUND, message: 'Session not found' });
      }
      ack(engine.setShowVoterNames(Boolean(enabled)));
    });

    socket.on('host:hideResponse', ({ sessionId, playerId, hidden }, ack) => {
      if (!socket.data.isAdmin) {
        return ack({ ok: false, code: ErrorCodes.NOT_AUTHENTICATED, message: 'Admin login required' });
      }
      const engine = sessionManager.get(sessionId);
      if (!engine) {
        return ack({ ok: false, code: ErrorCodes.SESSION_NOT_FOUND, message: 'Session not found' });
      }
      ack(engine.setHiddenResponse(playerId, Boolean(hidden)));
    });

    socket.on('host:writeInMerge', ({ sessionId, sourceKey, targetKey }, ack) => {
      if (!socket.data.isAdmin) return ack({ ok: false, code: ErrorCodes.NOT_AUTHENTICATED, message: 'Admin login required' });
      const engine = sessionManager.get(sessionId);
      if (!engine) return ack({ ok: false, code: ErrorCodes.SESSION_NOT_FOUND, message: 'Session not found' });
      ack(engine.mergeWriteIn(String(sourceKey ?? ''), String(targetKey ?? '')));
    });

    socket.on('host:writeInUndoMerge', ({ sessionId, sourceKey }, ack) => {
      if (!socket.data.isAdmin) return ack({ ok: false, code: ErrorCodes.NOT_AUTHENTICATED, message: 'Admin login required' });
      const engine = sessionManager.get(sessionId);
      if (!engine) return ack({ ok: false, code: ErrorCodes.SESSION_NOT_FOUND, message: 'Session not found' });
      ack(engine.undoMergeWriteIn(String(sourceKey ?? '')));
    });

    socket.on('host:writeInHideGroup', ({ sessionId, key, hidden }, ack) => {
      if (!socket.data.isAdmin) return ack({ ok: false, code: ErrorCodes.NOT_AUTHENTICATED, message: 'Admin login required' });
      const engine = sessionManager.get(sessionId);
      if (!engine) return ack({ ok: false, code: ErrorCodes.SESSION_NOT_FOUND, message: 'Session not found' });
      ack(engine.hideWriteInGroup(String(key ?? ''), Boolean(hidden)));
    });

    // ---------------------------------------------------------- player
    socket.on('player:join', async (payload, ack) => {
      try {
        if (!joinLimiter.take(clientIp(socket))) {
          return ack({ ok: false, code: ErrorCodes.RATE_LIMITED, message: 'Too many attempts, slow down' });
        }
        const pin = (payload.pin ?? '').trim();
        if (!isValidPinFormat(pin)) {
          return ack({ ok: false, code: ErrorCodes.PIN_INVALID, message: 'Enter the 6-digit PIN' });
        }
        const engine = sessionManager.getByPin(pin);
        if (!engine) {
          return ack({ ok: false, code: ErrorCodes.SESSION_NOT_FOUND, message: 'No game with that PIN' });
        }

        // Reconnect path: a valid token rejoins regardless of state.
        if (payload.reconnectToken) {
          const existing = engine.findByToken(payload.reconnectToken);
          if (existing && !existing.kicked) {
            sessionManager.setConnected(engine, existing.id, true);
            bindPlayerSocket(socket, engine.sessionId, existing.id);
            engine.broadcastLobby();
            return ack({
              ok: true,
              playerId: existing.id,
              reconnectToken: existing.reconnectToken,
              nickname: existing.nickname,
              avatarEmoji: existing.avatarEmoji,
              color: existing.color,
              snapshot: engine.playerSnapshot(existing.id),
            });
          }
          if (existing && existing.kicked) {
            return ack({ ok: false, code: ErrorCodes.PLAYER_KICKED, message: 'You were removed from the game' });
          }
          // Unknown token — fall through to a fresh join.
        }

        if (engine.state !== 'LOBBY') {
          return ack({ ok: false, code: ErrorCodes.SESSION_NOT_JOINABLE, message: 'This game has already started' });
        }
        // Cap players per session (M4).
        if (engine.playerSummaries().length >= env.maxPlayersPerSession) {
          return ack({ ok: false, code: ErrorCodes.SESSION_NOT_JOINABLE, message: 'This game is full' });
        }

        const check = validateNickname(payload.nickname ?? '');
        if (!check.ok) {
          return ack({ ok: false, code: check.code, message: check.message });
        }
        if (engine.findByNickname(check.nickname)) {
          return ack({ ok: false, code: ErrorCodes.NICKNAME_TAKEN, message: 'That nickname is taken' });
        }

        const token = reconnectToken();
        const { id, avatarEmoji, color } = await sessionManager.createPlayer(
          engine,
          check.nickname,
          token,
          payload.avatarEmoji,
        );
        bindPlayerSocket(socket, engine.sessionId, id);
        engine.announcePlayerJoined(id);

        ack({
          ok: true,
          playerId: id,
          reconnectToken: token,
          nickname: check.nickname,
          avatarEmoji,
          color,
          snapshot: engine.playerSnapshot(id),
        });
      } catch (err) {
        ack({ ok: false, code: ErrorCodes.INTERNAL, message: 'Could not join' });
      }
    });

    socket.on('player:answer', ({ questionId, value }, ack) => {
      if (typeof ack !== 'function') return; // malformed call — ignore
      try {
        const { sessionId, playerId } = socket.data;
        if (!sessionId || !playerId) {
          return ack({ ok: false, code: ErrorCodes.NOT_AUTHENTICATED, message: 'Not in a game' });
        }
        const engine = sessionManager.get(sessionId);
        if (!engine) {
          return ack({ ok: false, code: ErrorCodes.SESSION_NOT_FOUND, message: 'Session ended' });
        }
        if (typeof questionId !== 'string') {
          return ack({ ok: false, code: ErrorCodes.OPTION_INVALID, message: 'Malformed answer' });
        }
        const result = engine.submitAnswer(playerId, questionId, value);
        if (!result.ok) {
          return ack({ ok: false, code: result.code, message: result.message });
        }
        ack({ ok: true, acceptedValue: result.value.value });
      } catch {
        ack({ ok: false, code: ErrorCodes.INTERNAL, message: 'Could not submit' });
      }
    });

    // ---------------------------------------------------------- disconnect
    socket.on('disconnect', () => {
      const { sessionId, playerId, role } = socket.data;
      if (role === 'player' && sessionId && playerId) {
        const engine = sessionManager.get(sessionId);
        if (engine) {
          sessionManager.setConnected(engine, playerId, false);
          engine.broadcastLobby();
        }
      }
    });
  });
}

function bindPlayerSocket(
  socket: TypedSocket,
  sessionId: string,
  playerId: string,
): void {
  socket.data.role = 'player';
  socket.data.sessionId = sessionId;
  socket.data.playerId = playerId;
  void socket.join(sessionManager.rooms.all(sessionId));
  void socket.join(sessionManager.rooms.player(playerId));
}

function runHostAction(
  engine: ReturnType<typeof sessionManager.get> & object,
  action: HostAction,
) {
  const e = engine as NonNullable<ReturnType<typeof sessionManager.get>>;
  switch (action) {
    case 'START':
      return e.startGame();
    case 'SKIP':
      return e.skip();
    case 'NEXT':
      return e.next();
    case 'END':
      return e.end();
    default:
      return { ok: false as const, code: ErrorCodes.INVALID_TRANSITION, message: 'Unknown action' };
  }
}
