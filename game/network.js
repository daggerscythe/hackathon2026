// ============================================
// NETWORK — WebSocket multiplayer client
// ============================================

const WS_HOST = sessionStorage.getItem('lobbyWsHost') || location.hostname;
const WS_PROTO = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${WS_PROTO}://${WS_HOST}:9090`);

// our own player data from character select
const MY_ID       = sessionStorage.getItem('clientId');
const MY_CLASS    = sessionStorage.getItem('selectedClass');
const MY_ROLE     = sessionStorage.getItem('selectedRole');
const MY_NAME     = sessionStorage.getItem('selectedCharacter');
const LOBBY       = JSON.parse(sessionStorage.getItem('lobbyPlayers') || '[]');

// remote player entity ids we've already spawned
const spawnedRemotePlayers = new Set();

// how often we broadcast our position (ms)
const SEND_RATE = 50; // 20 times per second

ws.onopen = () => {
  console.log('WS connected');
  ws.send(JSON.stringify({
    method:   'identify',
    clientId: MY_ID,
    gameId:   sessionStorage.getItem('gameId'),
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
      handleRemoteAttack(msg);
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
      msg.players.forEach(p => {
        const id = `remote-${p.clientId}`;
        if (!spawnedRemotePlayers.has(id)) {
          spawnRemotePlayer(id, {
            clientId: p.clientId,
            position: { x: (Math.random()-0.5)*10, y: 1, z: (Math.random()-0.5)*10 },
            rotation: { y: 0 },
          });
        }
      });
      break;
  }
};

// ============================================
// SEND OWN POSITION every SEND_RATE ms
// ============================================
// determine local player entity id based on role
const MY_ENTITY_ID = MY_ROLE === 'villain' ? 'player-villain' : `remote-player-local`;

setInterval(() => {
  if (ws.readyState !== WebSocket.OPEN) return;

  // find whichever entity is the local player
  const playerEl = document.getElementById('player-villain') ||
                   document.querySelector('[player-physics]');
  if (!playerEl) return;

  const pos = playerEl.object3D.position;
  const rot = playerEl.object3D.rotation;

  ws.send(JSON.stringify({
    method:   'playerMove',
    clientId: MY_ID,
    gameId:   sessionStorage.getItem('gameId'),
    position: { x: pos.x, y: pos.y, z: pos.z },
    rotation: { y: rot.y },
  }));
}, SEND_RATE);

// ============================================
// RECEIVE — move a remote player's entity
// ============================================

// target positions for lerping — smoother than snapping
const remoteTargets = {};

function updateRemotePlayer(msg) {
  // find the entity that belongs to this clientId
  // first check if we have a mapping, otherwise use clientId directly
  const id = `remote-${msg.clientId}`;

  if (!spawnedRemotePlayers.has(id)) {
    spawnRemotePlayer(id, msg);
    return;
  }

  remoteTargets[id] = {
    position: msg.position,
    rotation: msg.rotation,
  };
}

function spawnRemotePlayer(id, msg) {
  spawnedRemotePlayers.add(id);

  // check if initMatchFromLobby already created this entity
  // by looking for a matching username in the lobby
  const lobbyPlayer = LOBBY.find(p => p.clientId === msg.clientId);
  const existingId  = lobbyPlayer ? `remote-player-${LOBBY.indexOf(lobbyPlayer)}` : null;

  // if already spawned by initMatchFromLobby, just register the target
  if (existingId && document.getElementById(existingId)) {
    remoteTargets[id] = { position: msg.position, rotation: msg.rotation };

    // also register under the clientId-based id for future lookups
    const el = document.getElementById(existingId);
    el.setAttribute('id', id); // rename to clientId-based id
    return;
  }

  // otherwise spawn fresh
  const cls     = lobbyPlayer?.character?.cls  || 'tank';
  const name    = lobbyPlayer?.character?.name || lobbyPlayer?.username || 'Player';
  const modelId = CLASS_MODEL[cls] || 'model-tank';

  const entity = document.createElement('a-entity');
  entity.setAttribute('id',         id);
  entity.setAttribute('position',   `${msg.position.x} ${msg.position.y} ${msg.position.z}`);
  entity.setAttribute('health-bar', `nickname: ${name}; health: 100; maxHealth: 100`);

  const model = document.createElement('a-gltf-model');
  model.setAttribute('src',   `#${modelId}`);
  model.setAttribute('scale', '0.8 0.8 0.8');
  entity.appendChild(model);

  document.querySelector('a-scene').appendChild(entity);

  addCharacter(id, lobbyPlayer?.character?.role || 'hero', cls, {
    name, strength: 70, magic: 60, defense: 30, speed: 50, power: 40,
  }, id);

  remoteTargets[id] = { position: msg.position, rotation: msg.rotation };
}

// ============================================
// LERP remote players every frame
// ============================================
AFRAME.registerComponent('network-lerp', {
  tick(time, delta) {
    for (const [id, target] of Object.entries(remoteTargets)) {
      const el = document.getElementById(id);
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
function sendAttackEvent(attackType, targetId, damage) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    method:     'playerAttack',
    clientId:   MY_ID,
    gameId:     sessionStorage.getItem('gameId'),
    attackType, // 'melee' | 'magic'
    targetId,   // character id of who got hit
    damage,
  }));
}

// ============================================
// RECEIVE ATTACK — apply damage locally
// ============================================
function handleRemoteAttack(msg) {
  // the attacker's client already applied damage on their end
  // we just need to apply it here too so health stays in sync
  const target = characters.get(msg.targetId);
  if (!target || !target.isAlive) return;

  // apply raw damage directly — don't run through calcDamage again
  // since the sender already calculated it
  target.health = Math.max(0, target.health - msg.damage);

  emit(GAME_EVENTS.HEALTH_CHANGED, {
    characterId: msg.targetId,
    health:      target.health,
    maxHealth:   target.maxHealth,
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
  const id  = `remote-${msg.clientId}`;
  const el  = document.getElementById(id);
  if (el) el.parentNode.removeChild(el);
  spawnedRemotePlayers.delete(id);
  delete remoteTargets[id];
  characters.delete(id);
}