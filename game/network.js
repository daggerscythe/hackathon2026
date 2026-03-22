// ============================================================
// game/network.js
//
// Colyseus client — connects to the authoritative game room.
//
// Colyseus handles:
//   - Syncing ALL player positions and health to every client
//   - Server-authoritative damage calculation
//   - Death / win condition checked on server
//
// This file handles:
//   - Joining the Colyseus room with character data
//   - Sending player input (move, melee, magic, heal)
//   - Reacting to server state changes to update A-Frame entities
// ============================================================

// Colyseus JS SDK — loaded via <script> tag in index.html
// <script src="https://unpkg.com/colyseus.js@^0.17.0/dist/colyseus.js"></script>

const MY_ID    = sessionStorage.getItem('clientId');
const MY_CLASS = sessionStorage.getItem('selectedClass');
const MY_ROLE  = sessionStorage.getItem('selectedRole');
const MY_NAME  = sessionStorage.getItem('selectedCharacter');
const LOBBY    = JSON.parse(sessionStorage.getItem('lobbyPlayers') || '[]');

let   colyseusRoom = null;  // the Colyseus Room instance
const remoteEntities = {};  // sessionId -> a-entity element

// ── Connect to Colyseus ───────────────────────────────────────────────────
async function connectToColyseus() {
  // Guard: wait for the Colyseus SDK script to finish loading
  if (typeof Colyseus === 'undefined') {
    console.warn('[Colyseus] SDK not loaded yet, retrying in 200ms...');
    setTimeout(connectToColyseus, 200);
    return;
  }

  try {
    const serverHost = sessionStorage.getItem('lobbyWsHost') || location.hostname;
    console.log(`[Colyseus] Connecting to ws://${serverHost}:2567`);
    const client     = new Colyseus.Client(`ws://${serverHost}:2567`);

    // Find the lobby entry to get actual stats
    const myLobbyEntry = LOBBY.find(p => p.clientId === MY_ID);
    const myChar       = myLobbyEntry?.character || {};

    colyseusRoom = await client.joinOrCreate('arena', {
      clientId:  MY_ID,
      username:  sessionStorage.getItem('lobbyUsername') || 'Player',
      role:      MY_ROLE  || 'villain',
      cls:       MY_CLASS || 'brute',
      name:      MY_NAME  || 'Unknown',
      charName:  MY_NAME  || 'Unknown',
      str:       myChar.str || 70,
      mag:       myChar.mag || 60,
      def:       myChar.def || 30,
      spd:       myChar.spd || 50,
      pow:       myChar.pow || 40,
    });

    console.log('[Colyseus] Joined room:', colyseusRoom.roomId);
    bindRoomEvents(colyseusRoom);

  } catch (err) {
    console.error('[Colyseus] Failed to join room:', err);
  }
}

