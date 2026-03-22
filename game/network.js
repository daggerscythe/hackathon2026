// ============================================
// NETWORK — WebSocket multiplayer client
// ============================================

// our own player data from character select
const GAME_ID     = sessionStorage.getItem('gameId');
const MY_ID       = sessionStorage.getItem('clientId');
const MY_CLASS    = sessionStorage.getItem('selectedClass');
const MY_ROLE     = sessionStorage.getItem('selectedRole');
const MY_NAME     = sessionStorage.getItem('selectedCharacter');
const LOBBY       = JSON.parse(sessionStorage.getItem('lobbyPlayers') || '[]');

const WS_HOST = sessionStorage.getItem('lobbyWsHost') || location.hostname;
const WS_PROTO = location.protocol === 'https:' ? 'wss' : 'ws';
let ws = null;

// remote player clientIds we've already spawned
const spawnedRemotePlayers = new Set();

// how often we broadcast our position (ms)
const SEND_RATE = 50; // 20 times per second

if (GAME_ID && MY_ID) {
  ws = new WebSocket(`${WS_PROTO}://${WS_HOST}:9090`);

  ws.onopen = () => {
    console.log('WS connected');
    ws.send(JSON.stringify({
      method:   'identify',
      clientId: MY_ID,
      gameId:   GAME_ID,
      username: sessionStorage.getItem('lobbyUsername'),
    }));
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);

    switch (msg.method) {

    // ── Another player moved ──────────────────────────────────────────
    case 'playerMove':
      updateRemotePlayer(msg);
      break;

    // ── Another player attacked ───────────────────────────────────────
    case 'playerAttack':
      // optional: use this for VFX later; health is driven by healthUpdate
      break;

    // ── Health was updated (server authoritative) ─────────────────────
    case 'healthUpdate':
      handleHealthUpdate(msg);
      break;

    // ── A player died ─────────────────────────────────────────────────
    case 'playerDied':
      handleRemoteDeath(msg);
      break;

    // ── A player left mid-game ────────────────────────────────────────
    case 'playerLeft':
      handleRemoteLeave(msg);
      break;

    case 'gameState':
      // backwards compatible: server may send a player list during identify
      msg.players.forEach(p => ensurePlayerEntity(p));
      break;

    case 'state':
      // authoritative snapshot of current players + their character metadata
      if (Array.isArray(msg.players)) {
        msg.players.forEach(p => ensurePlayerEntity(p));
      }
      // ensure we are in battle once server state arrives
      if (typeof transitionTo === 'function' && typeof STATES !== 'undefined') {
        transitionTo(STATES.BATTLE);
      }
      break;
    }
  };
}

// ============================================
// SEND OWN POSITION every SEND_RATE ms
// ============================================
function getLocalEntityEl() {
  return document.getElementById('player-local') ||
         document.querySelector('[player-physics]');
}

if (ws) setInterval(() => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  // find whichever entity is the local player
  const playerEl = getLocalEntityEl();
  if (!playerEl) return;

  const pos = playerEl.object3D.position;
  const rot = playerEl.object3D.rotation;

  ws.send(JSON.stringify({
    method:   'playerMove',
    gameId:   sessionStorage.getItem('gameId'),
    position: { x: pos.x, y: pos.y, z: pos.z },
    rotation: { y: rot.y },
  }));
}, SEND_RATE);

// ============================================
// RECEIVE — move a remote player's entity
// ============================================

// target positions for lerping — smoother than snapping
// key: clientId
const remoteTargets = {};

function updateRemotePlayer(msg) {
  const clientId = msg.clientId;
  if (!clientId || clientId === MY_ID) return;

  if (!spawnedRemotePlayers.has(clientId)) {
    ensurePlayerEntity({
      clientId,
      username: msg.username,
      character: msg.character,
      position: msg.position,
      rotation: msg.rotation,
    });
  }

  remoteTargets[clientId] = {
    position: msg.position,
    rotation: msg.rotation,
  };
}

