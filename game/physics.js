// ============================================
// PLAYER PHYSICS COMPONENT
// handles WASD movement and jumping
// ============================================
AFRAME.registerComponent('player-physics', {

    init() {
        this.keys = {};
        this.canJump = false; // only jump when on the ground
        this.jumping = false;
        this.speed = 5;
        this.jumpForce = 12;

        // track keys
        this.onKeyDown = (e) => {
            this.keys[e.code] = true;

            // jump on Space
            if (e.code === 'Space' && this.canJump) {
            this.jump();
            }
        };
        this.onKeyUp = (e) => { this.keys[e.code] = false; };

        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup',   this.onKeyUp);

        // when player hits something check if its below the player
        this.el.addEventListener('collide', (e) => {
            this.onCollide(e);
        });
    },

    jump() {
        const body = this.el.components['dynamic-body'].body;
        if (!body) return;

        // apply an upward impulse at the players center
        body.velocity.set(0, this.jumpForce, 0);
        this.canJump = false;
        this.jumping = true;

        console.log('jumped!');
    },

    onCollide(e) {
        // check if what player hits is below by comparing contact normal
        const contact = e.detail.contact;
        if (!contact) return;

        const normal = contact.ni; // collision normal vector

        // if the normal is pointing mostly upward, player on top something
        if (normal.y > 0.5) {
            this.canJump = true;
            this.jumping = false;
        }
    },

    tick(time, delta) {
        const bodyComponent = this.el.components['dynamic-body'];
        if (!bodyComponent || !bodyComponent.body) return;
        const body = bodyComponent.body;

        const cam = document.getElementById('main-camera');
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

        // rotate villain model to face camera direction — NOT the physics entity
        const modelEl = document.getElementById('villain-model');
        if (modelEl) modelEl.object3D.rotation.y = euler.y;
        },

    remove() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup',   this.onKeyUp);
    },
});