// ── Bind room events ──────────────────────────────────────────────────────
function bindRoomEvents(room) {

<<<<<<< HEAD
  console.log('Spawning remote player', id, 'at', msg.position.x.toFixed(2), msg.position.y.toFixed(2), msg.position.z.toFixed(2));
  // by looking for a matching username in the lobby
  const lobbyPlayer = LOBBY.find(p => p.clientId === msg.clientId);
  const existingId  = lobbyPlayer ? `remote-player-${LOBBY.indexOf(lobbyPlayer)}` : null;
=======
  // ── State: player added ───────────────────────────────────────────────
  room.state.players.onAdd((player, sessionId) => {
    const isLocal = (player.clientId === MY_ID);
    console.log(`[Colyseus] Player added: ${sessionId} (${player.role}/${player.cls}) local=${isLocal}`);
>>>>>>> 6d7de8c (maybe something)

    if (isLocal) {
      // Register local player in game.js character map
      addCharacter('villain', player.role, player.cls, {
        name:     player.charName,
        strength: player.strength * 100,
        magic:    player.magic    * 100,
        defense:  player.defense  * 100,
        speed:    player.speed    * 100,
        power:    player.power    * 100,
      }, 'player-villain');

      // Update model to match selected class
      const modelEl = document.getElementById('villain-model');
      if (modelEl) modelEl.setAttribute('src', `#${CLASS_MODEL[player.cls] || 'model-brute'}`);

      const playerEl = document.getElementById('player-villain');
      if (playerEl) {
        playerEl.setAttribute('attack-input', `characterId: villain; attackClass: ${player.cls}`);
        playerEl.dataset.characterId = 'villain';
      }

    } else {
      // Spawn remote player entity in the A-Frame scene
      spawnRemoteEntity(sessionId, player);

      // Register in game.js character map
      addCharacter(sessionId, player.role, player.cls, {
        name:     player.charName,
        strength: player.strength * 100,
        magic:    player.magic    * 100,
        defense:  player.defense  * 100,
        speed:    player.speed    * 100,
        power:    player.power    * 100,
      }, sessionId);
    }

    // Listen for position changes on this player (authoritative from server)
    player.listen('x',    (val) => updateEntityPosition(sessionId, player, isLocal));
    player.listen('y',    (val) => updateEntityPosition(sessionId, player, isLocal));
    player.listen('z',    (val) => updateEntityPosition(sessionId, player, isLocal));
    player.listen('rotY', (val) => updateEntityRotation(sessionId, player, isLocal));

    // Listen for health changes
    player.listen('health', (val) => {
      const charId = isLocal ? 'villain' : sessionId;
      emit(GAME_EVENTS.HEALTH_CHANGED, {
        characterId: charId,
        health:      val,
        maxHealth:   player.maxHealth,
      });
      // Keep game.js in sync
      const char = characters.get(charId);
      if (char) char.health = val;
    });

    // Listen for isAlive changes
    player.listen('isAlive', (val) => {
      const charId = isLocal ? 'villain' : sessionId;
      const char   = characters.get(charId);
      if (char) char.isAlive = val;
    });
  });

  // ── State: player removed ─────────────────────────────────────────────
  room.state.players.onRemove((player, sessionId) => {
    const el = remoteEntities[sessionId];
    if (el && el.parentNode) el.parentNode.removeChild(el);
    delete remoteEntities[sessionId];
    characters.delete(sessionId);
    console.log(`[Colyseus] Player removed: ${sessionId}`);
  });

  // ── Messages from server ──────────────────────────────────────────────

  // Server confirmed the match can begin
  room.onMessage('matchStarted', (data) => {
    console.log('[Colyseus] Match started:', data);
    // Map server sessionIds to character ids for initMatch
    const villainCharId = data.villainSessionId === room.sessionId
      ? 'villain'
      : data.villainSessionId;
    const heroCharIds = data.heroSessionIds.map(sid =>
      sid === room.sessionId ? 'villain' : sid
    );
    if (typeof initMatch === 'function') initMatch(villainCharId, heroCharIds);
  });

  // Server broadcast a hit effect (visual feedback + UI log)
  room.onMessage('hitEffect', (data) => {
    const attackerCharId = data.attackerSessionId === room.sessionId ? 'villain' : data.attackerSessionId;
    const targetCharId   = data.targetSessionId   === room.sessionId ? 'villain' : data.targetSessionId;
    emit(GAME_EVENTS.MELEE_FIRED, { attackerId: attackerCharId, defenderId: targetCharId });
  });

  // Server says spawn a projectile (visual only — damage handled server-side via magicHit)
  room.onMessage('spawnProjectile', (data) => {
    const scene = document.querySelector('a-scene');
    if (!scene) return;
    const ownerCharId = data.ownerSessionId === room.sessionId ? 'villain' : data.ownerSessionId;
    const proj = document.createElement('a-sphere');
    proj.setAttribute('radius',     '0.2');
    proj.setAttribute('color',      '#f39c12');
    proj.setAttribute('position',   `${data.x} ${data.y} ${data.z}`);
    proj.setAttribute('projectile', `attackerId: ${ownerCharId}; dirX: ${data.dirX}; dirY: ${data.dirY}; dirZ: ${data.dirZ};`);
    proj.classList.add('projectile-entity');
    scene.appendChild(proj);
  });

  // Server says someone was healed
  room.onMessage('healEffect', (data) => {
    const healerCharId = data.healerSessionId === room.sessionId ? 'villain' : data.healerSessionId;
    const healeeCharId = data.healeeSessionId === room.sessionId ? 'villain' : data.healeeSessionId;
    emit(GAME_EVENTS.HEAL_PERFORMED, { healerId: healerCharId, healeeId: healeeCharId });
  });

  // Server says a player died
  room.onMessage('playerDied', (data) => {
    const charId = data.sessionId === room.sessionId ? 'villain' : data.sessionId;
    if (typeof handleDeath === 'function') handleDeath(charId);
  });

  // Server says match is over
  room.onMessage('matchOver', (data) => {
    if (typeof endMatch === 'function' && typeof getState === 'function' && getState() === STATES.BATTLE) {
      endMatch(data.winner);
    }
  });

  // ── Start sending position updates ────────────────────────────────────
  startPositionBroadcast();
}

