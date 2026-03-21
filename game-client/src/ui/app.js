import { MsgType } from '@hack/shared';
import { connectToServer } from '../net/socket.js';

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
  };

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
    root.innerHTML = '';

    const shell = el('div', 'mx-auto max-w-2xl p-6');
    const title = el('h1', 'text-2xl font-semibold text-neutral-900');
    title.textContent = 'Hackathon 2026 — Player Select';

    const subtitle = el('p', 'mt-1 text-sm text-neutral-600');
    subtitle.textContent = 'Connect to a LAN host and join the lobby.';

    shell.appendChild(title);
    shell.appendChild(subtitle);

    shell.appendChild(renderForm());

    if (state.status !== 'idle') {
      shell.appendChild(renderStatus());
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
      state.connection?.close();
      state.connection = null;
      state.status = 'idle';
      state.playerId = null;
      state.role = null;
      state.lobby = null;
      state.hostUrls = null;
      state.connectedHost = null;
      state.match = null;
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
            render();
          }

          if (msg.type === MsgType.LOBBY) {
            state.lobby = msg.lobby;
            render();
          }

          if (msg.type === MsgType.MATCH_START) {
            state.match = msg;
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

  function renderLobby() {
    const box = el('div', 'mt-4 rounded-xl border border-neutral-200 bg-white p-4');
    const h = el('h2', 'text-base font-semibold text-neutral-900');
    h.textContent = `Lobby (${state.lobby.players.length}/${state.lobby.maxPlayers})`;

    if (state.match) {
      const started = el('p', 'mt-1 text-xs font-medium text-neutral-900');
      started.textContent = 'Match started.';
      box.appendChild(h);
      box.appendChild(started);
      return box;
    }

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

    const allReady = state.lobby.players.length === state.lobby.maxPlayers && state.lobby.players.every((p) => p.ready);
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
}
