// ============================================
// LOCAL PLAYER — movement, jumping, and attack input
// Depends on game.js
// ============================================

const BASE_MOVE_SPEED = 5;   // units per second at speed multiplier 1.0
const JUMP_FORCE      = 12;

// scratch objects reused every frame
const _camQuat  = new THREE.Quaternion();
const _camEuler = new THREE.Euler();

/** Camera yaw/pitch in world space (works with pointer-lock look-controls). */
function getCameraAngles() {
  const cam = document.getElementById('main-camera');
  if (!cam) return null;
  cam.object3D.getWorldQuaternion(_camQuat);
  _camEuler.setFromQuaternion(_camQuat, 'YXZ');
  return _camEuler;
}

// ============================================
// PLAYER PHYSICS COMPONENT — WASD + jump
// ============================================
AFRAME.registerComponent('player-physics', {

  init() {
    this.keys    = {};
    this.canJump = false;
    this.jumping = false;

    this.onKeyDown = (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space' && this.canJump) this.jump();
    };
    this.onKeyUp = (e) => { this.keys[e.code] = false; };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup',   this.onKeyUp);
    this.el.addEventListener('collide', (e) => this.onCollide(e));
  },

  /** Movement speed from the local character's CSV speed stat. */
  moveSpeed() {
    const char = getLocalCharacter();
    return BASE_MOVE_SPEED * (char ? speedMultiplier(char.speed * 100) : 1);
  },

  jump() {
    const body = this.el.components['dynamic-body']?.body;
    if (!body) return;
    body.velocity.set(body.velocity.x, JUMP_FORCE, body.velocity.z);
    this.canJump = false;
    this.jumping = true;
  },

  onCollide(e) {
    const contact = e.detail.contact;
    if (contact && contact.ni.y > 0.5) {
      this.canJump = true;
      this.jumping = false;
    }
  },

  tick() {
    if (typeof isSpectating !== 'undefined' && isSpectating) return;

    const body = this.el.components['dynamic-body']?.body;
    if (!body) return;

    const angles = getCameraAngles();
    if (!angles) return;
    const yaw = angles.y;

    const inBattle = getState() === STATES.BATTLE;
    const moveX = inBattle ? (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0) : 0;
    const moveZ = inBattle ? (this.keys['KeyS'] ? 1 : 0) - (this.keys['KeyW'] ? 1 : 0) : 0;
    const len   = Math.hypot(moveX, moveZ) || 1; // no faster diagonals
    const spd   = this.moveSpeed();

    body.velocity.x = ((moveX * Math.cos(yaw) + moveZ * Math.sin(yaw)) / len) * spd;
    body.velocity.z = ((-moveX * Math.sin(yaw) + moveZ * Math.cos(yaw)) / len) * spd;

    if (body.velocity.y < -0.1) {
      this.canJump = false;
      this.jumping = false;
    }
    if (this.canJump && !this.jumping) {
      body.velocity.y = Math.max(body.velocity.y, 0);
    }

    // stay upright
    body.quaternion.set(0, body.quaternion.y, 0, body.quaternion.w);
  },

  remove() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup',   this.onKeyUp);
  },
});

// ============================================
// ATTACK INPUT COMPONENT — mouse buttons by class
//   melee classes : LMB swing
//   mage classes  : LMB fireball
//   support       : LMB heal nearest ally, RMB heal self
// ============================================
AFRAME.registerComponent('attack-input', {

  schema: {
    attackClass: { type: 'string', default: 'brute' },
  },

  init() {
    this.onMouseDown = (e) => {
      if (getState() !== STATES.BATTLE) return;
      if (typeof isSpectating !== 'undefined' && isSpectating) return;

      if (this.data.attackClass === 'support') {
        if (e.button === 0) this.doHealAlly();
        if (e.button === 2) this.doHealSelf();
        return;
      }

      if (e.button !== 0) return;
      if (MAGIC_CLASSES.includes(this.data.attackClass)) this.doMagic();
      else this.doMelee();
    };

    this.onContextMenu = (e) => e.preventDefault();

    window.addEventListener('mousedown',   this.onMouseDown);
    window.addEventListener('contextmenu', this.onContextMenu);
  },

  /** First-person sword in the lower right of the view (melee classes only). */
  spawnPermanentWeapon() {
    if (MAGIC_CLASSES.includes(this.data.attackClass) || this.data.attackClass === 'support') return;
    if (document.getElementById('local-weapon')) return;

    const weapon = document.createElement('a-entity');
    weapon.setAttribute('id',           'local-weapon');
    weapon.setAttribute('gltf-model',   '#sword');
    weapon.setAttribute('scale',        '0.4 0.4 0.4');
    weapon.setAttribute('position',     '0.36 -0.4 -0.65');
    weapon.setAttribute('rotation',     '-30 0 12');
    weapon.setAttribute('weapon-swing', `characterId: ${LOCAL_ID}; amount: -75`);
    document.getElementById('main-camera').appendChild(weapon);
  },

  doMelee() {
    const me = getLocalCharacter();
    if (!me || !me.isAlive || isOnCooldown(LOCAL_ID, 'melee')) return;
    const angles = getCameraAngles();
    const hits = performMeleeSwing(LOCAL_ID, angles ? angles.y : undefined);
    if (typeof sendAbilityCast === 'function') sendAbilityCast('melee');
    if (typeof sendAttackEvent === 'function') {
      hits.forEach(h => sendAttackEvent('melee', h.targetId, h.damage));
    }
  },

  doMagic() {
    const angles = getCameraAngles();
    if (!angles) return;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(_camQuat).normalize();
    const direction = { x: dir.x, y: dir.y, z: dir.z };

    if (performMagic(LOCAL_ID, direction) && typeof sendAbilityCast === 'function') {
      sendAbilityCast('magic', { direction });
    }
  },

  doHealAlly() {
    const me = getLocalCharacter();
    if (!me || !me.isAlive) return;

    const myPos = this.el.object3D.position;
    let nearestId = null, nearestDist = Infinity;
    characters.forEach(c => {
      if (c.id === me.id || c.role !== 'hero' || !c.isAlive) return;
      const el = document.getElementById(c.entityId);
      if (!el) return;
      const d = myPos.distanceTo(el.object3D.position);
      if (d < nearestDist) { nearestDist = d; nearestId = c.id; }
    });

    // no allies left — fall back to healing yourself
    this.heal(nearestId || me.id);
  },

  doHealSelf() {
    this.heal(LOCAL_ID);
  },

  heal(targetId) {
    const amount = performHeal(LOCAL_ID, targetId);
    if (amount > 0 && typeof sendHealEvent === 'function') sendHealEvent(targetId, amount);
  },

  remove() {
    window.removeEventListener('mousedown',   this.onMouseDown);
    window.removeEventListener('contextmenu', this.onContextMenu);
  },
});
