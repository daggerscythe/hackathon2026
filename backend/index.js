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
httpServer.listen(9090, "0.0.0.0", () => {
  const localIp = getLocalIp();
  console.log("WebSocket → ws://localhost:9090");
  console.log(`WS LAN   → ws://${localIp}:9090`);
});

const wsServer = new WebSocketServer({ httpServer });

// clientId → { connection, username }
const clients = {};
// gameId (4-char PIN) → { id, players: [{clientId, username, color}] }
const games = {};

const COLORS      = ["Red", "Green", "Blue", "Yellow"];
const MAX_PLAYERS = 4;
const MIN_START   = 2;

const BASE_HEALTH = 100;
const BASE_DAMAGE = 10;
const MELEE_RANGE = 4;

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function normalizeCharacter(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const role = raw.role === 'villain' ? 'villain' : 'hero';
  const cls  = String(raw.cls || '').trim() || (role === 'villain' ? 'brute' : 'tank');
  const name = String(raw.name || '').trim() || 'Player';

  // UI sends 0-100; game.js normalizes by /100. We'll normalize to 0-1 here.
  const str = clamp01((raw.str ?? raw.strength ?? 70) / 100);
  const mag = clamp01((raw.mag ?? raw.magic ?? 60) / 100);
  const def = clamp01((raw.def ?? raw.defense ?? 30) / 100);
  const spd = clamp01((raw.spd ?? raw.speed ?? 50) / 100);
  const pow = clamp01((raw.pow ?? raw.power ?? 40) / 100);

  return { role, cls, name, str, mag, def, spd, pow };
}

function spawnPosition(i, count) {
  const radius = 10;
  const angle = (i / Math.max(1, count)) * Math.PI * 2;
  return { x: Math.cos(angle) * radius, y: 2, z: Math.sin(angle) * radius };
}

function ensureRuntime(game) {
  if (game.runtime) return game.runtime;
  game.runtime = { players: {} };
  return game.runtime;
}

