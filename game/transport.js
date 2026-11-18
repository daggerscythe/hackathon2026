// ============================================
// TRANSPORT — how the arena talks to other players
//
//   Net.isMultiplayer      — false in solo mode (everything stays local)
//   Net.connect()          — open the connection (multiplayer only)
//   Net.send(method, data) — fire-and-forget message to the other players
//   Net.on(method, fn)     — handle an incoming message
//
// Solo mode uses no transport at all, so the arena runs as plain static
// files (itch.io, GitHub Pages). Multiplayer uses a WebSocket relay; a
// different transport (e.g. WebRTC) only needs the same open/send/onmessage shape.
// ============================================
const Net = (() => {
  const mode     = sessionStorage.getItem('gameMode') === 'multiplayer' ? 'multiplayer' : 'solo';
  const gameId   = sessionStorage.getItem('gameId');
  const handlers = {};
  let transport  = null;

  function createWebSocketTransport(url, onOpen, onMessage) {
    const socket = new WebSocket(url);
    socket.onopen    = onOpen;
    socket.onerror   = (e) => console.error('[Net] WebSocket error', e);
    socket.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      onMessage(msg);
    };
    return {
      send(obj) { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj)); },
      get isOpen() { return socket.readyState === WebSocket.OPEN; },
    };
  }

  function dispatch(msg) {
    const fn = handlers[msg.method];
    if (fn) fn(msg);
  }

  function send(method, payload = {}) {
    if (transport) transport.send({ method, clientId: LOCAL_ID, gameId, ...payload });
  }

  function connect() {
    if (mode !== 'multiplayer' || transport) return;
    const url = sessionStorage.getItem('serverUrl');
    if (!url || !gameId) return;
    transport = createWebSocketTransport(
      url,
      () => send('identify', { username: sessionStorage.getItem('lobbyUsername') }),
      dispatch,
    );
  }

  function on(method, fn) {
    handlers[method] = fn;
  }

  return { mode, isMultiplayer: mode === 'multiplayer', connect, send, on };
})();