function ensurePlayerEntity(p) {
  if (!p || !p.clientId) return;

  function toStat100(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    // server sends 0-1, UI tends to send 0-100
    return n <= 1 ? n * 100 : n;
  }

  const clientId = p.clientId;
  const isLocal  = clientId === MY_ID;

  // Prefer server-provided character data; fall back to lobby/session.
  const lobbyPlayer = LOBBY.find(x => x.clientId === clientId);
  const character   = p.character || lobbyPlayer?.character || {
    role: lobbyPlayer?.character?.role || (isLocal ? (MY_ROLE || 'hero') : 'hero'),
    cls:  lobbyPlayer?.character?.cls  || (isLocal ? (MY_CLASS || 'tank') : 'tank'),
    name: lobbyPlayer?.character?.name || (isLocal ? (MY_NAME || 'You') : (lobbyPlayer?.username || 'Player')),
  };

  const role = character.role || (isLocal ? (MY_ROLE || 'hero') : 'hero');
  const cls  = character.cls  || (isLocal ? (MY_CLASS || 'tank') : 'tank');
  const name = character.name || p.username || lobbyPlayer?.username || 'Player';

  // Normalize stats into the shape game.js expects (0-100 inputs, it divides by 100)
  const csvRow = {
    name,
    strength: toStat100(character.str ?? character.strength, 70),
    magic:    toStat100(character.mag ?? character.magic, 60),
    defense:  toStat100(character.def ?? character.defense, 30),
    speed:    toStat100(character.spd ?? character.speed, 50),
    power:    toStat100(character.pow ?? character.power, 40),
  };

  if (isLocal) {
    const localEl = getLocalEntityEl();
    if (!localEl) return;

    // Configure local entity + components to use clientId as characterId
    localEl.setAttribute('id', `player-${clientId}`);
    localEl.setAttribute('attack-input', `characterId: ${clientId}; attackClass: ${cls}`);
    localEl.setAttribute('melee-hitbox', `characterId: ${clientId}; duration: 300`);
    localEl.setAttribute('health-bar', `characterId: ${clientId}; nickname: ${name}; health: 100; maxHealth: 100`);

    if (p.position) {
      localEl.setAttribute('position', `${p.position.x} ${p.position.y} ${p.position.z}`);
    }

    // Update local model
    const localModel = document.getElementById('local-model');
    if (localModel) {
      localModel.setAttribute('src', `#${CLASS_MODEL[cls] || 'model-tank'}`);
    }

    // Register local character in game.js registry if missing
    if (typeof addCharacter === 'function' && !characters.get(clientId)) {
      addCharacter(clientId, role, cls, csvRow, `player-${clientId}`);
    }

    return;
  }

  if (spawnedRemotePlayers.has(clientId)) {
    // Ensure character exists in registry even if entity existed from a prior snapshot.
    if (typeof addCharacter === 'function' && !characters.get(clientId)) {
      addCharacter(clientId, role, cls, csvRow, `remote-${clientId}`);
    }

    if (p.position && p.rotation) {
      remoteTargets[clientId] = { position: p.position, rotation: p.rotation };
    }
    return;
  }

  spawnedRemotePlayers.add(clientId);

  const scene = document.querySelector('a-scene');
  if (!scene) return;

  const entityId = `remote-${clientId}`;
  const entity = document.createElement('a-entity');
  entity.setAttribute('id', entityId);

  const pos = p.position || { x: (Math.random() - 0.5) * 10, y: 2, z: (Math.random() - 0.5) * 10 };
  entity.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);
  entity.setAttribute('health-bar', `characterId: ${clientId}; nickname: ${name}; health: 100; maxHealth: 100`);

  const modelId = CLASS_MODEL[cls] || 'model-tank';
  const model = document.createElement('a-gltf-model');
  model.setAttribute('src', `#${modelId}`);
  model.setAttribute('scale', '0.8 0.8 0.8');
  entity.appendChild(model);

  scene.appendChild(entity);

  if (typeof addCharacter === 'function') {
    addCharacter(clientId, role, cls, csvRow, entityId);
  }

  remoteTargets[clientId] = {
    position: pos,
    rotation: p.rotation || { y: 0 },
  };
}

// ============================================
// LERP remote players every frame
// ============================================
AFRAME.registerComponent('network-lerp', {
  tick(time, delta) {
    for (const [id, target] of Object.entries(remoteTargets)) {
      const el = document.getElementById(`remote-${id}`);
      if (!el) continue;

      const pos = el.object3D.position;
      const t   = 1 - Math.pow(0.1, delta / 100); // frame-rate independent lerp

      pos.x = THREE.MathUtils.lerp(pos.x, target.position.x, t);
      pos.y = THREE.MathUtils.lerp(pos.y, target.position.y, t);
      pos.z = THREE.MathUtils.lerp(pos.z, target.position.z, t);

      el.object3D.rotation.y = THREE.MathUtils.lerp(
        el.object3D.rotation.y,
        target.rotation.y,
        t
      );
    }
  }
});

// ============================================
// SEND ATTACK EVENT
// Call this from physics.js when attack fires
// ============================================
function sendAttackEvent(attackType, targetId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    method:     'playerAttack',
    gameId:     sessionStorage.getItem('gameId'),
    attackType, // 'melee' | 'magic'
    targetId,   // character id (clientId) of who got hit
  }));
}

// ============================================
// RECEIVE HEALTH UPDATE — authoritative from server
// ============================================
function handleHealthUpdate(msg) {
  const target = characters.get(msg.targetId);
  if (!target) return;

  target.health = Math.max(0, msg.health);

  emit(GAME_EVENTS.HEALTH_CHANGED, {
    characterId: msg.targetId,
    health:      target.health,
    maxHealth:   msg.maxHealth ?? target.maxHealth,
  });

  if (target.health <= 0) handleDeath(msg.targetId);
}

// ============================================
// RECEIVE DEATH
// ============================================
function handleRemoteDeath(msg) {
  handleDeath(msg.characterId);
}

// ============================================
// PLAYER LEFT
// ============================================
function handleRemoteLeave(msg) {
  const el  = document.getElementById(`remote-${msg.clientId}`);
  if (el) el.parentNode.removeChild(el);
  spawnedRemotePlayers.delete(msg.clientId);
  delete remoteTargets[msg.clientId];
  characters.delete(msg.clientId);
}