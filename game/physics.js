// ============================================
// PLAYER PHYSICS COMPONENT
// handles WASD movement and jumping
// ============================================
AFRAME.registerComponent('player-physics', {

    init() {
        this.keys = {};
        this.canJump = false;
        this.jumping = false;
        this.speed = 5;
        this.jumpForce = 12;

        this.onKeyDown = (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Space' && this.canJump) {
                this.jump();
            }
        };
        this.onKeyUp = (e) => { this.keys[e.code] = false; };

        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup',   this.onKeyUp);

        this.el.addEventListener('collide', (e) => {
            this.onCollide(e);
        });
    },

    jump() {
        const body = this.el.components['dynamic-body'].body;
        if (!body) return;
        body.velocity.set(0, this.jumpForce, 0);
        this.canJump = false;
        this.jumping = true;
    },

    onCollide(e) {
        const contact = e.detail.contact;
        if (!contact) return;
        const normal = contact.ni;
        if (normal.y > 0.5) {
            this.canJump = true;
            this.jumping = false;
        }
    },

    tick(time, delta) {
        if (typeof isSpectating !== 'undefined' && isSpectating) return;

        const bodyComponent = this.el.components['dynamic-body'];
        if (!bodyComponent || !bodyComponent.body) return;
        const body = bodyComponent.body;

        const cam = document.getElementById('main-camera');
        if (!cam) return;
        const worldQuat = new THREE.Quaternion();
        cam.object3D.getWorldQuaternion(worldQuat);
        const euler = new THREE.Euler();
        euler.setFromQuaternion(worldQuat, 'YXZ');
        const angle = euler.y;

        const moveX = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
        const moveZ = (this.keys['KeyS'] ? 1 : 0) - (this.keys['KeyW'] ? 1 : 0);
        const vx = moveX * Math.cos(angle) + moveZ * Math.sin(angle);
        const vz = -moveX * Math.sin(angle) + moveZ * Math.cos(angle);
        const spd = this.speed * (delta / 1000) * 60;
        body.velocity.x = vx * spd;
        body.velocity.z = vz * spd;

        const isFalling = body.velocity.y < -0.1;
        if (isFalling) {
            this.canJump = false;
            this.jumping = false;
        }
        if (this.canJump && !this.jumping) {
            body.velocity.y = Math.max(body.velocity.y, 0);
        }

        body.quaternion.set(0, body.quaternion.y, 0, body.quaternion.w);

        // rotate villain model to face camera direction
        const modelEl = document.getElementById('villain-model');
        if (modelEl) modelEl.object3D.rotation.y = euler.y + Math.PI;

        // rotate sword with same yaw + optional pitch
        const weaponEl = document.getElementById('local-weapon');
        if (weaponEl) {
          weaponEl.object3D.rotation.y = euler.y;
          weaponEl.object3D.rotation.x = euler.x;
        }
    },

    remove() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup',   this.onKeyUp);
    },
});

// ============================================
// MELEE HITBOX COMPONENT
// ============================================
AFRAME.registerComponent('melee-hitbox', {
  schema: {
    characterId: { type: 'string' },
    duration:    { type: 'number', default: 300 },
  },

  init() {
    this.active   = false;
    this.hitbox   = null;
    this.hitTimer = null;
  },

  spawn() {
    if (this.active) return;
    this.active = true;
    this.checkHits();
    this.hitTimer = setTimeout(() => this.despawn(), this.data.duration);
  },

  checkHits() {
    const attacker = characters.get(this.data.characterId);
    if (!attacker) return;

    const myPos = this.el.object3D.position;

    characters.forEach(target => {
      if (target.role === attacker.role) return;
      if (!target.isAlive)               return;

      const targetEl = document.getElementById(target.entityId);
      if (!targetEl) return;

      const targetPos = targetEl.object3D.position;
      const dist      = myPos.distanceTo(targetPos);

      if (dist <= MELEE_RANGE) {
        const damage = calcDamage(attacker, target, 'strength');
        applyHit(this.data.characterId, target.id, 'strength');
        if (typeof sendAttackEvent === 'function') sendAttackEvent('melee', target.id, damage);
      }
    });
  },

  despawn() {
    this.active = false;
    if (this.hitbox && this.hitbox.parentNode) {
      this.hitbox.parentNode.removeChild(this.hitbox);
      this.hitbox = null;
    }
    clearTimeout(this.hitTimer);
  },

  remove() {
    this.despawn();
  },
});

