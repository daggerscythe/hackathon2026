import { WebSocketServer } from 'ws';
import os from 'node:os';
import { decode, encode, MsgType, Role } from '@hack/shared';

/**
 * @typedef {{ id:string, name:string, role:string, classId: string|null, confirmed: boolean, ready:boolean, ws: import('ws').WebSocket }} Player
 */

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `p_${Math.random().toString(16).slice(2)}`;
}

const HERO_CLASSES = /** @type {const} */ (['hero:tank', 'hero:dps', 'hero:support', 'hero:mage']);
const VILLAIN_CLASSES = /** @type {const} */ (['villain:mage', 'villain:brute', 'villain:agile']);

function isAllowedClassId(classId) {
  return HERO_CLASSES.includes(classId) || VILLAIN_CLASSES.includes(classId);
}

function classToRole(classId) {
  return HERO_CLASSES.includes(classId) ? Role.HERO : Role.VILLAIN;
}

function getHostUrls(port) {
  /** @type {string[]} */
  const ips = [];
  const nets = os.networkInterfaces();

  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const e of entries) {
      if (!e) continue;
      if (e.family !== 'IPv4') continue;
      if (e.internal) continue;
      if (typeof e.address !== 'string' || e.address.length === 0) continue;
      ips.push(e.address);
    }
  }

  const uniqueIps = Array.from(new Set(ips)).sort();
  const urls = uniqueIps.map((ip) => `ws://${ip}:${port}`);
  urls.unshift(`ws://localhost:${port}`);
  return urls;
}

