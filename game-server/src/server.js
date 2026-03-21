import { WebSocketServer } from 'ws';
import os from 'node:os';
import { decode, encode, MsgType, Role } from '@hack/shared';

/**
 * @typedef {{ id:string, name:string, role:string, ready:boolean, ws: import('ws').WebSocket }} Player
 */

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `p_${Math.random().toString(16).slice(2)}`;
}

function assignRole(existingPlayers) {
  const heroes = existingPlayers.filter((p) => p.role === Role.HERO).length;
  const villains = existingPlayers.filter((p) => p.role === Role.VILLAIN).length;

  if (heroes < 3) return Role.HERO;
  if (villains < 1) return Role.VILLAIN;
  return Role.SPECTATOR;
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

export function createGameServer({ port = 8080 } = {}) {
  const wss = new WebSocketServer({ port });
  /** @type {Map<string, Player>} */
  const players = new Map();

  const hostUrls = getHostUrls(port);

  /** @type {string | null} */
  let hostId = null;
  let matchStarted = false;

  function ensureHost() {
    if (hostId && players.has(hostId)) return;
    const first = players.values().next();
    hostId = first.done ? null : first.value.id;
  }

  function activePlayers() {
    return Array.from(players.values()).filter((p) => p.role !== Role.SPECTATOR);
  }

  function lobbyState() {
    ensureHost();
    return {
      maxPlayers: 4,
      hostId,
      matchStarted,
      players: Array.from(players.values()).map((p) => ({ id: p.id, name: p.name, role: p.role, ready: p.ready })),
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
    const player = { id: playerId, name: 'Anonymous', role: Role.SPECTATOR, ready: false, ws };
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
        player.role = assignRole(Array.from(players.values()).filter((p) => p.id !== player.id));
        player.ready = false;

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
