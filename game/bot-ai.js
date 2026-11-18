// ============================================
// BOT AI — drives solo-mode characters
// Depends on game.js, arena.js (and BASE_MOVE_SPEED from physics.js).
//
// Attach to a bot entity:  bot-brain="characterId: bot-1; difficulty: normal"
//
// Bots use exactly the same combat functions as players (performMeleeSwing,
// performMagic, performHeal), so CSV stats, cooldowns and damage rules apply
// to them unchanged. Each bot re-plans a few times per second ("think") and
// moves/faces smoothly every frame in between.
// ============================================

const BOT_DIFFICULTY = {
  //        ms between decisions | aim wobble (rad) | extra delay before a swing (ms) | how much they dodge
  easy:   { think: 650, aimError: 0.14, swingDelay: 650, strafe: 0.35 },
  normal: { think: 400, aimError: 0.07, swingDelay: 300, strafe: 0.65 },
  hard:   { think: 220, aimError: 0.03, swingDelay: 80,  strafe: 1.0  },
};

const BOT_MELEE_REACH   = MELEE_RANGE - 0.6; // close in a little past max range
const BOT_MAGE_RANGE    = [7, 12];           // preferred distance band for casters
const BOT_HEAL_RANGE    = 9;
const BOT_SEPARATION    = 1.6;               // personal space between characters
const BOT_RADIUS        = 0.45;              // body size used against walls and cover
const BOT_PROBE         = 2.5;               // how far ahead bots check for cover
const DETOUR_ANGLES     = [30, 60, 90, 120, 150].map(d => THREE.MathUtils.degToRad(d));

const _botTmp  = new THREE.Vector3();
const _botTmp2 = new THREE.Vector3();

// ============================================
// Tracks every character's ground velocity so casters can lead their shots.
// ============================================
const characterVelocity = new Map(); // characterId → THREE.Vector3 (units/sec)

AFRAME.registerSystem('char-velocity', {
  init() { this.last = new Map(); },

  tick(time, delta) {
    const dt = delta / 1000;
    if (dt <= 0) return;
    characters.forEach(c => {
      const p = document.getElementById(c.entityId)?.object3D.position;
      if (!p) return;
      const prev = this.last.get(c.id);
      if (!prev) { this.last.set(c.id, p.clone()); characterVelocity.set(c.id, new THREE.Vector3()); return; }
      const v = characterVelocity.get(c.id);
      // smoothed so one jittery frame doesn't throw the aim off
      v.lerp(_botTmp2.set((p.x - prev.x) / dt, 0, (p.z - prev.z) / dt), 0.2);
      prev.copy(p);
    });
  },
});

