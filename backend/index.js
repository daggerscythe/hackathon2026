const http    = require("http");
const express = require("express");
const path    = require("path");
const os = require("os");
const { server: WebSocketServer } = require("websocket");

// ── HTTP server (serves static game files) ────────────────────────────────
const app      = express();
const rootPath = path.join(__dirname, "..");
const uiPath   = path.join(__dirname, "../UI");
const gamePath = path.join(__dirname, "../game");

app.use(express.static(uiPath));                         // UI/    → menu.html, pinCode.html, etc.
app.use(express.static(gamePath));                       // game/  → game.js at /game.js
app.use(express.static(rootPath, { index: false }));     // root/  → index.html only when explicitly requested, never as default

app.get("/", (req, res) => {
  res.sendFile(path.join(uiPath, "menu.html"));
});
function getLocalIp() {
  const nets = os.networkInterfaces();

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      const isIPv4 = net.family === "IPv4" || net.family === 4;
      if (isIPv4 && !net.internal) {
        return net.address;
      }
    }
  }

  return "localhost";
}

const PORT = 9091;
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  const localIp = getLocalIp();

  console.log(`HTTP  → http://localhost:${PORT}`);
  console.log(`LAN   → http://${localIp}:${PORT}`);
});
// ── WebSocket server ──────────────────────────────────────────────────────
const httpServer = http.createServer();
httpServer.listen(9090, () => console.log("WebSocket → ws://localhost:9090"));

const wsServer = new WebSocketServer({ httpServer });

// clientId → { connection, username }
const clients = {};
// gameId (4-char PIN) → { id, players: [{clientId, username, color}] }
const games = {};

const COLORS      = ["Red", "Green", "Blue", "Yellow"];
const MAX_PLAYERS = 4;
const MIN_START   = 2;

// ── Helper: send JSON to a single connection ──────────────────────────────
function send(conn, payload) {
  try { conn.send(JSON.stringify(payload)); } catch {}
}

// ── Helper: send JSON to everyone in a game ───────────────────────────────
function broadcast(game, payload) {
  game.players.forEach(p => {
    const c = clients[p.clientId];
    if (c) send(c.connection, payload);
  });
}

// ── Helper: strip internal clientIds before sending to browsers ───────────
function publicGame(game) {
  return {
    id:      game.id,
    players: game.players.map(p => ({ username: p.username, color: p.color, ready: p.ready, character: p.character })),
  };
}

// ── Helper: generate a random 4-character room PIN ────────────────────────
function makePin() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/1/0 confusion
  let pin;
  do {
    pin = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (games[pin]); // ensure uniqueness
  return pin;
}

// ── Helper: generate a unique client ID ──────────────────────────────────
function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

// ── WebSocket connections ─────────────────────────────────────────────────
wsServer.on("request", request => {
  const conn     = request.accept(null, request.origin);
  const clientId = makeId();
  clients[clientId] = { connection: conn, username: null };

  // Tell the browser its assigned ID immediately
  send(conn, { method: "connect", clientId });

  // ── Disconnect: clean up the client from any game they were in ──────────
  conn.on("close", () => {
    for (const game of Object.values(games)) {
      const before = game.players.length;
      game.players = game.players.filter(p => p.clientId !== clientId);
      if (game.players.length !== before) {
        broadcast(game, { method: "playerLeft", game: publicGame(game) });
      }
    }
    delete clients[clientId];
  });

  // ── Incoming messages ────────────────────────────────────────────────────
  // Use `clientId` from the closure — never trust the payload's clientId.
  conn.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.utf8Data); } catch { return; }

    const { method, username } = msg;
    const client = clients[clientId]; // closure ID, always valid
    if (!client) return;

    // Save username whenever it arrives
    if (username) client.username = username;

    // ── CREATE: host starts a new room ──────────────────────────────────
    if (method === "create") {
      const pin   = makePin();
      const color = COLORS[0];
      games[pin]  = { id: pin, players: [{ clientId, username: client.username || "Host", color, ready: false, character: null }] };

      const pg = publicGame(games[pin]);
      send(conn, { method: "create", gameId: pin, game: pg });
      send(conn, { method: "join",   gameId: pin, game: pg, yourColor: color });
    }

    // ── JOIN: player joins with a PIN ───────────────────────────────────
    if (method === "join") {
      const pin  = (msg.gameId || "").trim().toUpperCase();
      const game = games[pin];

      if (!game) {
        send(conn, { method: "error", message: "Room not found. Check the code and try again." });
        return;
      }
      if (game.players.length >= MAX_PLAYERS) {
        send(conn, { method: "error", message: "This room is full (6/6 players)." });
        return;
      }
      if (game.players.find(p => p.clientId === clientId)) {
        send(conn, { method: "error", message: "You are already in this game." });
        return;
      }

      const color = COLORS[game.players.length];
      game.players.push({ clientId, username: client.username || `Player ${game.players.length + 1}`, color, ready: false, character: null });

      const pg = publicGame(game);
      broadcast(game, { method: "join",   gameId: pin, game: pg });
      send(conn,       { method: "joined", gameId: pin, game: pg, yourColor: color });
    }

    // ── READY: toggle ready + save Hero/Villain choice ───────────────────
    if (method === "ready") {
      const game = games[msg.gameId];
      if (!game) return;
      const player = game.players.find(p => p.clientId === clientId);
      if (!player) return;

      player.ready     = !player.ready;
      player.character = msg.character || player.character;

      const pg = publicGame(game);
      broadcast(game, { method: "ready", game: pg });
    }

    // ── START: host force-start override ────────────────────────────────
    if (method === "start") {
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

      broadcast(game, { method: 'start', game: publicGame(game) });
    }

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
    }
  });
});