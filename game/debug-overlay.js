// ============================================================
// game/debug-overlay.js
//
// Drop this into index.html: <script src="game/debug-overlay.js"></script>
// Shows a live HUD in the corner with:
//   - Colyseus connection status + room ID
//   - Every player the server knows about (sessionId, role, pos, health)
//   - Whether their A-Frame entity exists in the DOM
//   - sessionStorage values network.js depends on
//   - Any errors caught during connection
// ============================================================

(function () {
  // ── Build the overlay DOM ──────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'debug-overlay';
  panel.style.cssText = `
    position: fixed;
    top: 12px; left: 12px;
    width: 340px;
    max-height: 90vh;
    overflow-y: auto;
    background: rgba(0,0,0,0.82);
    color: #00ff99;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.5;
    padding: 10px 12px;
    border: 1px solid #00ff9944;
    border-radius: 4px;
    z-index: 9999;
    pointer-events: none;
    white-space: pre-wrap;
    word-break: break-all;
  `;
  document.body.appendChild(panel);

  // Toggle with backtick key so it doesn't get in the way during play
  let visible = true;
  window.addEventListener('keydown', e => {
    if (e.code === 'Backquote') {
      visible = !visible;
      panel.style.display = visible ? 'block' : 'none';
    }
  });

  // ── Log buffer for errors / events ────────────────────────────────────
  const logs = [];
  function dbgLog(msg, color = '#ffcc00') {
    const ts = new Date().toLocaleTimeString('en', { hour12: false });
    logs.push(`<span style="color:${color}">[${ts}] ${msg}</span>`);
    if (logs.length > 12) logs.shift();
  }

  // Intercept console.error and console.warn so we see them in the overlay
  const _cerr = console.error.bind(console);
  const _cwarn = console.warn.bind(console);
  console.error = (...args) => { dbgLog('ERR: ' + args.join(' '), '#ff4444'); _cerr(...args); };
  console.warn  = (...args) => { dbgLog('WRN: ' + args.join(' '), '#ffaa00'); _cwarn(...args); };

  // ── Helpers ────────────────────────────────────────────────────────────
  function row(label, value, ok) {
    const color = ok === true ? '#00ff99' : ok === false ? '#ff4444' : '#aaffcc';
    return `<span style="color:#888">${label.padEnd(18)}</span><span style="color:${color}">${value}</span>\n`;
  }

  function checkEntity(id) {
    const el = document.getElementById(id);
    if (!el) return '✗ no DOM element';
    const pos = el.object3D?.position;
    if (!pos) return '✓ DOM exists (no object3D yet)';
    return `✓ pos(${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)})`;
  }

  // ── Main render loop ───────────────────────────────────────────────────
  function render() {
    // 1. sessionStorage values network.js needs
    const ss = {
      clientId:    sessionStorage.getItem('clientId')          || '—',
      lobbyWsHost: sessionStorage.getItem('lobbyWsHost')       || '—',
      gameId:      sessionStorage.getItem('gameId')            || '—',
      role:        sessionStorage.getItem('selectedRole')      || '—',
      cls:         sessionStorage.getItem('selectedClass')     || '—',
      name:        sessionStorage.getItem('selectedCharacter') || '—',
      lobbyLen:    JSON.parse(sessionStorage.getItem('lobbyPlayers') || '[]').length,
    };

    // 2. Colyseus state — read from the global colyseusRoom if it exists
    const room = typeof colyseusRoom !== 'undefined' ? colyseusRoom : null;
    const connected  = room && room.connection?.isOpen;
    const roomId     = room?.roomId || '—';
    const sessionId  = room?.sessionId || '—';
    const playerCount = room?.state?.players?.size ?? '—';

    // 3. Build output
    let out = '<b style="color:#fff">── SESSION STORAGE ──────────────\n</b>';
    out += row('clientId',     ss.clientId);
    out += row('lobbyWsHost',  ss.lobbyWsHost, ss.lobbyWsHost !== '—' && ss.lobbyWsHost !== 'localhost');
    out += row('gameId',       ss.gameId);
    out += row('role',         ss.role,  ss.role  !== '—');
    out += row('class',        ss.cls,   ss.cls   !== '—');
    out += row('name',         ss.name,  ss.name  !== '—');
    out += row('lobbyPlayers', ss.lobbyLen + ' entries', ss.lobbyLen > 0);

    out += '\n<b style="color:#fff">── COLYSEUS ─────────────────────\n</b>';
    out += row('connected',    connected ? '✓ YES' : '✗ NO',  connected);
    out += row('server URL',   `ws://${ss.lobbyWsHost}:2567`);
    out += row('roomId',       roomId,    roomId !== '—');
    out += row('sessionId',    sessionId, sessionId !== '—');
    out += row('players in room', String(playerCount), playerCount > 0);

    // 4. Per-player detail
    if (room?.state?.players?.size > 0) {
      out += '\n<b style="color:#fff">── PLAYERS (server state) ───────\n</b>';
      room.state.players.forEach((p, sid) => {
        const isMe    = sid === room.sessionId;
        const charId  = isMe ? 'villain' : sid;
        const entityStatus = isMe ? checkEntity('player-villain') : checkEntity(sid);
        const inChars = typeof characters !== 'undefined' && characters.has(charId);
        out += `<span style="color:${isMe ? '#ffff00' : '#aaffcc'}">${isMe ? '► ' : '  '}${p.charName || sid.slice(0,8)} (${p.role}/${p.cls})\n</span>`;
        out += `    hp:${Math.round(p.health)}/${p.maxHealth} alive:${p.isAlive}\n`;
        out += `    pos:(${p.x?.toFixed(1)},${p.y?.toFixed(1)},${p.z?.toFixed(1)})\n`;
        out += `    entity: ${entityStatus}\n`;
        out += `    in characters map: ${inChars ? '✓' : '✗'}\n`;
      });
    } else {
      out += '\n<span style="color:#888">  (no players in room yet)</span>\n';
    }

    // 5. game.js state
    out += '\n<b style="color:#fff">── GAME STATE ───────────────────\n</b>';
    const state = typeof getState === 'function' ? getState() : '—';
    out += row('phase', state, state === 'BATTLE');
    const charCount = typeof characters !== 'undefined' ? characters.size : '—';
    out += row('characters map', charCount + ' entries', charCount > 0);

    // 6. Remote entities in DOM
    const remCount = typeof remoteEntities !== 'undefined' ? Object.keys(remoteEntities).length : '—';
    out += row('remoteEntities', remCount + ' spawned', remCount > 0);

    // 7. Recent logs
    if (logs.length > 0) {
      out += '\n<b style="color:#fff">── LOG ──────────────────────────\n</b>';
      out += logs.join('\n') + '\n';
    }

    out += '\n<span style="color:#555">[ ` ] toggle overlay</span>';
    panel.innerHTML = out;
  }

  // Update every 500ms — fast enough to see changes, not so fast it's distracting
  setInterval(render, 500);

  // Log key network events when they happen
  // We patch into network.js globals after they're created
  const _origConnectToColyseus = window.connectToColyseus;

  // Patch colyseusRoom assignment — watch for it being set
  let _watchInterval = setInterval(() => {
    if (typeof colyseusRoom !== 'undefined' && colyseusRoom !== null) {
      clearInterval(_watchInterval);
      dbgLog('Colyseus room joined: ' + colyseusRoom.roomId, '#00ff99');

      colyseusRoom.onLeave((code) => {
        dbgLog(`Room left (code ${code})`, '#ff4444');
      });
      colyseusRoom.onError((code, msg) => {
        dbgLog(`Room error ${code}: ${msg}`, '#ff4444');
      });
    }
  }, 200);

  dbgLog('Debug overlay active. Press ` to toggle.', '#00ff99');
  render();
})();