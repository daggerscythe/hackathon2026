// ============================================================
// Slaying Goliath — multiplayer server
//
// One HTTP server serves the static game files AND the lobby /
// in-game WebSocket relay on the same port, so it can sit behind
// a single public URL (ws:// locally, wss:// behind a TLS host).
//
//   PORT=9091 node index.js
// ============================================================
const http    = require('http');
const express = require('express');
const path    = require('path');
const os      = require('os');
const { server: WebSocketServer } = require('websocket');

const PORT     = Number(process.env.PORT) || 9091;
const rootPath = path.join(__dirname, '..');

// ── HTTP ──────────────────────────────────────────────────────────────────
const app = express();
app.use(express.static(rootPath));

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets))
    for (const net of nets[name])
      if ((net.family === 'IPv4' || net.family === 4) && !net.internal) return net.address;
  return 'localhost';
}

const httpServer = http.createServer(app);
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Local -> http://localhost:${PORT}`);
  console.log(`LAN   -> http://${getLocalIp()}:${PORT}`);
});

// ── WebSocket lobby + in-game relay ───────────────────────────────────────
const wsServer = new WebSocketServer({ httpServer });

const clients = {};   // clientId → { connection, username }
const games   = {};   // pin → { id, players: [...] }
const MAX_PLAYERS = 4;
const MIN_START   = 2;
const RECONNECT_GRACE_MS = 8000;

// in-game messages the server just forwards to the other players in a room
const RELAY_TO_OTHERS = new Set(['playerMove', 'playerAttack', 'playerHeal', 'abilityCast', 'matchOver']);

const send      = (conn, p) => { try { conn.send(JSON.stringify(p)); } catch {} };
const broadcast = (game, p) => game.players.forEach(pl => { const c = clients[pl.clientId]; if (c) send(c.connection, p); });

const makeId = () => Math.random().toString(36).slice(2, 10);

function makePin() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/1/0 confusion
  let pin;
  do { pin = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); }
  while (games[pin]);
  return pin;
}

function publicGame(game) {
  return {
    id: game.id,
    players: game.players.map(p => ({
      clientId:  p.clientId,
      username:  p.username,
      ready:     p.ready,
      character: p.character,
      spawnX:    p.spawnX ?? 0,
      spawnY:    p.spawnY ?? 3,
      spawnZ:    p.spawnZ ?? 0,
    })),
  };
}

wsServer.on('request', request => {
  const conn   = request.accept(null, request.origin);
  let clientId = makeId();
  clients[clientId] = { connection: conn, username: null };
  send(conn, { method: 'connect', clientId });

  conn.on('close', () => {
    // Navigating lobby → arena closes this socket and the arena page re-binds
    // the same clientId with 'identify'. Give it a grace period before
    // treating the player as gone.
    const id = clientId;
    setTimeout(() => {
      if (clients[id] && clients[id].connection !== conn) return; // re-bound elsewhere
      for (const [pin, game] of Object.entries(games)) {
        const before = game.players.length;
        game.players = game.players.filter(p => p.clientId !== id);
        if (game.players.length !== before) broadcast(game, { method: 'playerLeft', clientId: id, game: publicGame(game) });
        if (game.players.length === 0) delete games[pin];
      }
      delete clients[id];
    }, RECONNECT_GRACE_MS);
  });

  conn.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.utf8Data); } catch { return; }
    const client = clients[clientId];
    if (!client) return;
    if (msg.username) client.username = msg.username;

    switch (msg.method) {
      case 'create': {
        const pin  = makePin();
        games[pin] = { id: pin, players: [{ clientId, username: client.username || 'Host', ready: false, character: null }] };
        const pg   = publicGame(games[pin]);
        send(conn, { method: 'create', gameId: pin, game: pg });
        send(conn, { method: 'join',   gameId: pin, game: pg });
        break;
      }

      case 'join': {
        const pin  = (msg.gameId || '').trim().toUpperCase();
        const game = games[pin];
        if (!game)                                           return send(conn, { method: 'error', message: 'Room not found.' });
        if (game.players.length >= MAX_PLAYERS)              return send(conn, { method: 'error', message: 'Room is full.' });
        if (game.players.find(p => p.clientId === clientId)) return send(conn, { method: 'error', message: 'Already in room.' });
        game.players.push({ clientId, username: client.username || `Player ${game.players.length + 1}`, ready: false, character: null });
        const pg = publicGame(game);
        broadcast(game, { method: 'join',   gameId: pin, game: pg });
        send(conn,      { method: 'joined', gameId: pin, game: pg });
        break;
      }

      case 'ready': {
        const game   = games[msg.gameId]; if (!game) return;
        const player = game.players.find(p => p.clientId === clientId); if (!player) return;
        player.ready     = !player.ready;
        player.character = msg.character || player.character;
        broadcast(game, { method: 'ready', game: publicGame(game) });
        break;
      }

      case 'start': {
        const game = games[msg.gameId];
        if (!game) return;
        if (game.players[0]?.clientId !== clientId) return send(conn, { method: 'error', message: 'Only the host can start the game.' });
        if (game.players.length < MIN_START)        return send(conn, { method: 'error', message: `Need at least ${MIN_START} players to start.` });
        if (game.players.some(p => !p.character))   return send(conn, { method: 'error', message: 'Everyone needs to pick a character.' });

        const villainCount = game.players.filter(p => p.character.role === 'villain').length;
        if (villainCount !== 1) return send(conn, { method: 'error', message: 'Need exactly 1 villain to start.' });

        // spawn positions: villain on one side of the arena, heroes spread on the other
        let heroIdx = 0;
        game.players.forEach(p => {
          if (p.character.role === 'villain') {
            p.spawnX = 0; p.spawnZ = -9;
          } else {
            p.spawnX = (heroIdx++ - 1) * 4; p.spawnZ = 9;
          }
          p.spawnY = 3;
        });

        broadcast(game, { method: 'start', game: publicGame(game) });
        break;
      }

      // the arena page opens a fresh socket — re-bind it to the lobby clientId
      case 'identify': {
        const existingId = msg.clientId;
        const game       = games[msg.gameId];
        if (!existingId || !game || !game.players.find(p => p.clientId === existingId)) return;

        if (clientId !== existingId) delete clients[clientId];
        clientId = existingId;
        clients[clientId] = { connection: conn, username: msg.username };
        break;
      }

      case 'playerDied': {
        const game = games[msg.gameId];
        if (game) broadcast(game, { ...msg, clientId });
        break;
      }

      default: {
        if (!RELAY_TO_OTHERS.has(msg.method)) return;
        const game = games[msg.gameId];
        if (!game) return;
        game.players.forEach(p => {
          if (p.clientId === clientId) return;
          const c = clients[p.clientId];
          if (c) send(c.connection, { ...msg, clientId });
        });
      }
    }
  });
});
