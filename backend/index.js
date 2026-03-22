
const http    = require('http');
const express = require('express');
const path    = require('path');
const os      = require('os');
const { server: WebSocketServer } = require('websocket');

// ── HTTP ──────────────────────────────────────────────────────────────────
const app      = express();
const rootPath = path.join(__dirname, '..');
const uiPath   = path.join(__dirname, '../UI');
const gamePath = path.join(__dirname, '../game');

app.use(express.static(uiPath));
app.use(express.static(gamePath));
app.use(express.static(rootPath, { index: false }));
app.get('/', (req, res) => res.sendFile(path.join(uiPath, 'menu.html')));

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
const broadcast  = (game, p)      => game.players.forEach(pl => { const c = clients[pl.clientId]; if (c) send(c.connection, p); });

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

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
      spawnX:    p.spawnX ?? 0,   // NEW CODE
      spawnY:    p.spawnY ?? 3,   // NEW CODE
      spawnZ:    p.spawnZ ?? 0,   // NEW CODE
    })),
  };
}

// ── Helper: generate a random 4-character room PIN ────────────────────────
function makePin() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/1/0 confusion
  let pin;
  do { pin = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); }
  while (games[pin]);
  return pin;
};

wsServer.on('request', request => {
  const conn     = request.accept(null, request.origin);
  let clientId = makeId();
  clients[clientId] = { connection: conn, username: null };
  send(conn, { method: 'connect', clientId });

  conn.on('close', () => {
    for (const game of Object.values(games)) {
      const before = game.players.length;
      game.players  = game.players.filter(p => p.clientId !== clientId);
      if (game.players.length !== before) broadcast(game, { method: 'playerLeft', clientId, game: publicGame(game) });
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
      broadcast(game, { method: 'join',   gameId: pin, game: pg });
      send(conn,  { method: 'joined', gameId: pin, game: pg, yourColor: color });
    }

    if (msg.method === 'ready') {
      const game   = games[msg.gameId]; if (!game) return;
      const player = game.players.find(p => p.clientId === clientId); if (!player) return;
      player.ready     = !player.ready;
      player.character = msg.character || player.character;
      broadcast(game, { method: 'ready', game: publicGame(game) });
    }

    // ── START: host force-start override ────────────────────────────────
    if (msg.method === 'start') {
      const game = games[msg.gameId];
      if (!game) return;
      // only host can start
      if (game.players[0]?.clientId !== clientId) {
        send(conn, { method: 'error', message: 'Only the host can start the game.' });
        return;
      }

      // must have at least 2 players
      if (game.players.length < MIN_START) {
        send(conn, { method: 'error', message: 'Need at least 2 players to start.' });
        return;
      }

      // count villains
      const villainCount = game.players.filter(p => {
        const char = p.character;
        if (!char) return false;
        // handle both string 'Villain' and object { role: 'villain' }
        if (typeof char === 'string') return char === 'Villain';
        return char.role === 'villain';
      }).length;

      if (villainCount === 0) {
        send(conn, { method: 'error', message: 'Need exactly 1 villain to start.' });
        return;
      }

      if (villainCount > 1) {
        send(conn, { method: 'error', message: 'Only 1 villain allowed per game.' });
        return;
      }

      // _____________________NEW CODE_______________________
      // generate a random spawn position for each player
      // platform is centered at 0,1,0 with width/depth 30
      // keep players away from edges — use +/- 12 range
      const PLATFORM_RANGE = 12;
      game.players.forEach(p => {
        p.spawnX = (Math.random() - 0.5) * PLATFORM_RANGE * 2;
        p.spawnZ = (Math.random() - 0.5) * PLATFORM_RANGE * 2;
        p.spawnY = 3; // above platform surface (platform is at y=1, height 0.5, so top is 1.25)
        console.log(`[SPAWN] ${p.username} → x:${p.spawnX.toFixed(2)} z:${p.spawnZ.toFixed(2)}`);
      });
      // _____________________NEW CODE_______________________

      broadcast(game, { method: 'start', game: publicGame(game) });
    }

    if (msg.method === 'identify') {
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
    if (msg.method === 'playerMove') {
      const game = games[msg.gameId];
      if (!game) return;

      // use the closure clientId which is now the re-identified one
      game.players.forEach(p => {
        if (p.clientId === clientId) return;
        const c = clients[p.clientId];
        if (c) send(c.connection, { ...msg });
      });
    }

    // ── ATTACK: relay attack to everyone else ───────────────────────────
    if (msg.method === 'playerAttack') {
      const game = games[msg.gameId];
      if (!game) return;

      game.players.forEach(p => {
        if (p.clientId === clientId) return;
        const c = clients[p.clientId];
        if (c) send(c.connection, { ...msg, clientId });
      });
    }

    // ── ABILITY CAST (VFX sync): relay to everyone else ─────────────────
    if (msg.method === 'abilityCast') {
      const game = games[msg.gameId];
      if (!game) return;

      game.players.forEach(p => {
        if (p.clientId === clientId) return;
        const c = clients[p.clientId];
        if (!c) return;

        send(c.connection, {
          method:  'abilityCast',
          clientId,
          gameId:  msg.gameId,
          ability: msg.ability,
          direction: msg.direction,
        });
      });
    }

    // ── PLAYER DIED: relay to everyone ──────────────────────────────────
    if (msg.method === 'playerDied') {
      const game = games[msg.gameId];
      if (!game) return;
      broadcast(game, { ...msg, clientId });
    }

    if (msg.method === 'matchOver') {
      const game = games[msg.gameId];
      if (!game) return;
      // relay to everyone except sender
      game.players.forEach(p => {
        if (p.clientId === clientId) return;
        const c = clients[p.clientId];
        if (c) send(c.connection, { ...msg });
      });
    }
  });
});