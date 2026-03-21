const http = require("http");
const express = require("express");
const path = require("path");
const app = express();

// Serve all game HTML/CSS files from the same directory
app.use(express.static(__dirname));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../UI/menu.html")));

app.listen(9091, () => console.log("HTTP server on http://localhost:9091"));

// ── WebSocket server ──────────────────────────────────────────────────────
const websocketServer = require("websocket").server;
const httpServer = http.createServer();
httpServer.listen(9090, () => console.log("WebSocket server on ws://localhost:9090"));

const clients = {};  // clientId → { connection, username }
const games   = {};  // gameId  → { id, clients: [{clientId, username, color}], state }

const wsServer = new websocketServer({ httpServer });

wsServer.on("request", request => {
    const connection = request.accept(null, request.origin);

    // Generate clientId immediately on connect
    const clientId = guid();
    clients[clientId] = { connection, username: null };

    // Send clientId back so the browser knows who it is
    send(connection, { method: "connect", clientId });

    connection.on("open",  () => console.log(`Client connected: ${clientId}`));
    connection.on("close", () => {
        console.log(`Client disconnected: ${clientId}`);
        // Remove from any game they were in
        for (const gameId of Object.keys(games)) {
            const game = games[gameId];
            const before = game.clients.length;
            game.clients = game.clients.filter(c => c.clientId !== clientId);
            if (game.clients.length !== before) {
                broadcastToGame(game, { method: "playerLeft", game: sanitiseGame(game) });
            }
        }
        delete clients[clientId];
    });

    connection.on("message", message => {
        let result;
        try { result = JSON.parse(message.utf8Data); }
        catch { return; }

        const { method, clientId: cId, username } = result;

        // ── create ────────────────────────────────────────────────────────
        if (method === "create") {
            // Save username
            if (username) clients[cId].username = username;

            const gameId = guid().slice(0, 4).toUpperCase();
            games[gameId] = { id: gameId, clients: [], state: {} };

            const color = COLOR_MAP[0];
            games[gameId].clients.push({ clientId: cId, username: clients[cId].username || "Host", color });

            const game = sanitiseGame(games[gameId]);
            send(clients[cId].connection, { method: "create", gameId, game });
            send(clients[cId].connection, { method: "join",   gameId, game, yourColor: color });
        }

        // ── join ──────────────────────────────────────────────────────────
        if (method === "join") {
            if (username) clients[cId].username = username;

            const gameId = (result.gameId || "").toUpperCase();
            const game   = games[gameId];

            if (!game) {
                send(clients[cId].connection, { method: "error", message: "Room not found. Check the code and try again." });
                return;
            }
            if (game.clients.length >= 6) {
                send(clients[cId].connection, { method: "error", message: "This room is full (6/6 players)." });
                return;
            }
            // Prevent duplicate joins
            if (game.clients.find(c => c.clientId === cId)) {
                send(clients[cId].connection, { method: "error", message: "You are already in this game." });
                return;
            }

            const color = COLOR_MAP[game.clients.length] || "White";
            game.clients.push({ clientId: cId, username: clients[cId].username || `Player ${game.clients.length + 1}`, color });

            const sanitised = sanitiseGame(game);
            // Tell everyone about the updated lobby
            broadcastToGame(game, { method: "join", gameId, game: sanitised });
            // Tell the new joiner their own color
            send(clients[cId].connection, { method: "joined", gameId, game: sanitised, yourColor: color });
        }

        // ── play ──────────────────────────────────────────────────────────
        if (method === "play") {
            const game = games[result.gameId];
            if (!game) return;
            game.state[result.ballId] = result.color;
        }

        // ── start (host starts the game) ──────────────────────────────────
        if (method === "start") {
            const game = games[result.gameId];
            if (!game) return;
            // Only the host (first client) can start
            if (game.clients[0]?.clientId !== cId) return;
            broadcastToGame(game, { method: "start", game: sanitiseGame(game) });
        }
    });
});

// ── Helpers ───────────────────────────────────────────────────────────────
const COLOR_MAP = ["Red", "Green", "Blue", "Yellow", "Purple", "Orange"];

function send(connection, payload) {
    try { connection.send(JSON.stringify(payload)); } catch {}
}

function broadcastToGame(game, payload) {
    game.clients.forEach(c => {
        const client = clients[c.clientId];
        if (client) send(client.connection, payload);
    });
}

// Strip internal clientIds before sending to browsers
function sanitiseGame(game) {
    return {
        id: game.id,
        state: game.state,
        players: game.clients.map(c => ({
            username: c.username,
            color:    c.color
        }))
    };
}

// ── Game state broadcast loop ─────────────────────────────────────────────
function updateGameState() {
    for (const gameId of Object.keys(games)) {
        const game = games[gameId];
        if (game.clients.length > 0) {
            broadcastToGame(game, { method: "update", game: sanitiseGame(game) });
        }
    }
    setTimeout(updateGameState, 1000);
}
updateGameState();

// ── GUID ──────────────────────────────────────────────────────────────────
function S4() { return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1); }
const guid = () => (S4()+S4()+"-"+S4()+"-4"+S4().substr(0,3)+"-"+S4()+"-"+S4()+S4()+S4()).toLowerCase();