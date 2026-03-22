import { MsgType } from '@hack/shared';
import { connectToServer } from '../net/socket.js';
import { mountGameView } from '../three/gameView.js';

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function mountApp(root) {
  const state = {
    status: 'idle',
    playerId: null,
    role: null,
    lobby: null,
    connection: null,
    hostUrls: null,
    connectedHost: null,
    match: null,
    lastError: null,
    countdownEndsAt: null,
    gameStarted: false,
    gameView: {
      mounted: false,
      /** @type {null | (() => void)} */
      dispose: null,
    },
    cs: {
      index: 0,
      statsForClassId: null,
      lastEnterAt: 0,
    },
  };

  const HERO = [
    { id: 'hero:tank', label: 'Tank', team: 'hero' },
    { id: 'hero:dps', label: 'DPS', team: 'hero' },
    { id: 'hero:support', label: 'Support', team: 'hero' },
    { id: 'hero:mage', label: 'Mage', team: 'hero' },
  ];

  const VILLAIN = [
    { id: 'villain:mage', label: 'Mage', team: 'villain' },
    { id: 'villain:brute', label: 'Brute', team: 'villain' },
    { id: 'villain:agile', label: 'Agile', team: 'villain' },
  ];

  const PICK_LIST = [
    ...HERO,
    ...VILLAIN,
  ];

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for older browser / insecure context
      try {
        const ta = el('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return true;
      } catch {
        return false;
      }
    }
  }

  function shouldShowInvite() {
    if (!state.hostUrls || state.hostUrls.length === 0) return false;
    const h = String(state.connectedHost ?? '').toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '::1';
  }

  function render() {
    // After game begins, take over the whole screen with Three.js.
    if (state.match && state.gameStarted) {
      if (state.gameView.mounted) return;

      root.innerHTML = '';
      const container = el('div', 'fixed inset-0');
      root.appendChild(container);

      const view = mountGameView(container, { modelUrl: '/models/fryingpan.glb' });
      state.gameView.mounted = true;
      state.gameView.dispose = () => view.dispose();
      return;
    }

    root.innerHTML = '';

    const shell = el('div', 'mx-auto max-w-2xl p-6');
    const title = el('h1', 'text-2xl font-semibold text-neutral-900');
    title.textContent = state.match ? 'Hackathon 2026 — Character Select' : 'Hackathon 2026 — Player Select';

    const subtitle = el('p', 'mt-1 text-sm text-neutral-600');
    subtitle.textContent = state.match
      ? 'Use ↑/↓ to cycle. Press Enter to confirm.'
      : 'Connect to a LAN host and join the lobby.';

    shell.appendChild(title);
    shell.appendChild(subtitle);

    // Once match has started, Character Select is the main screen.
    // Hide the connect/lobby sections to keep focus and reduce clutter.
    if (state.match) {
      if (state.lastError) {
        shell.appendChild(renderError());
      }
      shell.appendChild(renderCharacterSelect());
      root.appendChild(shell);
      return;
    }

    shell.appendChild(renderForm());

    if (state.status !== 'idle') {
      shell.appendChild(renderStatus());
    }

    if (state.lastError) {
      shell.appendChild(renderError());
    }

    if (shouldShowInvite()) {
      shell.appendChild(renderInvite());
    }

    if (state.lobby) {
      shell.appendChild(renderLobby());
    }

    root.appendChild(shell);
  }

  function renderForm() {
    const card = el('div', 'mt-6 rounded-xl border border-neutral-200 bg-white p-4');

    const form = el('form', 'grid gap-3');

    const row = el('div', 'grid gap-3 sm:grid-cols-2');

    const nameWrap = el('label', 'grid gap-1');
    nameWrap.appendChild(Object.assign(el('span', 'text-sm text-neutral-700'), { textContent: 'Name' }));
    const nameInput = Object.assign(el('input', 'rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900'), {
      value: 'Player',
      required: true,
      name: 'name',
    });
    nameWrap.appendChild(nameInput);

    const urlWrap = el('label', 'grid gap-1');
    urlWrap.appendChild(Object.assign(el('span', 'text-sm text-neutral-700'), { textContent: 'Server URL' }));
    const urlInput = Object.assign(el('input', 'rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900'), {
      value: 'ws://localhost:8080',
      required: true,
      name: 'url',
    });
    urlWrap.appendChild(urlInput);

    row.appendChild(nameWrap);
    row.appendChild(urlWrap);
    form.appendChild(row);

    const actions = el('div', 'flex items-center gap-2');
    const btn = el(
      'button',
      'rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50'
    );
    btn.type = 'submit';
    btn.textContent = state.connection ? 'Connected' : 'Connect';
    btn.disabled = Boolean(state.connection);

    const disconnect = el(
      'button',
      'rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50'
    );
    disconnect.type = 'button';
    disconnect.textContent = 'Disconnect';
    disconnect.disabled = !state.connection;
    disconnect.addEventListener('click', () => {
      state.gameView.dispose?.();
      state.gameView.mounted = false;
      state.gameView.dispose = null;

      state.connection?.close();
      state.connection = null;
      state.status = 'idle';
      state.playerId = null;
      state.role = null;
      state.lobby = null;
      state.hostUrls = null;
      state.connectedHost = null;
      state.match = null;
      state.lastError = null;
      state.countdownEndsAt = null;
      state.gameStarted = false;
      state.cs.index = 0;
      state.cs.statsForClassId = null;
      state.cs.lastEnterAt = 0;
      render();
    });

    actions.appendChild(btn);
    actions.appendChild(disconnect);
    form.appendChild(actions);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      const url = urlInput.value.trim();
      if (!name || !url) return;

      state.status = 'connecting';
      render();

      try {
        state.connectedHost = new URL(url).hostname;
      } catch {
        state.connectedHost = null;
      }

      state.connection = connectToServer({
        url,
        name,
        onStatus: (s) => {
          state.status = s;
          render();
        },
        onMessage: (msg) => {
          if (msg.type === MsgType.WELCOME) {
            state.playerId = msg.playerId;
            state.role = msg.role;
            state.lobby = msg.lobby;
            state.hostUrls = Array.isArray(msg.hostUrls) ? msg.hostUrls : null;
            state.lastError = null;
            state.countdownEndsAt = typeof msg.lobby?.countdownEndsAt === 'number' ? msg.lobby.countdownEndsAt : null;
            state.gameStarted = Boolean(msg.lobby?.gameStarted);
            render();
          }

          if (msg.type === MsgType.LOBBY) {
            state.lobby = msg.lobby;
            state.countdownEndsAt = typeof msg.lobby?.countdownEndsAt === 'number' ? msg.lobby.countdownEndsAt : null;
            state.gameStarted = Boolean(msg.lobby?.gameStarted);
            render();
          }

          if (msg.type === MsgType.MATCH_START) {
            state.match = msg;
            state.cs.index = 0;
            state.cs.statsForClassId = null;
            state.cs.lastEnterAt = 0;
            state.lastError = null;
            state.countdownEndsAt = null;
            state.gameStarted = false;
            render();
          }

          if (msg.type === MsgType.COUNTDOWN) {
            state.countdownEndsAt = typeof msg.endsAt === 'number' ? msg.endsAt : null;
            render();
          }

          if (msg.type === MsgType.GAME_BEGIN) {
            state.gameStarted = true;
            render();
          }

          if (msg.type === MsgType.ERROR) {
            state.lastError = msg.message;
            render();
          }
        },
      });
    });

    card.appendChild(form);
    return card;
  }

  function renderStatus() {
    const box = el('div', 'mt-4 rounded-xl border border-neutral-200 bg-white p-4');
    const p = el('p', 'text-sm text-neutral-700');
    p.textContent = `Status: ${state.status}`;

    const meta = el('p', 'mt-1 text-xs text-neutral-500');
    meta.textContent = state.playerId ? `You: ${state.playerId} (${state.role})` : 'Not joined yet';

    box.appendChild(p);
    box.appendChild(meta);
    return box;
  }

  function renderError() {
    const box = el('div', 'mt-4 rounded-xl border border-red-200 bg-white p-4');
    const p = el('p', 'text-sm text-red-700');
    p.textContent = state.lastError;
    box.appendChild(p);
    return box;
  }

  function renderLobby() {
    const box = el('div', 'mt-4 rounded-xl border border-neutral-200 bg-white p-4');
    const h = el('h2', 'text-base font-semibold text-neutral-900');
    const active = state.lobby.players.filter((p) => p.role !== 'spectator');
    h.textContent = `Lobby (${active.length}/${state.lobby.maxPlayers})`;

    const actions = el('div', 'mt-3 flex flex-wrap items-center gap-2');
    const isHost = state.playerId && state.lobby.hostId && state.playerId === state.lobby.hostId;
    const me = state.playerId ? state.lobby.players.find((p) => p.id === state.playerId) : null;

    const readyBtn = el(
      'button',
      'rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50'
    );
    readyBtn.type = 'button';
    readyBtn.disabled = !state.connection || !me;
    const meReady = Boolean(me?.ready);
    readyBtn.textContent = meReady ? 'Unready' : 'Ready';
    readyBtn.addEventListener('click', () => {
      if (!state.connection) return;
      state.connection.send({ type: MsgType.READY, ready: !meReady });
    });

    const allReady = active.length === state.lobby.maxPlayers && active.every((p) => p.ready);
    const startBtn = el(
      'button',
      'rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50'
    );
    startBtn.type = 'button';
    startBtn.disabled = !state.connection || !isHost || !allReady;
    startBtn.textContent = isHost ? 'Start Match' : 'Waiting for host';
    startBtn.addEventListener('click', () => {
      if (!state.connection) return;
      if (!isHost) return;
      state.connection.send({ type: MsgType.START });
    });

    actions.appendChild(readyBtn);
    actions.appendChild(startBtn);

    const list = el('ul', 'mt-3 grid gap-2');
    for (const p of state.lobby.players) {
      const row = el('li', 'flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2');
      const left = el('div', 'text-sm text-neutral-900');
      left.textContent = `${p.name}`;

      const right = el('div', 'text-xs text-neutral-600');
      const hostTag = state.lobby.hostId && p.id === state.lobby.hostId ? ' (host)' : '';
      const youTag = p.id === state.playerId ? ' (you)' : '';
      const readyTag = p.ready ? ' • ready' : '';
      right.textContent = `${p.role}${hostTag}${youTag}${readyTag}`;

      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    }

    box.appendChild(h);
    box.appendChild(actions);
    box.appendChild(list);
    return box;
  }

  function renderCharacterSelect() {
    const box = el('div', 'mt-4 rounded-xl border border-neutral-200 bg-white p-4');

    if (state.gameStarted) {
      const h = el('h2', 'text-base font-semibold text-neutral-900');
      h.textContent = 'Game starting…';
      const p = el('p', 'mt-2 text-sm text-neutral-700');
      p.textContent = '3D arena + movement comes next.';
      box.appendChild(h);
      box.appendChild(p);
      return box;
    }

    const h = el('h2', 'text-base font-semibold text-neutral-900');
    h.textContent = 'Choose a class';

    const grid = el('div', 'mt-3 grid gap-4 sm:grid-cols-2');
    const left = el('div');
    const right = el('div');

    const me = state.playerId ? state.lobby?.players?.find((p) => p.id === state.playerId) : null;
    const taken = new Set((state.lobby?.players ?? []).filter((p) => p.confirmed && p.classId).map((p) => p.classId));
    const villainTaken = (state.lobby?.players ?? []).some((p) => p.confirmed && p.role === 'villain');

    function isDisabled(option) {
      if (!me) return true;
      if (me.role === 'spectator') return true;
      if (me.confirmed) return true;
      if (taken.has(option.id)) return true;
      if (option.team === 'villain' && villainTaken) return true;
      return false;
    }

    const list = el('div', 'grid gap-2');
    list.appendChild(Object.assign(el('div', 'text-xs font-semibold text-neutral-500'), { textContent: 'hero' }));

    const heroList = el('div', 'grid gap-1');
    const villainList = el('div', 'mt-2 grid gap-1');
    for (const option of HERO) {
      heroList.appendChild(renderPickRow(option, isDisabled(option), taken.has(option.id), me));
    }

    list.appendChild(heroList);
    list.appendChild(Object.assign(el('div', 'mt-3 text-xs font-semibold text-neutral-500'), { textContent: 'villain' }));
    for (const option of VILLAIN) {
      const disabled = isDisabled(option);
      const takenOrLocked = taken.has(option.id) || (villainTaken && !taken.has(option.id));
      villainList.appendChild(renderPickRow(option, disabled, takenOrLocked, me));
    }
    list.appendChild(villainList);

    const help = el('p', 'mt-3 text-xs text-neutral-600');
    help.textContent = '↑/↓ cycles classes. Enter confirms. (Double-Enter randomize: later.)';

    left.appendChild(list);
    left.appendChild(help);

    right.appendChild(renderStatsAndPreviewPanel());

    grid.appendChild(left);
    grid.appendChild(right);

    box.appendChild(h);
    box.appendChild(grid);

    const countdown = renderCountdownBanner();
    if (countdown) box.appendChild(countdown);
    return box;
  }

  function renderCountdownBanner() {
    if (!state.countdownEndsAt) return null;
    if (state.gameStarted) return null;

    const remainingS = Math.max(0, (state.countdownEndsAt - Date.now()) / 1000);
    const text = `Starting in ${remainingS.toFixed(1)}`;

    const wrap = el('div', 'mt-6 rounded-xl border border-neutral-200 bg-white p-4');
    const p = el('p', 'text-center text-3xl font-semibold text-neutral-900');
    p.textContent = text;
    wrap.appendChild(p);
    return wrap;
  }

  function renderPickRow(option, disabled, visuallyTaken, me) {
    const idx = PICK_LIST.findIndex((x) => x.id === option.id);
    const selected = state.cs.index === idx;
    const mePicked = me?.confirmed && me?.classId === option.id;

    const base = 'flex items-center justify-between rounded-lg border px-3 py-2 text-sm';
    const border = selected ? 'border-neutral-900' : 'border-neutral-200';
    const bg = selected ? 'bg-neutral-50' : 'bg-white';
    const text = visuallyTaken ? 'text-neutral-400 line-through' : disabled ? 'text-neutral-400' : 'text-neutral-900';

    const row = el('div', `${base} ${border} ${bg}`);
    const left = el('div', `pl-4 ${text}`);
    left.textContent = option.label;

    const right = el('div', 'text-xs text-neutral-600');
    right.textContent = mePicked ? 'confirmed' : visuallyTaken ? 'taken' : '';

    row.appendChild(left);
    row.appendChild(right);
    return row;
  }

  function renderStatsAndPreviewPanel() {
    const picked = state.cs.statsForClassId ? PICK_LIST.find((x) => x.id === state.cs.statsForClassId) : null;

    const box = el('div', 'rounded-xl border border-neutral-200 bg-white p-3');

    const statsH = el('h3', 'text-sm font-semibold text-neutral-900');
    statsH.textContent = 'Stats';

    const statsP = el('p', 'mt-2 text-xs text-neutral-600');
    statsP.textContent = picked
      ? `${picked.team} / ${picked.label} — (stats/config TBD)`
      : 'Press Enter on a class to populate stats.';

    const divider = el('div', 'my-3 h-px bg-neutral-200');

    const previewH = el('h3', 'text-sm font-semibold text-neutral-900');
    previewH.textContent = 'Preview';

    const name = el('p', 'mt-2 text-xs text-neutral-700');
    name.textContent = picked ? `Name: ${picked.label}` : 'Name: —';

    const config = el('p', 'mt-1 text-xs text-neutral-600');
    config.textContent = picked ? 'Config: (TBD)' : 'Config: —';

    const home = el('p', 'mt-1 text-xs text-neutral-600');
    home.textContent = picked ? 'Home: (TBD)' : 'Home: —';

    const stage = el('div', 'mt-3 grid place-items-center rounded-lg border border-dashed border-neutral-300 bg-white p-6');
    const stageText = el('p', 'text-xs text-neutral-500');
    stageText.textContent = picked ? '3D preview (Three.js) — later' : 'Preview appears after Enter';
    stage.appendChild(stageText);

    box.appendChild(statsH);
    box.appendChild(statsP);
    box.appendChild(divider);
    box.appendChild(previewH);
    box.appendChild(name);
    box.appendChild(config);
    box.appendChild(home);
    box.appendChild(stage);
    return box;
  }

  function handleKeydown(e) {
    if (!state.match) return;
    if (!state.connection) return;
    const tag = String(e.target?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    const me = state.playerId ? state.lobby?.players?.find((p) => p.id === state.playerId) : null;
    if (me?.confirmed) return;
    if (me?.role === 'spectator') return;

    if (e.key === 'ArrowDown') {
      state.cs.index = (state.cs.index + 1) % PICK_LIST.length;
      render();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowUp') {
      state.cs.index = (state.cs.index - 1 + PICK_LIST.length) % PICK_LIST.length;
      render();
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      const now = Date.now();
      if (now - state.cs.lastEnterAt < 350) {
        state.lastError = 'Randomize not implemented yet.';
        render();
        state.cs.lastEnterAt = now;
        e.preventDefault();
        return;
      }
      state.cs.lastEnterAt = now;

      const option = PICK_LIST[state.cs.index];
      if (!option) return;
      state.cs.statsForClassId = option.id;
      state.lastError = null;
      state.connection.send({ type: MsgType.PICK, classId: option.id });
      render();
      e.preventDefault();
    }
  }

  function renderInvite() {
    const box = el('div', 'mt-4 rounded-xl border border-neutral-200 bg-white p-4');
    const h = el('h2', 'text-base font-semibold text-neutral-900');
    h.textContent = 'Invite URLs (copy/share)';

    const note = el('p', 'mt-1 text-xs text-neutral-600');
    note.textContent = 'Other devices on your LAN should use one of these as the “Server URL”.';

    const list = el('ul', 'mt-3 grid gap-2');
    for (const url of state.hostUrls ?? []) {
      const row = el('li', 'flex items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2');
      const left = el('div', 'min-w-0 text-xs text-neutral-800');
      left.textContent = url;

      const copyBtn = el(
        'button',
        'shrink-0 rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-50'
      );
      copyBtn.type = 'button';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', async () => {
        const ok = await copyToClipboard(url);
        copyBtn.textContent = ok ? 'Copied' : 'Copy failed';
        window.setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 900);
      });

      row.appendChild(left);
      row.appendChild(copyBtn);
      list.appendChild(row);
    }

    box.appendChild(h);
    box.appendChild(note);
    box.appendChild(list);
    return box;
  }

  render();

  window.addEventListener('keydown', handleKeydown);

  // Keep countdown UI fresh without requiring incoming messages.
  window.setInterval(() => {
    if (!state.match) return;
    if (!state.countdownEndsAt) return;
    if (state.gameStarted) return;
    if (Date.now() > state.countdownEndsAt + 1000) return;
    render();
  }, 100);
}