// ============================================
// MELEE HITBOX COMPONENT
// Spawns a visible collision box in front of
// the player on attack, despawns after duration
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

  /**
   * Call this to spawn the hitbox.
   * The box is visible via physics debug wireframe.
   */
  spawn() {
    if (this.active) return; // prevent spam
    this.active = true;

    // // get player's world position and facing direction
    // const playerPos  = this.el.object3D.position;
    // const worldQuat  = new THREE.Quaternion();
    // this.el.object3D.getWorldQuaternion(worldQuat);
    // const forward    = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuat);

    // // place hitbox 1 unit in front of player in world space
    // const hitPos = new THREE.Vector3(
    //     playerPos.x + forward.x * 1.0,
    //     playerPos.y + 1.0,
    //     playerPos.z + forward.z * 1.0,
    // );

    // // create a box in front of the player
    // const box = document.createElement('a-box');
    // box.setAttribute('width',    '1.2');
    // box.setAttribute('height',   '1.2');
    // box.setAttribute('depth',    '0.8');
    // box.setAttribute('position', `${hitPos.x} ${hitPos.y} ${hitPos.z}`);
    // box.setAttribute('color',    '#ffff00');
    // box.setAttribute('opacity',  '0.3');         // semi-transparent so you can see it

    // // append to SCENE, not player entity
    // const scene = document.querySelector('a-scene');
    // scene.appendChild(box);
    // this.hitbox = box;

    // check for hits while active
    this.checkHits();

    // despawn after duration
    this.hitTimer = setTimeout(() => this.despawn(), this.data.duration);
  },

  checkHits() {
    const attacker = characters.get(this.data.characterId);
    if (!attacker) return;

    const myPos = this.el.object3D.position;

    // check all registered characters
    characters.forEach(target => {
      if (target.role === attacker.role) return; // skip teammates
      if (!target.isAlive)               return;

      const targetEl = document.getElementById(target.entityId);
      if (!targetEl) return;

      const targetPos = targetEl.object3D.position;
      const dist      = myPos.distanceTo(targetPos);

      if (dist <= MELEE_RANGE) {
        const damage = calcDamage(attacker, target, 'strength');
        applyHit(this.data.characterId, target.id, 'strength');

        // tell other clients about this hit
        if (typeof sendAttackEvent === 'function') {
            sendAttackEvent('melee', target.id, damage);
        }
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
// Attach to the local player entity
// Left click = melee (sword) or magic (fireball) depending on class
// ============================================
AFRAME.registerComponent('attack-input', {

  schema: {
    characterId: { type: 'string', default: 'villain' },
    attackClass:  { type: 'string', default: 'brute' }, // determines sword vs magic
  },

  init() {
    // classes that use magic — matches CLASS_ATTACK_TYPE in game.js
    this.magicClasses = ['mage', 'villain_mage'];

    this.onMouseDown = (e) => {
      if (e.button !== 0) return; // left click only
      if (getState() !== STATES.BATTLE) return;

      const isMagic = this.magicClasses.includes(this.data.attackClass);
      if (isMagic) {
        this.doMagic();
      } else {
        this.doMelee();
      }
    };
    
    // prevent right click context menu
    this.onContextMenu = (e) => e.preventDefault();

    window.addEventListener('mousedown',   this.onMouseDown);
    window.addEventListener('contextmenu', this.onContextMenu);
  },

  // ---- MELEE ----
  doMelee() {
    const char = characters.get(this.data.characterId);
    if (!char || !char.isAlive) return;

    // show sword sprite
    this.showWeapon('sword', '0.5 0.5 0.5', 300);

    // spawn visible hitbox and check hits
    const hitboxComp = this.el.components['melee-hitbox'];
    if (hitboxComp) hitboxComp.spawn();
  },

  // ---- MAGIC ----
  doMagic() {
    const char = characters.get(this.data.characterId);
    if (!char || !char.isAlive) return;

    // get camera facing direction
    const cam       = document.getElementById('main-camera');
    const worldQuat = new THREE.Quaternion();
    cam.object3D.getWorldQuaternion(worldQuat);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuat).normalize();

    performMagic(this.data.characterId, { x: dir.x, y: dir.y, z: dir.z });

    // show fireball sprite briefly at spawn point
    this.showWeapon('fireball', '0.3 0.3 0.3', 400);
  },

  /**
   * Spawns a flat sprite in front of the player temporarily.
   * @param {string} src       - image path
   * @param {number} w         - width
   * @param {number} h         - height
   * @param {number} zOffset   - how far in front of player
   * @param {number} yOffset   - height offset
   * @param {number} duration  - ms before disappearing
   */


  showWeapon(assetId, scale, duration) {
    // get player world position and facing direction
    const playerPos = new THREE.Vector3();
    this.el.object3D.getWorldPosition(playerPos);

    const worldQuat = new THREE.Quaternion();
    this.el.object3D.getWorldQuaternion(worldQuat);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuat);

    // place weapon 1 unit in front, at chest height
    const spawnPos = new THREE.Vector3(
        playerPos.x + forward.x * 1.0,
        playerPos.y + 1.0,
        playerPos.z + forward.z * 1.0,
    );

    const weapon = document.createElement('a-gltf-model');
    weapon.setAttribute('src',      `#${assetId}`);
    weapon.setAttribute('scale',    scale);
    weapon.setAttribute('position', `${spawnPos.x} ${spawnPos.y} ${spawnPos.z}`);
    weapon.setAttribute('rotation', `0 ${THREE.MathUtils.radToDeg(worldQuat.y * 2)} 0`);

    // append to SCENE not player
    const scene = document.querySelector('a-scene');
    scene.appendChild(weapon);

    setTimeout(() => {
        if (weapon.parentNode) weapon.parentNode.removeChild(weapon);
    }, duration);
    },

  /**
   * Finds nearest living enemy within MELEE_RANGE.
   * Reuses the same logic pattern as player-physics.
   */
  getNearestEnemy() {
    const char = characters.get(this.data.characterId);
    if (!char) return null;

    let nearest     = null;
    let nearestDist = MELEE_RANGE; // only hit if within range

    characters.forEach(c => {
      if (c.role === char.role) return; // skip same team
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
},
});