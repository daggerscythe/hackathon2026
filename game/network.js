// ============================================
// NETWORK — WebSocket multiplayer client
// ============================================

const ws = new WebSocket('ws://' + location.hostname + ':9090');
console.log('[Network] Creating WS connection to', 'ws://' + location.hostname + ':9090');

// our own player data from character select
const MY_ID    = sessionStorage.getItem('clientId');
const MY_CLASS = sessionStorage.getItem('selectedClass');
const MY_ROLE  = sessionStorage.getItem('selectedRole');
const MY_NAME  = sessionStorage.getItem('selectedCharacter');
const LOBBY    = JSON.parse(sessionStorage.getItem('lobbyPlayers') || '[]');

// remote player entity ids we've already spawned
const spawnedRemotePlayers = new Set();

// target positions for lerping — smoother than snapping
const remoteTargets = {};

// how often we broadcast our position (ms)
const SEND_RATE = 50; // 20 times per second

console.log('[Network] My ID:', MY_ID, '| Game ID:', sessionStorage.getItem('gameId'), '| Role:', MY_ROLE);

// ============================================
// WEBSOCKET CONNECTION
// ============================================
ws.onopen = () => {
  console.log('[Network] WS connected — identifying as', MY_ID);
  ws.send(JSON.stringify({
    method:   'identify',
    clientId: MY_ID,
    gameId:   sessionStorage.getItem('gameId'),
    username: sessionStorage.getItem('lobbyUsername'),
  }));
};

ws.onerror = (e) => console.error('[Network] WS error:', e);
ws.onclose = ()  => console.warn('[Network] WS closed');

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);

  switch (msg.method) {

    case 'playerMove':
      updateRemotePlayer(msg);
      break;

    case 'playerAttack':
      handleRemoteAttack(msg);
      break;

    case 'playerDied':
      handleRemoteDeath(msg);
      break;

    case 'playerLeft':
      handleRemoteLeave(msg);
      break;

    case 'gameState':
      console.log('[Network] gameState received, players:', msg.players.length);
      msg.players.forEach(p => {
        const id = `remote-${p.clientId}`;
        if (!spawnedRemotePlayers.has(id)) {
          const lobbyEntry = LOBBY.find(lp => lp.clientId === p.clientId);
          spawnRemotePlayer(id, {
            clientId: p.clientId,
            position: {
              x: lobbyEntry?.spawnX ?? 0,
              y: lobbyEntry?.spawnY ?? 3,
              z: lobbyEntry?.spawnZ ?? 0,
            },
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
setInterval(() => {
  if (ws.readyState !== WebSocket.OPEN) return;

  const playerEl = document.getElementById('player-villain') ||
                   document.querySelector('[player-physics]');
  if (!playerEl) return;

  const pos = playerEl.object3D.position;

  // get camera yaw — same way physics.js does it
  const cam       = document.getElementById('main-camera');
  if (!cam) return;
  const worldQuat = new THREE.Quaternion();
  cam.object3D.getWorldQuaternion(worldQuat);
  const euler = new THREE.Euler();
  euler.setFromQuaternion(worldQuat, 'YXZ');

  ws.send(JSON.stringify({
    method:   'playerMove',
    clientId: MY_ID,
    gameId:   sessionStorage.getItem('gameId'),
    position: { x: pos.x, y: pos.y, z: pos.z },
    rotation: { y: euler.y }, // camera yaw, not entity rotation
  }));
}, SEND_RATE);

// ============================================
// RECEIVE — move a remote player's entity
// ============================================
function updateRemotePlayer(msg) {
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

  const lobbyPlayer = LOBBY.find(p => p.clientId === msg.clientId);

  // use username for display name, not CSV character name
  const name    = lobbyPlayer?.username || 'Player';
  const cls     = lobbyPlayer?.character?.cls  || 'tank';
  const role    = lobbyPlayer?.character?.role || 'hero';
  const modelId = CLASS_MODEL[cls] || 'model-tank';

  console.log('[Network] Spawning remote player', id, '| name:', name, '| cls:', cls);

  const entity = document.createElement('a-entity');
  entity.setAttribute('id',          id);
  entity.setAttribute('position',    `${msg.position.x} ${msg.position.y} ${msg.position.z}`);
  entity.setAttribute('health-bar',  `nickname: ${name}; health: 100; maxHealth: 100`);

  const model = document.createElement('a-gltf-model');
  model.setAttribute('src',   `#${modelId}`);
  model.setAttribute('scale', '0.8 0.8 0.8');
  entity.appendChild(model);

  document.querySelector('a-scene').appendChild(entity);

  addCharacter(id, role, cls, {
    name,
    strength: lobbyPlayer?.character?.str ?? 70,
    magic:    lobbyPlayer?.character?.mag ?? 60,
    defense:  lobbyPlayer?.character?.def ?? 30,
    speed:    lobbyPlayer?.character?.spd ?? 50,
    power:    lobbyPlayer?.character?.pow ?? 40,
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
      const t   = 1 - Math.pow(0.1, delta / 100);

      pos.x = THREE.MathUtils.lerp(pos.x, target.position.x, t);
      pos.y = THREE.MathUtils.lerp(pos.y, target.position.y, t);
      pos.z = THREE.MathUtils.lerp(pos.z, target.position.z, t);

      // rotate model child to match camera yaw — same pattern as physics.js
      const modelEl = el.querySelector('a-gltf-model');
      if (modelEl) {
        modelEl.object3D.rotation.y = THREE.MathUtils.lerp(
          modelEl.object3D.rotation.y,
          target.rotation.y,
          t
        );
      }
    }
  }
});

// ============================================
// SEND ATTACK EVENT
// Called from physics.js when attack fires
// ============================================
function sendAttackEvent(attackType, targetId, damage) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    method:     'playerAttack',
    clientId:   MY_ID,
    gameId:     sessionStorage.getItem('gameId'),
    attackType,
    targetId,
    damage,
  }));
}

// ============================================
// RECEIVE ATTACK — apply damage locally
// ============================================
function handleRemoteAttack(msg) {
  const target = characters.get(msg.targetId);
  if (!target || !target.isAlive) return;

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
  const id = `remote-${msg.clientId}`;
  const el = document.getElementById(id);
  if (el) el.parentNode.removeChild(el);
  spawnedRemotePlayers.delete(id);
  delete remoteTargets[id];
  characters.delete(id);
}