// ============================================
// ATTACK INPUT COMPONENT
// ============================================
AFRAME.registerComponent('attack-input', {

  schema: {
    characterId: { type: 'string', default: 'villain' },
    attackClass:  { type: 'string', default: 'brute' },
  },

  init() {
    this.magicClasses = ['mage', 'villain_mage'];

    this.onMouseDown = (e) => {
      if (e.button !== 0) return;
      if (typeof isSpectating !== 'undefined' && isSpectating) return;
      if (getState() !== STATES.BATTLE) return;

      const isMagic = this.magicClasses.includes(this.data.attackClass);
      if (isMagic) {
        this.doMagic();
      } else {
        this.doMelee();
      }
    };

    this.onHealKey = (e) => {
      if (e.code !== 'KeyH') return;
      if (typeof getState === 'function' && getState() !== STATES.BATTLE) return;
      const charId = this.data.characterId;
      const char   = characters.get(charId);
      if (!char || !char.isAlive || char.role !== 'hero') return;
      let nearestId = charId, nearestDist = Infinity;
      characters.forEach(c => {
        if (c.role !== 'hero' || !c.isAlive) return;
        const el = document.getElementById(c.entityId);
        if (!el) return;
        const d = this.el.object3D.position.distanceTo(el.object3D.position);
        if (d < nearestDist) { nearestDist = d; nearestId = c.id; }
      });
      performHeal(charId, nearestId);
    };

    this.onContextMenu = (e) => e.preventDefault();
    window.addEventListener('mousedown',   this.onMouseDown);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown',     this.onHealKey);

    // spawn permanent weapon after entity loads
    // this.el.addEventListener('loaded', () => {
    //   this.spawnPermanentWeapon();
    // });
  },

  spawnPermanentWeapon() {
    const magicClasses = ['mage', 'villain_mage'];
    const isMagic = magicClasses.includes(this.data.attackClass);

    if (isMagic) return;

    console.log('[WEAPON] spawning sword | attackClass:', this.data.attackClass);

    const weapon = document.createElement('a-gltf-model');
    weapon.setAttribute('id',       'local-weapon');
    weapon.setAttribute('src',      '#sword');
    weapon.setAttribute('scale',    '0.08 0.08 0.08');
    weapon.setAttribute('position', '0 0.2 0.5');
    weapon.setAttribute('rotation', '0 0 -45');

    this.el.appendChild(weapon);
  },

  doMelee() {
    const char = characters.get(this.data.characterId);
    if (!char || !char.isAlive) return;
    const hitboxComp = this.el.components['melee-hitbox'];
    if (hitboxComp) hitboxComp.spawn();
  },

  doMagic() {
    const char = characters.get(this.data.characterId);
    if (!char || !char.isAlive) return;
    const cam       = document.getElementById('main-camera');
    const worldQuat = new THREE.Quaternion();
    cam.object3D.getWorldQuaternion(worldQuat);
    const dir       = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuat).normalize();
    const direction = { x: dir.x, y: dir.y, z: dir.z };

    const fired = performMagic(this.data.characterId, direction);
    if (!fired) return;

    if (typeof sendAbilityCast === 'function') {
      sendAbilityCast('magic', { direction });
    }
  },

  getNearestEnemy() {
    const char = characters.get(this.data.characterId);
    if (!char) return null;

    let nearest     = null;
    let nearestDist = MELEE_RANGE;

    characters.forEach(c => {
      if (c.role === char.role) return;
      if (!c.isAlive)           return;

      const targetEl = document.getElementById(c.entityId);
      if (!targetEl) return;

      const myPos     = this.el.object3D.position;
      const targetPos = targetEl.object3D.position;
      const dist      = myPos.distanceTo(targetPos);

      if (dist < nearestDist) {
        nearestDist = dist;
        nearest     = c;
      }
    });

    return nearest;
  },

  remove() {
    window.removeEventListener('mousedown',   this.onMouseDown);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown',     this.onHealKey);
  },
});