export function createGameServer({ port = 8080, countdownSeconds = 10 } = {}) {
  const wss = new WebSocketServer({ port });
  /** @type {Map<string, Player>} */
  const players = new Map();

  const hostUrls = getHostUrls(port);

  /** @type {string | null} */
  let hostId = null;
  let matchStarted = false;
  let gameStarted = false;
  /** @type {number | null} */
  let countdownEndsAt = null;
  /** @type {NodeJS.Timeout | null} */
  let countdownTimer = null;

  function ensureHost() {
    if (hostId && players.has(hostId)) return;
    const first = players.values().next();
    hostId = first.done ? null : first.value.id;
  }

  function activePlayers() {
    return Array.from(players.values()).filter((p) => p.role !== Role.SPECTATOR);
  }

  function confirmedActivePlayers() {
    return activePlayers().filter((p) => p.confirmed);
  }

  function confirmedVillainExists() {
    return Array.from(players.values()).some((p) => p.confirmed && p.role === Role.VILLAIN);
  }

  function confirmedHeroesCount() {
    return Array.from(players.values()).filter((p) => p.confirmed && p.role === Role.HERO).length;
  }

  function classTaken(classId) {
    return Array.from(players.values()).some((p) => p.confirmed && p.classId === classId);
  }

  function lobbyState() {
    ensureHost();
    return {
      maxPlayers: 4,
      hostId,
      matchStarted,
      countdownEndsAt: countdownEndsAt ?? undefined,
      gameStarted,
      players: Array.from(players.values()).map(lobbyPlayerState),
    };
  }

  function broadcast(type, payload) {
    const msg = encode({ type, ...payload });
    for (const p of players.values()) {
      p.ws.send(msg);
    }
  }

  function maybeStartCountdown() {
    if (!matchStarted) return;
    if (gameStarted) return;
    if (countdownEndsAt) return;

    const confirmed = confirmedActivePlayers();
    if (confirmed.length !== 4) return;

    const ms = Math.max(0, Math.floor(countdownSeconds * 1000));
    countdownEndsAt = Date.now() + ms;
    broadcast(MsgType.COUNTDOWN, { endsAt: countdownEndsAt });
    broadcastLobby();

    countdownTimer = setTimeout(() => {
      gameStarted = true;
      broadcast(MsgType.GAME_BEGIN, {});
      broadcastLobby();
    }, ms);
  }

  function lobbyPlayerState(p) {
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      ready: p.ready,
      classId: p.classId ?? undefined,
      confirmed: p.confirmed ? true : undefined,
    };
  }

  function broadcastLobby() {
    const msg = encode({ type: MsgType.LOBBY, lobby: lobbyState() });
    for (const p of players.values()) {
      p.ws.send(msg);
    }
  }

  wss.on('connection', (ws) => {
    const playerId = makeId();

    /** @type {Player} */
    const player = {
      id: playerId,
      name: 'Anonymous',
      role: Role.SPECTATOR,
      classId: null,
      confirmed: false,
      ready: false,
      ws,
    };
    players.set(playerId, player);
    ensureHost();

    ws.on('message', (data) => {
      const raw = typeof data === 'string' ? data : data.toString('utf8');
      const res = decode(raw);
      if (!res.ok) {
        ws.send(encode({ type: MsgType.ERROR, message: res.error }));
        return;
      }

      const msg = res.data;
      if (msg.type === MsgType.JOIN) {
        player.name = msg.name.slice(0, 24);
        const activeCount = activePlayers().filter((p) => p.id !== player.id).length;
        player.role = activeCount < 4 ? Role.UNASSIGNED : Role.SPECTATOR;
        player.ready = false;
        player.classId = null;
        player.confirmed = false;

        if (!hostId) hostId = player.id;
        ensureHost();

        ws.send(
          encode({
            type: MsgType.WELCOME,
            playerId: player.id,
            role: player.role,
            lobby: lobbyState(),
            hostUrls,
          })
        );

        broadcastLobby();
      }

      if (msg.type === MsgType.READY) {
        if (matchStarted) {
          ws.send(encode({ type: MsgType.ERROR, message: 'match already started' }));
          return;
        }

        player.ready = msg.ready;
        broadcastLobby();
      }

      if (msg.type === MsgType.PICK) {
        if (!matchStarted) {
          ws.send(encode({ type: MsgType.ERROR, message: 'match not started' }));
          return;
        }
        if (gameStarted) {
          ws.send(encode({ type: MsgType.ERROR, message: 'game already started' }));
          return;
        }
        if (player.role === Role.SPECTATOR) {
          ws.send(encode({ type: MsgType.ERROR, message: 'spectator cannot pick' }));
          return;
        }
        if (player.confirmed) {
          ws.send(encode({ type: MsgType.ERROR, message: 'already confirmed' }));
          return;
        }
        const classId = msg.classId.trim();
        if (!isAllowedClassId(classId)) {
          ws.send(encode({ type: MsgType.ERROR, message: 'invalid class' }));
          return;
        }

        const desiredRole = classToRole(classId);
        const heroesConfirmed = confirmedHeroesCount();
        const villainConfirmed = confirmedVillainExists();

        if (desiredRole === Role.HERO && heroesConfirmed >= 3) {
          ws.send(encode({ type: MsgType.ERROR, message: 'heroes already full' }));
          return;
        }
        if (desiredRole === Role.VILLAIN && villainConfirmed) {
          ws.send(encode({ type: MsgType.ERROR, message: 'villain already taken' }));
          return;
        }
        if (desiredRole === Role.HERO && classTaken(classId)) {
          ws.send(encode({ type: MsgType.ERROR, message: 'class already taken' }));
          return;
        }
        if (desiredRole === Role.VILLAIN && classTaken(classId)) {
          ws.send(encode({ type: MsgType.ERROR, message: 'class already taken' }));
          return;
        }

        player.role = desiredRole;
        player.classId = classId;
        player.confirmed = true;

        broadcastLobby();
        maybeStartCountdown();
      }

      if (msg.type === MsgType.START) {
        ensureHost();
        if (!hostId || player.id !== hostId) {
          ws.send(encode({ type: MsgType.ERROR, message: 'only host can start' }));
          return;
        }
        if (matchStarted) {
          ws.send(encode({ type: MsgType.ERROR, message: 'match already started' }));
          return;
        }
        if (gameStarted) {
          ws.send(encode({ type: MsgType.ERROR, message: 'game already started' }));
          return;
        }

        const active = activePlayers();
        if (active.length !== 4) {
          ws.send(encode({ type: MsgType.ERROR, message: 'need 4 active players to start' }));
          return;
        }
        if (!active.every((p) => p.ready)) {
          ws.send(encode({ type: MsgType.ERROR, message: 'all players must be ready' }));
          return;
        }

        matchStarted = true;
        gameStarted = false;
        countdownEndsAt = null;
        if (countdownTimer) {
          clearTimeout(countdownTimer);
          countdownTimer = null;
        }

        const spawnPoints = [
          { x: -2, z: 0 },
          { x: 2, z: 0 },
          { x: 0, z: -2 },
          { x: 0, z: 2 },
        ];
        const seed = Math.floor(Math.random() * 1_000_000_000);
        const spawns = active.map((p, i) => ({ id: p.id, x: spawnPoints[i]?.x ?? 0, z: spawnPoints[i]?.z ?? 0 }));

        const startMsg = encode({ type: MsgType.MATCH_START, seed, spawns });
        for (const p of players.values()) {
          p.ws.send(startMsg);
        }
        broadcastLobby();
      }

      // Input handling + simulation loop will be added later.
    });

    ws.on('close', () => {
      players.delete(playerId);
      ensureHost();

      // If someone leaves before the game begins, reset countdown.
      // (Simple behavior: require 4 confirmed again.)
      if (!gameStarted && countdownEndsAt) {
        countdownEndsAt = null;
        if (countdownTimer) {
          clearTimeout(countdownTimer);
          countdownTimer = null;
        }
      }

      broadcastLobby();
    });

    ws.on('error', () => {
      // ignore; close will handle cleanup
    });
  });

  return {
    port,
    wss,
    close: () => new Promise((resolve) => wss.close(() => resolve())),
  };
}
