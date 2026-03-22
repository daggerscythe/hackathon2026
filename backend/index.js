// ============================================================
// backend/index.js
//
// Three servers:
//   9091  HTTP    static files
//   9090  WS      lobby (pinCode.html + characterSelection.html)
//                 UNCHANGED from original — WebRTC/WS lobby intact
//   2567  Colyseus authoritative game rooms
// ============================================================

const http    = require('http');
const express = require('express');
const path    = require('path');
const os      = require('os');
const { server: WebSocketServer } = require('websocket');
const { Server }    = require('colyseus');
const { ArenaRoom } = require('./ArenaRoom');

// ── HTTP ──────────────────────────────────────────────────────────────────
const app      = express();
const rootPath = path.join(__dirname, '..');
const uiPath   = path.join(__dirname, '../UI');
const gamePath = path.join(__dirname, '../game');

app.use(express.static(uiPath));
app.use(express.static(gamePath));
app.use(express.static(rootPath, { index: false }));
app.get('/', (req, res) => res.sendFile(path.join(uiPath, 'menu.html')));

// Serve Colyseus SDK from node_modules — keeps LAN play fully offline-capable
// Tries multiple possible install locations
app.get('/colyseus.js', (req, res) => {
  const fs = require('fs');
  const candidates = [
    path.resolve(__dirname, 'node_modules/@colyseus/sdk/dist/colyseus.js'),
    path.resolve(__dirname, '../node_modules/@colyseus/sdk/dist/colyseus.js'),
    path.resolve(__dirname, 'node_modules/colyseus.js/dist/colyseus.js'),
    path.resolve(__dirname, '../node_modules/colyseus.js/dist/colyseus.js'),
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (found) {
    res.sendFile(found);
  } else {
    console.warn('[Server] colyseus.js not found in node_modules. Run: npm install colyseus @colyseus/schema');
    res.status(404).send('// colyseus.js not found — run npm install colyseus @colyseus/schema');
  }
});

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets))
    for (const net of nets[name])
      if ((net.family === 'IPv4' || net.family === 4) && !net.internal) return net.address;
  return 'localhost';
}

app.listen(9091, '0.0.0.0', () => {
  console.log(`HTTP     -> http://localhost:9091`);
  console.log(`LAN      -> http://${getLocalIp()}:9091`);
});

// ── Colyseus — authoritative game server ─────────────────────────────────
const gameServer = new Server();
gameServer.define('arena', ArenaRoom);
gameServer.listen(2567, '0.0.0.0').then(() => {
  console.log(`Colyseus -> ws://localhost:2567`);
  console.log(`Colyseus -> ws://${getLocalIp()}:2567  (LAN)`);
});

// ── Lobby WebSocket — port 9090 (ORIGINAL CODE, UNTOUCHED) ───────────────
// pinCode.html and characterSelection.html connect here.
// Do not modify — this serves the existing lobby flow.

const lobbyHttp = http.createServer();
lobbyHttp.listen(9090, () => console.log('Lobby WS -> ws://localhost:9090'));
const wsServer  = new WebSocketServer({ httpServer: lobbyHttp });

const clients = {};
const games   = {};
const COLORS      = ['Red', 'Green', 'Blue', 'Yellow'];
const MAX_PLAYERS = 4;
const MIN_START   = 2;

const send   = (conn, p)      => { try { conn.send(JSON.stringify(p)); } catch {} };
const bcast  = (game, p)      => game.players.forEach(pl => { const c = clients[pl.clientId]; if (c) send(c.connection, p); });

const publicGame = game => ({
  id:      game.id,
  players: game.players.map(p => ({
    clientId:  p.clientId,
    username:  p.username,
    color:     p.color,
    ready:     p.ready,
    character: p.character,
  })),
});

<<<<<<< HEAD
// ── Helper: strip internal clientIds before sending to browsers ───────────
function publicGame(game) {
  return {
    id:      game.id,
    players: game.players.map(p => ({
      clientId:  p.clientId,  // add this
      username:  p.username,
      color:     p.color,
      ready:     p.ready,
      character: p.character,
    })),
  };
}

// ── Helper: generate a random 4-character room PIN ────────────────────────
function makePin() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/1/0 confusion
=======
const makePin = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
>>>>>>> 6d7de8c (maybe something)
  let pin;
  do { pin = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); }
  while (games[pin]);
  return pin;
};

