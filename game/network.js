// ============================================
// NETWORK — multiplayer sync over WebSocket
// Depends on game.js. Remote players are created by match-setup.js.
//
// Every client simulates its own character and reports the results
// (damage dealt, heals, deaths) to the others through the server relay.
// ============================================

const GAME_ID    = sessionStorage.getItem('gameId');
const SERVER_URL = sessionStorage.getItem('serverUrl');
const SEND_RATE  = 50; // ms between position updates (20 Hz)

const remoteTargets = {}; // entityId → { position, rotation }

let ws = null;

function wsSend(method, payload = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ method, clientId: LOCAL_ID, gameId: GAME_ID, ...payload }));
}

function connectToGame() {
  if (!SERVER_URL || !GAME_ID) return;

  ws = new WebSocket(SERVER_URL);
  ws.onopen  = () => wsSend('identify', { username: sessionStorage.getItem('lobbyUsername') });
  ws.onerror = (e) => console.error('[Network] WebSocket error', e);
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    const handler = MESSAGE_HANDLERS[msg.method];
    if (handler) handler(msg);
  };

  setInterval(sendPosition, SEND_RATE);
}

// ============================================
// OUTGOING
// ============================================
function sendPosition() {
  const playerEl = document.getElementById(LOCAL_ENTITY);
  const angles   = typeof getCameraAngles === 'function' ? getCameraAngles() : null;
  if (!playerEl || !angles) return;

  const pos = playerEl.object3D.position;
  wsSend('playerMove', {
    position: { x: pos.x, y: pos.y, z: pos.z },
    rotation: { y: angles.y },
  });
}

/** Report damage this client dealt to another character. */
function sendAttackEvent(attackType, targetId, damage) {
  wsSend('playerAttack', { attackType, targetId, damage });
}

/** Report a heal this client performed. */
function sendHealEvent(targetId, amount) {
  wsSend('playerHeal', { targetId, amount });
}

/** Visual-only sync (e.g. a fireball the others should see). */
function sendAbilityCast(ability, payload = {}) {
  wsSend('abilityCast', { ability, ...payload });
}

// local player died → tell everyone
onCharacterDefeated(({ characterId }) => {
  if (characterId === LOCAL_ID) wsSend('playerDied', { characterId });
});

// this client decided the match result → tell everyone (never echo remote results).
// Deferred one tick so the killing blow's playerAttack/playerHeal message,
// sent right after the hit resolves, reaches the others first.
onMatchOver(({ winner, duration, remote }) => {
  if (!remote) setTimeout(() => wsSend('matchOver', { winner, duration }), 0);
});

// ============================================
// INCOMING
// ============================================
const MESSAGE_HANDLERS = {
  playerMove(msg) {
    remoteTargets[`remote-${msg.clientId}`] = { position: msg.position, rotation: msg.rotation };
  },

  playerAttack(msg) {
    applyDamage(msg.targetId, msg.damage, msg.clientId);
  },

  playerHeal(msg) {
    applyHealAmount(msg.targetId, msg.amount, msg.clientId);
  },

  playerDied(msg) {
    handleDeath(msg.characterId);
  },

  abilityCast(msg) {
    if (msg.ability === 'magic' && msg.direction) {
      emit(GAME_EVENTS.MAGIC_FIRED, { attackerId: msg.clientId, direction: msg.direction });
    }
  },

  matchOver(msg) {
    endMatch(msg.winner, true);
  },

  playerLeft(msg) {
    // a player who disconnects mid-match counts as defeated
    handleDeath(msg.clientId);
    const el = document.getElementById(`remote-${msg.clientId}`);
    if (el) el.setAttribute('visible', 'false');
    delete remoteTargets[`remote-${msg.clientId}`];
  },
};

// ============================================
// Smoothly move remote players toward their last reported position
// ============================================
AFRAME.registerComponent('network-lerp', {
  tick(time, delta) {
    const t = 1 - Math.pow(0.1, delta / 100);
    for (const [id, target] of Object.entries(remoteTargets)) {
      const el = document.getElementById(id);
      if (!el) continue;

      const pos = el.object3D.position;
      pos.x = THREE.MathUtils.lerp(pos.x, target.position.x, t);
      pos.y = THREE.MathUtils.lerp(pos.y, target.position.y, t);
      pos.z = THREE.MathUtils.lerp(pos.z, target.position.z, t);

      const model  = el._model  || (el._model  = el.querySelector('.char-model'));
      const weapon = el._weapon || (el._weapon = el.querySelector('.char-weapon'));
      if (model)  model.object3D.rotation.y  = THREE.MathUtils.lerp(model.object3D.rotation.y,  target.rotation.y + Math.PI, t);
      if (weapon) weapon.object3D.rotation.y = THREE.MathUtils.lerp(weapon.object3D.rotation.y, target.rotation.y, t);
    }
  },
});