AFRAME.registerComponent('bot-brain', {
  schema: {
    characterId: { type: 'string' },
    difficulty:  { type: 'string', default: 'normal' },
  },

  init() {
    this.cfg        = BOT_DIFFICULTY[this.data.difficulty] || BOT_DIFFICULTY.normal;
    this.moveDir    = new THREE.Vector3();
    this.faceYaw    = 0;
    this.targetId   = null;
    this.nextThink  = 0;
    this.nextSwing  = 0;
    this.strafeSign = Math.random() < 0.5 ? -1 : 1;
    this.detourSign = Math.random() < 0.5 ? -1 : 1;
    this.nextStrafeFlip = 0;
    this.model  = this.el.querySelector('.char-model');
  },

  tick(time, delta) {
    if (getState() !== STATES.BATTLE) return;
    const me = characters.get(this.data.characterId);
    if (!me || !me.isAlive) return;

    if (time >= this.nextThink) {
      this.think(me, time);
      this.nextThink = time + this.cfg.think * (0.8 + Math.random() * 0.4);
    }

    this.move(me, Math.min(delta, 100) / 1000);
    this.act(me, time);
  },

  // ── helpers ──────────────────────────────────────────────────────────────
  pos(char) {
    return document.getElementById(char.entityId)?.object3D.position || null;
  },

  dist(a, b) {
    const pa = this.pos(a), pb = this.pos(b);
    return pa && pb ? Math.hypot(pa.x - pb.x, pa.z - pb.z) : Infinity;
  },

  living(filter) {
    return [...characters.values()].filter(c => c.isAlive && filter(c));
  },

  /** Unit XZ vector from me toward `char` (written into `out`). */
  dirTo(me, char, out) {
    const a = this.pos(me), b = this.pos(char);
    out.set(b.x - a.x, 0, b.z - a.z);
    if (out.lengthSq() > 1e-6) out.normalize();
    return out;
  },

  // ── decision making ──────────────────────────────────────────────────────
  think(me, time) {
    const enemies = this.living(c => c.role !== me.role);
    if (!enemies.length) { this.moveDir.set(0, 0, 0); return; }

    if (time >= this.nextStrafeFlip) {
      this.strafeSign = -this.strafeSign;
      this.nextStrafeFlip = time + 1200 + Math.random() * 1800;
    }

    if (me.chosenClass === 'support')            this.thinkSupport(me, enemies);
    else if (MAGIC_CLASSES.includes(me.chosenClass)) this.thinkCaster(me, enemies);
    else                                         this.thinkMelee(me, enemies);

    this.addSeparation(me);
    this.avoidObstacles(me);
  },

  /** Is there clear line of sight for a fireball from me to `char`? */
  canSee(me, char) {
    const a = this.pos(me), b = this.pos(char);
    return ArenaLayout.losClear(a.x, a.z, b.x, b.z, a.y + CHEST_HEIGHT);
  },

  /**
   * If cover is in the way, turn the move direction just enough to get
   * around it, preferring the side we detoured to last time.
   */
  avoidObstacles(me) {
    const len = this.moveDir.length();
    if (len < 0.05) return;
    const p = this.pos(me);
    const clear = (dx, dz) => ArenaLayout.pathClear(p.x, p.z, p.x + dx * BOT_PROBE, p.z + dz * BOT_PROBE, BOT_RADIUS);

    const dx = this.moveDir.x / len, dz = this.moveDir.z / len;
    if (clear(dx, dz)) return;

    for (const angle of DETOUR_ANGLES) {
      for (const sign of [this.detourSign, -this.detourSign]) {
        const a = angle * sign, c = Math.cos(a), s = Math.sin(a);
        const rx = dx * c - dz * s, rz = dx * s + dz * c;
        if (clear(rx, rz)) {
          this.detourSign = sign;
          this.moveDir.set(rx * len, 0, rz * len);
          return;
        }
      }
    }
  },

  /** Villains hunt the weakest nearby hero; heroes all go for the villain. */
  pickTarget(me, enemies) {
    const score = c => this.dist(me, c) + (c.health / c.maxHealth) * 6;
    const current = enemies.find(c => c.id === this.targetId);
    const best = enemies.reduce((a, b) => (score(a) <= score(b) ? a : b));
    // stick with the current target unless something is clearly better
    if (current && score(current) < score(best) + 3) return current;
    this.targetId = best.id;
    return best;
  },

  thinkMelee(me, enemies) {
    const target = this.pickTarget(me, enemies);
    const d = this.dist(me, target);
    this.dirTo(me, target, this.moveDir);

    if (d < BOT_MELEE_REACH) {
      // in range: circle the target instead of standing still
      _botTmp.set(-this.moveDir.z, 0, this.moveDir.x).multiplyScalar(this.strafeSign * this.cfg.strafe * 0.6);
      this.moveDir.multiplyScalar(0.15).add(_botTmp);
    }
  },

  thinkCaster(me, enemies) {
    const [near, far] = BOT_MAGE_RANGE;
    const nearest = enemies.reduce((a, b) => (this.dist(me, a) <= this.dist(me, b) ? a : b));

    // shoot at the best target that is actually in range, else the closest one
    const inRange = enemies.filter(c => this.dist(me, c) <= far + 2);
    const target  = inRange.length ? this.pickTarget(me, inRange) : nearest;
    this.targetId = target.id;

    if (this.dist(me, nearest) < near) {
      // someone is in our face: back away from them while sidestepping
      this.dirTo(me, nearest, this.moveDir).negate();
      _botTmp.set(-this.moveDir.z, 0, this.moveDir.x).multiplyScalar(this.strafeSign * this.cfg.strafe * 0.6);
      this.moveDir.add(_botTmp);
    } else if (!this.canSee(me, target)) {
      // target is behind cover: sidestep to find an angle, drifting closer
      this.dirTo(me, target, this.moveDir);
      _botTmp.set(-this.moveDir.z, 0, this.moveDir.x).multiplyScalar(this.strafeSign);
      this.moveDir.multiplyScalar(0.4).add(_botTmp);
    } else {
      this.dirTo(me, target, this.moveDir);
      _botTmp.set(-this.moveDir.z, 0, this.moveDir.x).multiplyScalar(this.strafeSign * this.cfg.strafe);
      if (this.dist(me, target) > far) this.moveDir.add(_botTmp.multiplyScalar(0.3)); // close in
      else                             this.moveDir.copy(_botTmp);                     // kite sideways
    }
  },

  thinkSupport(me, enemies) {
    const allies = this.living(c => c.role === me.role && c.id !== me.id);
    const threat = enemies.reduce((a, b) => (this.dist(me, a) <= this.dist(me, b) ? a : b));

    if (!allies.length) {
      // alone: keep away from the villain
      this.dirTo(me, threat, this.moveDir).negate();
      this.targetId = null;
      return;
    }

    const ward = allies.reduce((a, b) => (a.health / a.maxHealth <= b.health / b.maxHealth ? a : b));
    this.targetId = ward.id;
    const d = this.dist(me, ward);
    this.dirTo(me, ward, this.moveDir);
    if (d < 3.5) this.moveDir.multiplyScalar(0);

    // don't wander into the villain's reach
    if (this.dist(me, threat) < MELEE_RANGE + 2) {
      this.dirTo(me, threat, _botTmp).negate();
      this.moveDir.add(_botTmp.multiplyScalar(1.5));
    }
  },

  addSeparation(me) {
    const myPos = this.pos(me);

    // steer back toward the middle near the wall so retreating bots don't get pinned
    const r = Math.hypot(myPos.x, myPos.z);
    if (r > ArenaLayout.WALL_RADIUS - 2.5) {
      this.moveDir.add(_botTmp2.set(-myPos.x / r, 0, -myPos.z / r).multiplyScalar(0.8));
    }

    characters.forEach(other => {
      if (other.id === me.id || !other.isAlive) return;
      const p = this.pos(other);
      if (!p) return;
      _botTmp2.set(myPos.x - p.x, 0, myPos.z - p.z);
      const d = _botTmp2.length();
      if (d > 0.01 && d < BOT_SEPARATION) {
        this.moveDir.add(_botTmp2.multiplyScalar((BOT_SEPARATION - d) / (d * BOT_SEPARATION)));
      }
    });
  },

  // ── per-frame movement and facing ────────────────────────────────────────
  move(me, dt) {
    const pos = this.el.object3D.position;
    const len = this.moveDir.length();
    if (len > 0.05) {
      const speed = BASE_MOVE_SPEED * speedMultiplier(me.speed * 100);
      const step  = (speed * dt) / Math.max(1, len);
      pos.x += this.moveDir.x * step;
      pos.z += this.moveDir.z * step;
    }

    // slide along cover and walls, and stand on whatever surface is underfoot
    ArenaLayout.resolve(pos, BOT_RADIUS);
    pos.y = ArenaLayout.groundHeightAt(pos.x, pos.z) - BODY_OFFSET;

    // face the target (or the way we're walking)
    const target = characters.get(this.targetId);
    const look   = target && target.isAlive ? this.dirTo(me, target, _botTmp) : this.moveDir;
    if (look.lengthSq() > 1e-4) {
      const want = Math.atan2(-look.x, -look.z);           // camera-style yaw
      let diff = want - this.faceYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));   // shortest turn
      this.faceYaw += diff * Math.min(1, dt * 10);
    }
    if (this.model) this.model.object3D.rotation.y = this.faceYaw + Math.PI;
  },

  // ── attacks and heals ────────────────────────────────────────────────────
  act(me, time) {
    if (me.chosenClass === 'support') return this.actSupport(me);

    const target = characters.get(this.targetId);
    if (!target || !target.isAlive) return;

    if (MAGIC_CLASSES.includes(me.chosenClass)) {
      if (isOnCooldown(me.id, 'magic') || this.dist(me, target) > PROJECTILE_RANGE * 0.9) return;
      if (!this.canSee(me, target)) return;
      performMagic(me.id, this.aimAt(me, target));
      return;
    }

    if (time < this.nextSwing || isOnCooldown(me.id, 'melee')) return;
    if (this.dist(me, target) > MELEE_RANGE - 0.2) return;
    performMeleeSwing(me.id, this.faceYaw);
    this.nextSwing = time + this.cfg.swingDelay * (0.6 + Math.random() * 0.8);
  },

  actSupport(me) {
    if (isOnCooldown(me.id, 'heal')) return;
    if (me.health / me.maxHealth < 0.5) { performHeal(me.id, me.id); return; }

    const ward = characters.get(this.targetId);
    if (ward && ward.isAlive && ward.health / ward.maxHealth < 0.8 && this.dist(me, ward) < BOT_HEAL_RANGE) {
      performHeal(me.id, ward.id);
    }
  },

  /** Aim from my chest at where the target's chest will be, plus difficulty-based wobble. */
  aimAt(me, target) {
    const from = this.pos(me), to = this.pos(target);
    const dir  = new THREE.Vector3(to.x - from.x, to.y - from.y, to.z - from.z);

    // lead the shot by the target's velocity over the projectile's flight time
    const vel = characterVelocity.get(target.id);
    if (vel) dir.addScaledVector(vel, dir.length() / PROJECTILE_SPEED);

    const err = this.cfg.aimError;
    dir.normalize();
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() * 2 - 1) * err);
    dir.y += (Math.random() * 2 - 1) * err * 0.5;
    dir.normalize();
    return { x: dir.x, y: dir.y, z: dir.z };
  },
});