function publicState(game) {
  const runtime = game.runtime;
  if (!runtime) return [];

  return Object.values(runtime.players).map(p => ({
    clientId:  p.clientId,
    username:  p.username,
    character: p.character,
    position:  p.position,
    rotation:  p.rotation,
    health:    p.health,
    maxHealth: p.maxHealth,
  }));
}

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
  let connClientId = makeId();
  clients[connClientId] = { connection: conn, username: null };

  // Tell the browser its assigned ID immediately
  send(conn, { method: "connect", clientId: connClientId });

  // ── Disconnect: clean up the client from any game they were in ──────────
  conn.on("close", () => {
    for (const game of Object.values(games)) {
      const before = game.players.length;
      game.players = game.players.filter(p => p.clientId !== connClientId);
      if (game.players.length !== before) {
        if (game.runtime) {
          delete game.runtime.players[connClientId];
        }
        broadcast(game, { method: "playerLeft", clientId: connClientId, game: publicGame(game) });
      }
    }
    delete clients[connClientId];
  });

  // ── Incoming messages ────────────────────────────────────────────────────
  // Use `clientId` from the closure — never trust the payload's clientId.
  conn.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.utf8Data); } catch { return; }

    const { method, username } = msg;
    const client = clients[connClientId]; // connection's current id
    if (!client) return;

    // Save username whenever it arrives
    if (username) client.username = username;

    // ── CREATE: host starts a new room ──────────────────────────────────
    if (method === "create") {
      const pin   = makePin();
      const color = COLORS[0];
      games[pin]  = { id: pin, players: [{ clientId: connClientId, username: client.username || "Host", color, ready: false, character: null }] };

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
      if (game.players.find(p => p.clientId === connClientId)) {
        send(conn, { method: "error", message: "You are already in this game." });
        return;
      }

      const color = COLORS[game.players.length];
      game.players.push({ clientId: connClientId, username: client.username || `Player ${game.players.length + 1}`, color, ready: false, character: null });

      const pg = publicGame(game);
      broadcast(game, { method: "join",   gameId: pin, game: pg });
      send(conn,       { method: "joined", gameId: pin, game: pg, yourColor: color });
    }

    // ── READY: toggle ready + save Hero/Villain choice ───────────────────
    if (method === "ready") {
      const game = games[msg.gameId];
      if (!game) return;
      const player = game.players.find(p => p.clientId === connClientId);
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
      if (game.players[0]?.clientId !== connClientId) {
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

      // Initialize authoritative runtime state (positions + HP + stats)
      const runtime = ensureRuntime(game);
      game.players.forEach((p, idx) => {
        const character = normalizeCharacter(p.character) || {
          role: 'hero', cls: 'tank', name: p.username || 'Player', str: 0.7, mag: 0.6, def: 0.3, spd: 0.5, pow: 0.4,
        };

        runtime.players[p.clientId] = {
          clientId:  p.clientId,
          username:  p.username,
          character,
          position:  spawnPosition(idx, game.players.length),
          rotation:  { y: 0 },
          health:    BASE_HEALTH,
          maxHealth: BASE_HEALTH,
          isAlive:   true,
        };
      });

      broadcast(game, { method: 'start', game: publicGame(game) });
    }

    if (method === 'identify') {
      const existingId = msg.clientId;
      const gameId     = msg.gameId;

      if (!existingId) return;

      // re-register this connection under the original clientId
      if (clients[existingId]) {
        clients[existingId].connection = conn;
        if (msg.username) clients[existingId].username = msg.username;
      } else {
        clients[existingId] = { connection: conn, username: msg.username || client.username };
      }

      // remove the temp id assigned to this new page load
      if (connClientId !== existingId) {
        delete clients[connClientId];
        connClientId = existingId;
      }

      // If a gameId was provided, ensure the player exists in the game.
      if (gameId) {
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
            if (msg.username) alreadyIn.username = msg.username;
          }

          console.log(`Player ${existingId} re-identified in game ${gameId}`);

          // If the match has started, send a full snapshot so the game page can spawn correctly.
          if (game.runtime) {
            send(conn, { method: 'state', gameId, players: publicState(game) });
          } else {
            // otherwise just tell this player who is in the lobby
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
      }
    }

    // ── MOVE: relay position to everyone else in the game ───────────────
    if (method === 'playerMove') {
      const game = games[msg.gameId];
      if (!game) return;

      if (game.runtime && game.runtime.players[connClientId]) {
        const p = game.runtime.players[connClientId];
        if (msg.position) p.position = msg.position;
        if (msg.rotation) p.rotation = msg.rotation;
      }

      const payload = {
        method:   'playerMove',
        clientId: connClientId,
        gameId:   msg.gameId,
        position: msg.position,
        rotation: msg.rotation,
      };

      game.players.forEach(p => {
        if (p.clientId === connClientId) return; // skip sender
        const c = clients[p.clientId];
        if (c) send(c.connection, payload);
      });
    }

    // ── ATTACK: relay attack to everyone else ───────────────────────────
    if (method === 'playerAttack') {
      const game = games[msg.gameId];
      if (!game) return;

      if (game.runtime && game.runtime.players[connClientId]) {
        const runtime = game.runtime;
        const attacker = runtime.players[connClientId];
        const targetId = msg.targetId;
        const defender = runtime.players[targetId];

        if (!defender || defender.health <= 0 || attacker.health <= 0) return;

        const attackType = msg.attackType;

        if (attackType === 'melee') {
          const ap = attacker.position;
          const dp = defender.position;
          if (!ap || !dp) return;
          const dx = ap.x - dp.x;
          const dy = ap.y - dp.y;
          const dz = ap.z - dp.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > MELEE_RANGE) return;
        }

        const statMult = attackType === 'magic'
          ? (attacker.character?.mag ?? 0.6)
          : (attacker.character?.str ?? 0.7);

        const defense = defender.character?.def ?? 0.3;
        const rawDamage = BASE_DAMAGE * statMult;
        const damageTaken = Math.max(0.1, rawDamage * (1 - defense));

        defender.health = Math.max(0, defender.health - damageTaken);

        broadcast(game, {
          method:    'healthUpdate',
          targetId,
          health:    defender.health,
          maxHealth: defender.maxHealth,
        });

        if (defender.health <= 0) {
          defender.isAlive = false;
          broadcast(game, { method: 'playerDied', characterId: targetId, clientId: connClientId });
        }

        return;
      }

      game.players.forEach(p => {
        if (p.clientId === connClientId) return;
        const c = clients[p.clientId];
        if (c) {
          send(c.connection, {
            method:     'playerAttack',
            clientId:   connClientId,
            gameId:     msg.gameId,
            attackType: msg.attackType,
            targetId:   msg.targetId,
            damage:     msg.damage,
          });
        }
      });
    }

    // ── PLAYER DIED: relay to everyone ──────────────────────────────────
    if (method === 'playerDied') {
      const game = games[msg.gameId];
      if (!game) return;
      broadcast(game, { ...msg, clientId: connClientId });
    }
  });
});