// ── Send position to Colyseus every 50ms ─────────────────────────────────
function startPositionBroadcast() {
  setInterval(() => {
    if (!colyseusRoom) return;
    const el = document.getElementById('player-villain') ||
               document.querySelector('[player-physics]');
    if (!el) return;
    const pos = el.object3D.position;
    const rot = el.object3D.rotation;
    colyseusRoom.send('move', { x: pos.x, y: pos.y, z: pos.z, rotY: rot.y });
  }, 50);
}

// ── Spawn a remote player A-Frame entity ─────────────────────────────────
function spawnRemoteEntity(sessionId, player) {
  if (remoteEntities[sessionId]) return;

  const scene    = document.querySelector('a-scene');
  const modelId  = CLASS_MODEL[player.cls] || 'model-tank';
  const nickname = player.charName || player.username || 'Player';

  const entity = document.createElement('a-entity');
  entity.setAttribute('id',       sessionId);
  entity.dataset.characterId = sessionId;
  entity.setAttribute('position', `${player.x} ${player.y} ${player.z}`);
  entity.setAttribute('health-bar', `nickname: ${nickname}; health: 100; maxHealth: 100`);

  const model = document.createElement('a-gltf-model');
  model.setAttribute('src',   `#${modelId}`);
  model.setAttribute('scale', '0.8 0.8 0.8');
  entity.appendChild(model);

  scene.appendChild(entity);
  remoteEntities[sessionId] = entity;
}

// ── Apply server position to entity (remote players only) ────────────────
function updateEntityPosition(sessionId, player, isLocal) {
  if (isLocal) return; // local player is moved by player-physics
  const el = remoteEntities[sessionId];
  if (!el) return;

  // Lerp smoothly toward server position
  const pos = el.object3D.position;
  pos.x = THREE.MathUtils.lerp(pos.x, player.x, 0.3);
  pos.y = THREE.MathUtils.lerp(pos.y, player.y, 0.3);
  pos.z = THREE.MathUtils.lerp(pos.z, player.z, 0.3);
}

function updateEntityRotation(sessionId, player, isLocal) {
  if (isLocal) return;
  const el = remoteEntities[sessionId];
  if (!el) return;
  el.object3D.rotation.y = THREE.MathUtils.lerp(el.object3D.rotation.y, player.rotY, 0.3);
}

// ── Send helpers (called from physics.js) ────────────────────────────────

function sendMeleeHit(targetCharId, damage) {
  if (!colyseusRoom) return;
  // Find the sessionId for this character
  const targetSessionId = charIdToSessionId(targetCharId);
  if (!targetSessionId) return;
  colyseusRoom.send('melee', { targetSessionId, damage });
}

function sendMagicEvent(direction) {
  if (!colyseusRoom) return;
  const el  = document.getElementById('player-villain') || document.querySelector('[player-physics]');
  const pos = el ? el.object3D.position : { x: 0, y: 1, z: 0 };
  colyseusRoom.send('magic', {
    x: pos.x, y: pos.y + 1, z: pos.z,
    dirX: direction.x, dirY: direction.y, dirZ: direction.z,
  });
}

function sendHealEvent(healerCharId, healeeCharId) {
  if (!colyseusRoom) return;
  colyseusRoom.send('heal', {
    targetSessionId: charIdToSessionId(healeeCharId) || colyseusRoom.sessionId,
  });
}

// Report a projectile hit to the server for authoritative damage
function sendMagicHit(ownerCharId, targetCharId) {
  if (!colyseusRoom) return;
  colyseusRoom.send('magicHit', {
    ownerSessionId:  charIdToSessionId(ownerCharId)  || colyseusRoom.sessionId,
    targetSessionId: charIdToSessionId(targetCharId) || '',
  });
}

// ── Utility: map character id back to Colyseus sessionId ─────────────────
function charIdToSessionId(charId) {
  if (charId === 'villain') return colyseusRoom?.sessionId;
  // Remote characters are keyed by sessionId directly
  return charId;
}

// ── Boot: connect once the scene is ready ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene');
  const doConnect = () => connectToColyseus();
  if (scene && scene.hasLoaded) doConnect();
  else if (scene) scene.addEventListener('loaded', doConnect);
  else doConnect();
});