wsServer.on('request', request => {
  const conn     = request.accept(null, request.origin);
<<<<<<< HEAD
  let clientId = makeId();
=======
  const clientId = Math.random().toString(36).slice(2, 10);
>>>>>>> 6d7de8c (maybe something)
  clients[clientId] = { connection: conn, username: null };
  send(conn, { method: 'connect', clientId });

  conn.on('close', () => {
    for (const game of Object.values(games)) {
      const before = game.players.length;
      game.players  = game.players.filter(p => p.clientId !== clientId);
      if (game.players.length !== before) bcast(game, { method: 'playerLeft', clientId, game: publicGame(game) });
    }
    delete clients[clientId];
  });

  conn.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.utf8Data); } catch { return; }
    const client = clients[clientId];
    if (!client) return;
    if (msg.username) client.username = msg.username;

    if (msg.method === 'create') {
      const pin  = makePin();
      games[pin] = { id: pin, players: [{ clientId, username: client.username || 'Host', color: COLORS[0], ready: false, character: null }] };
      const pg   = publicGame(games[pin]);
      send(conn, { method: 'create', gameId: pin, game: pg });
      send(conn, { method: 'join',   gameId: pin, game: pg, yourColor: COLORS[0] });
    }

    if (msg.method === 'join') {
      const pin  = (msg.gameId || '').trim().toUpperCase();
      const game = games[pin];
      if (!game)                                           { send(conn, { method: 'error', message: 'Room not found.' }); return; }
      if (game.players.length >= MAX_PLAYERS)              { send(conn, { method: 'error', message: 'Room is full.' }); return; }
      if (game.players.find(p => p.clientId === clientId)) { send(conn, { method: 'error', message: 'Already in room.' }); return; }
      const color = COLORS[game.players.length];
      game.players.push({ clientId, username: client.username || `Player ${game.players.length + 1}`, color, ready: false, character: null });
      const pg = publicGame(game);
      bcast(game, { method: 'join',   gameId: pin, game: pg });
      send(conn,  { method: 'joined', gameId: pin, game: pg, yourColor: color });
    }

    if (msg.method === 'ready') {
      const game   = games[msg.gameId]; if (!game) return;
      const player = game.players.find(p => p.clientId === clientId); if (!player) return;
      player.ready     = !player.ready;
      player.character = msg.character || player.character;
      bcast(game, { method: 'ready', game: publicGame(game) });
    }

    if (msg.method === 'start') {
      const game = games[msg.gameId]; if (!game) return;
      if (game.players[0]?.clientId !== clientId) { send(conn, { method: 'error', message: 'Only host can start.' }); return; }
      if (game.players.length < MIN_START)         { send(conn, { method: 'error', message: 'Need at least 2 players.' }); return; }
      const vc = game.players.filter(p => p.character?.role === 'villain').length;
      if (vc === 0) { send(conn, { method: 'error', message: 'Need 1 villain.' }); return; }
      if (vc > 1)   { send(conn, { method: 'error', message: 'Only 1 villain allowed.' }); return; }
      bcast(game, { method: 'start', game: publicGame(game) });
    }

<<<<<<< HEAD
    if (method === 'identify') {
      const existingId = msg.clientId;
      const gameId     = msg.gameId;

      if (!existingId || !gameId) return;

      // re-register this connection under the original clientId
      if (clients[existingId]) {
        // update existing entry with new connection
        clients[existingId].connection = conn;
      } else {
        // first time seeing this clientId on this connection
        clients[existingId] = { connection: conn, username: msg.username };
      }

      // remove the temp clientId assigned on connect
      if (clientId !== existingId) {
        delete clients[clientId];
        clientId = existingId;
      }

      // make sure this player is in the game's player list
      const game = games[gameId];
      if (game) {
        const alreadyIn = game.players.find(p => p.clientId === existingId);
        if (!alreadyIn) {
          game.players.push({
            clientId: existingId,
            username: msg.username || existingId,
            color:    'White',
            ready:    true,
            character: null,
          });
        } else {
          // update connection reference
          alreadyIn.clientId = existingId;
        }

        console.log(`Player ${existingId} re-identified in game ${gameId}`);

        // tell this player about everyone else currently in the game
        // so they can spawn remote entities immediately
        send(conn, {
          method:  'gameState',
          players: game.players
            .filter(p => p.clientId !== existingId)
            .map(p => ({
              clientId:  p.clientId,
              username:  p.username,
              character: p.character,
            })),
        });
      }
    }

    // ── MOVE: relay position to everyone else in the game ───────────────
    if (method === 'playerMove') {
      const game = games[msg.gameId];
      if (!game) return;

      // use the closure clientId which is now the re-identified one
      game.players.forEach(p => {
        if (p.clientId === msg.clientId) return; // skip sender
        const c = clients[p.clientId];
        if (c) send(c.connection, { ...msg });
      });
    }

    // ── ATTACK: relay attack to everyone else ───────────────────────────
    if (method === 'playerAttack') {
      const game = games[msg.gameId];
      if (!game) return;

      game.players.forEach(p => {
        if (p.clientId === clientId) return;
        const c = clients[p.clientId];
        if (c) send(c.connection, { ...msg, clientId });
      });
    }

    // ── PLAYER DIED: relay to everyone ──────────────────────────────────
    if (method === 'playerDied') {
      const game = games[msg.gameId];
      if (!game) return;
      broadcast(game, { ...msg, clientId });
=======
    // identify — used by characterSelection.html (re-register connection)
    if (msg.method === 'identify') {
      const eid = msg.clientId;
      if (!eid) return;
      if (clients[eid]) { clients[eid].connection = conn; }
      else { clients[eid] = { connection: conn, username: msg.username }; }
      if (clientId !== eid) delete clients[clientId];
>>>>>>> 6d7de8c (maybe something)
    }
  });
});