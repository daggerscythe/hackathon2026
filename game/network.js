// ============================================
// NETWORK — multiplayer sync (messages go through transport.js)
// Depends on game.js and transport.js. Remote players are created by
// match-setup.js. In solo mode every send is a no-op.
//
// Every client simulates its own character and reports the results
// (damage dealt, heals, deaths) to the others through the relay.
// ============================================

const SEND_RATE = 50; // ms between position updates (20 Hz)

const remoteTargets = {}; // entityId → { position, rotation }

function connectToGame() {
  if (!Net.isMultiplayer) return;
  Object.entries(MESSAGE_HANDLERS).forEach(([method, fn]) => Net.on(method, fn));
  Net.connect();
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
  Net.send('playerMove', {
    position: { x: pos.x, y: pos.y, z: pos.z },
    rotation: { y: angles.y },
  });
}

/** Report damage this client dealt to another character. */
function sendAttackEvent(attackType, targetId, damage) {
  Net.send('playerAttack', { attackType, targetId, damage });
}

/** Report a heal this client performed. */
function sendHealEvent(targetId, amount) {
  Net.send('playerHeal', { targetId, amount });
}

/** Visual-only sync (e.g. a fireball the others should see). */
function sendAbilityCast(ability, payload = {}) {
  Net.send('abilityCast', { ability, ...payload });
}

// local player died → tell everyone
onCharacterDefeated(({ characterId }) => {
  if (characterId === LOCAL_ID) Net.send('playerDied', { characterId });
});

// this client decided the match result → tell everyone (never echo remote results).
// Deferred one tick so the killing blow's playerAttack/playerHeal message,
// sent right after the hit resolves, reaches the others first.
onMatchOver(({ winner, duration, remote }) => {
  if (!remote) setTimeout(() => Net.send('matchOver', { winner, duration }), 0);
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
    if (msg.ability === 'melee') {
      emit(GAME_EVENTS.MELEE_SWING, { attackerId: msg.clientId });
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

      // turn the model (and the sword it holds) toward the reported camera yaw
      const model = el._model || (el._model = el.querySelector('.char-model'));
      if (model) {
        const rot  = model.object3D.rotation;
        const want = target.rotation.y + Math.PI;
        rot.y += Math.atan2(Math.sin(want - rot.y), Math.cos(want - rot.y)) * t;
      }
    }
  },
});
