// =================================================
// Slaying Goliath — core game logic
//
// Character registry, combat math, match state machine, and the
// A-Frame components that render projectiles / hit feedback.
//
// Character ids:
//   LOCAL_ID              — the player on this machine (entity #local-player)
//   <clientId>            — a remote multiplayer player (entity #remote-<clientId>)
//   bot-<n>               — an AI bot in solo mode (entity #bot-<n>)
// =================================================


const LOCAL_ID     = sessionStorage.getItem('clientId') || 'local';
const LOCAL_ENTITY = 'local-player';

// Arena geometry. Every character entity uses the same origin convention as
// the local player's physics body, so distances compare like-for-like.
const ARENA_FLOOR_Y = 0;     // the coliseum's sand floor
// Every character's entity origin is at its feet (the local player's physics
// box is defined that way in arena.html), so a character standing on the floor
// has y = ARENA_FLOOR_Y and models need no vertical offset.
const BODY_OFFSET   = 0;
const GROUND_Y      = ARENA_FLOOR_Y - BODY_OFFSET;
const MODEL_OFFSET  = BODY_OFFSET;
const CHEST_HEIGHT  = 1.4;   // above the feet: projectile spawn / hit centre

// =================================================
// Event Bus - communicating with other files
// =================================================
const GAME_EVENTS = {
    STATE_CHANGE:        'game:stateChange',
    MATCH_STARTED:       'game:matchStarted',
    MATCH_OVER:          'game:matchOver',
    CHARACTER_DEFEATED:  'game:characterDefeated',
    HEALTH_CHANGED:      'game:healthChanged',
    EXP_AWARDED:         'game:expAwarded',
    MELEE_SWING:         'game:meleeSwing',
    MELEE_FIRED:         'game:meleeFired',
    MAGIC_FIRED:         'game:magicFired',
    HEAL_PERFORMED:      'game:healPerformed',
};

function emit(eventName, detail = {}) {
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

function on(eventName, callback) {
    document.addEventListener(eventName, e => callback(e.detail));
}

/** ({previous, current}) */
const onStateChange       = cb => on(GAME_EVENTS.STATE_CHANGE, cb);
/** ({ villainId, heroIds }) */
const onMatchStarted      = cb => on(GAME_EVENTS.MATCH_STARTED, cb);
/** ({ winner, villainId, heroIds, duration, remote }) */
const onMatchOver         = cb => on(GAME_EVENTS.MATCH_OVER, cb);
/** ({ characterId, role, killerId }) */
const onCharacterDefeated = cb => on(GAME_EVENTS.CHARACTER_DEFEATED, cb);
/** ({ characterId, health, maxHealth, sourceId, isDamage }) */
const onHealthChanged     = cb => on(GAME_EVENTS.HEALTH_CHANGED, cb);
/** ({ characterId, amount, total }) */
const onExpAwarded        = cb => on(GAME_EVENTS.EXP_AWARDED, cb);
/** ({ attackerId }) — fires on every swing, hit or miss */
const onMeleeSwing        = cb => on(GAME_EVENTS.MELEE_SWING, cb);
/** ({ attackerId, defenderId, damage }) — fires per target hit */
const onMeleeFired        = cb => on(GAME_EVENTS.MELEE_FIRED, cb);
/** ({ attackerId, direction }) */
const onMagicFired        = cb => on(GAME_EVENTS.MAGIC_FIRED, cb);
/** ({ healerId, healeeId, amount }) */
const onHealPerformed     = cb => on(GAME_EVENTS.HEAL_PERFORMED, cb);

// =====================================
// Game State Machine
// =====================================
const STATES = {
    CHARACTER_SELECT: 'CHARACTER_SELECT',
    BATTLE:           'BATTLE',
    GAME_OVER:        'GAME_OVER',
};

const VALID_TRANSITIONS = {
    [STATES.CHARACTER_SELECT]: [STATES.BATTLE],
    [STATES.BATTLE]:           [STATES.GAME_OVER],
    [STATES.GAME_OVER]:        [STATES.CHARACTER_SELECT],
};

let currentState = STATES.CHARACTER_SELECT;

function transitionTo(newState) {
    if (!VALID_TRANSITIONS[currentState].includes(newState)) {
        console.warn(`Invalid transition: ${currentState} --> ${newState}`);
        return false;
    }
    const previous = currentState;
    currentState = newState;
    emit(GAME_EVENTS.STATE_CHANGE, { previous, current: newState });
    return true;
}

function getState() {
    return currentState;
}

// =====================================
// Character Data Model
// =====================================
const BASE_HEALTH       = 100;
const BASE_DAMAGE       = 10;   // melee, × Strength
const BASE_DAMAGE_MAGIC = 15;   // fireball, × Magic
const MIN_DAMAGE        = 1;
const MAX_DEFENSE_BLOCK = 0.6;  // 100 Defense blocks 60% of a hit — nobody is unkillable
const BASE_HEAL_RATE    = 20;   // per heal, × Power

// Goliath is one character against up to three, so it scales with the hero count
const VILLAIN_BASE_HEALTH     = 150;
const VILLAIN_HEALTH_PER_HERO = 80;   // 1 hero → 230 HP, 3 heroes → 390 HP
const VILLAIN_DAMAGE_MULT     = 1.3;  // slow, heavy swings…
const VILLAIN_MAX_CLEAVE      = 2;    // …that hit up to two heroes at once
const VILLAIN_HEAL_PER_KILL   = 0.15; // fraction of max HP regained per hero defeated

// CSV speed (0-100) → movement multiplier. Kept in a 0.6x–1.4x band so a
// low-speed character is slow but still playable.
const speedMultiplier = spd => 0.6 + 0.8 * (spd / 100);

const characters = new Map(); // id → character

/**
 * Build a character from a CSV row.
 * @param {string} id
 * @param {string} role        - 'hero' | 'villain'
 * @param {string} chosenClass - tank | dps | support | mage | brute | agile | villain_mage
 * @param {object} stats       - { name, strength, magic, defense, speed, power } (0-100)
 * @param {string} entityId    - A-Frame entity id
 */
function createCharacter(id, role, chosenClass, stats, entityId) {
    return {
        id,
        role,
        chosenClass,
        entityId,
        name:      stats.name,
        maxHealth: BASE_HEALTH,
        health:    BASE_HEALTH,
        strength:  stats.strength / 100, // melee dmg mult
        magic:     stats.magic    / 100, // ranged dmg mult
        defense:   stats.defense  / 100, // dmg reduction mult
        speed:     stats.speed    / 100, // movement (see speedMultiplier)
        power:     stats.power    / 100, // healing mult
        isAlive:   true,
        exp:       0,
    };
}

function addCharacter(id, role, chosenClass, stats, entityId) {
    const character = createCharacter(id, role, chosenClass, stats, entityId);
    characters.set(id, character);
    initCooldowns(id);
    return character;
}

function getLocalCharacter() {
    return characters.get(LOCAL_ID);
}

function isAlive(id) {
    return characters.get(id)?.isAlive ?? false;
}

// =====================================
// Combat math
// =====================================
function calcDamage(attacker, defender, attackType) {
    const base      = attackType === 'magic' ? BASE_DAMAGE_MAGIC : BASE_DAMAGE;
    const roleMult  = attacker.role === 'villain' ? VILLAIN_DAMAGE_MULT : 1;
    const rawDamage = base * attacker[attackType] * roleMult;
    return Math.max(MIN_DAMAGE, rawDamage * (1 - MAX_DEFENSE_BLOCK * defender.defense));
}

/**
 * Subtract a known amount of damage (used for local hits and for hits
 * reported by other clients, so every screen agrees on the number).
 */
function applyDamage(defenderId, damage, sourceId = null) {
    const defender = characters.get(defenderId);
    if (!defender || !defender.isAlive || getState() !== STATES.BATTLE) return 0;

    defender.health = Math.max(0, defender.health - damage);
    emit(GAME_EVENTS.HEALTH_CHANGED, {
        characterId: defenderId,
        health:      defender.health,
        maxHealth:   defender.maxHealth,
        sourceId,
        isDamage:    true,
    });

    if (defender.health <= 0) handleDeath(defenderId, sourceId);
    return damage;
}

/** Compute and apply a hit. Returns the damage dealt (0 if nothing happened). */
function applyHit(attackerId, defenderId, attackType) {
    const attacker = characters.get(attackerId);
    const defender = characters.get(defenderId);
    if (!attacker || !defender || !defender.isAlive) return 0;
    return applyDamage(defenderId, calcDamage(attacker, defender, attackType), attackerId);
}

function applyHealAmount(healeeId, amount, healerId = null) {
    const healee = characters.get(healeeId);
    if (!healee || !healee.isAlive) return 0;
    healee.health = Math.min(healee.maxHealth, healee.health + amount);
    emit(GAME_EVENTS.HEALTH_CHANGED, {
        characterId: healeeId,
        health:      healee.health,
        maxHealth:   healee.maxHealth,
        sourceId:    healerId,
    });
    return amount;
}

function handleDeath(id, killerId = null) {
    const char = characters.get(id);
    if (!char || !char.isAlive || getState() !== STATES.BATTLE) return;

    char.isAlive = false;
    char.health  = 0;
    emit(GAME_EVENTS.CHARACTER_DEFEATED, { characterId: id, role: char.role, killerId });

    // villain recovers health for every hero it takes down
    if (char.role === 'hero') {
        const villain = [...characters.values()].find(c => c.role === 'villain');
        if (villain && villain.isAlive) {
            applyHealAmount(villain.id, villain.maxHealth * VILLAIN_HEAL_PER_KILL, villain.id);
        }
    }

    checkWin();
}

// =====================================
// Match Manager
// =====================================
const EXP_REWARD = { win: 100, loss: 25 };

let matchState = null;

/**
 * Every character for the match must be registered before this is called.
 * @param {string} villainId
 * @param {string[]} heroIds
 */
function initMatch(villainId, heroIds) {
    if (getState() !== STATES.CHARACTER_SELECT) return;

    matchState = {
        villainId,
        heroIds:   heroIds || [],
        winner:    null,
        startTime: Date.now(),
        endTime:   null,
    };

    // every client derives the same villain health from the same roster
    const villain = characters.get(villainId);
    if (villain) {
        villain.maxHealth = villain.health =
            VILLAIN_BASE_HEALTH + VILLAIN_HEALTH_PER_HERO * matchState.heroIds.length;
    }

    transitionTo(STATES.BATTLE);
    emit(GAME_EVENTS.MATCH_STARTED, { villainId, heroIds: matchState.heroIds });
}

function checkWin() {
    if (!matchState || getState() !== STATES.BATTLE) return;

    const heroes = [...characters.values()].filter(c => c.role === 'hero');
    if (heroes.length === 0) return;

    if (!isAlive(matchState.villainId))  endMatch('hero');
    else if (heroes.every(h => !h.isAlive)) endMatch('villain');
}

/**
 * End the match.
 * @param {string}  winnerRole - 'hero' | 'villain'
 * @param {boolean} remote     - true when another client decided the result
 *                               (so we don't echo it back over the network)
 */
function endMatch(winnerRole, remote = false) {
    if (!matchState || getState() !== STATES.BATTLE) return;

    matchState.winner  = winnerRole;
    matchState.endTime = Date.now();

    awardExp(winnerRole);
    transitionTo(STATES.GAME_OVER);

    emit(GAME_EVENTS.MATCH_OVER, {
        winner:    winnerRole,
        villainId: matchState.villainId,
        heroIds:   matchState.heroIds,
        duration:  matchState.endTime - matchState.startTime,
        remote,
    });
}

function awardExp(winnerRole) {
    characters.forEach(char => {
        const amount = char.role === winnerRole ? EXP_REWARD.win : EXP_REWARD.loss;
        char.exp += amount;
        emit(GAME_EVENTS.EXP_AWARDED, { characterId: char.id, amount, total: char.exp });
    });
}

// =====================================
// Combat System
// =====================================
const COOLDOWNS = {
    melee:        500,
    villainMelee: 800,
    magic:        1500,
    heal:         5000,
};

/** Cooldown length in ms for this character's ability. */
function cooldownDuration(id, ability) {
    if (ability === 'melee' && characters.get(id)?.role === 'villain') return COOLDOWNS.villainMelee;
    return COOLDOWNS[ability];
}

const CLASS_ATTACK_TYPE = {
    tank:         'strength',
    dps:          'strength',
    mage:         'magic',
    brute:        'strength',
    agile:        'strength',
    villain_mage: 'magic',
    // support has no attack — heal only
};

const MAGIC_CLASSES   = ['mage', 'villain_mage'];
const MELEE_RANGE     = 4;                    // how close you need to be to melee
const MELEE_HALF_ARC  = THREE.MathUtils.degToRad(60); // swings hit within ±60° of facing

// characterId → { melee, magic, heal } timestamps
const cooldownTracker = new Map();

function initCooldowns(id) {
    cooldownTracker.set(id, { melee: 0, magic: 0, heal: 0 });
}

function getCooldownRemaining(id, ability) {
    const tracker = cooldownTracker.get(id);
    if (!tracker) return 0;
    return Math.max(0, cooldownDuration(id, ability) - (Date.now() - tracker[ability]));
}

function isOnCooldown(id, ability) {
    return getCooldownRemaining(id, ability) > 0;
}

function startCooldown(id, ability) {
    const tracker = cooldownTracker.get(id);
    if (tracker) tracker[ability] = Date.now();
}

/**
 * Swing a melee attack: hits every living enemy within MELEE_RANGE in front
 * of the attacker.
 * @param {string} attackerId
 * @param {number} [facingYaw] - camera-style yaw the attacker faces; omit to hit all around
 * Returns an array of { targetId, damage } for the hits that landed.
 */
function performMeleeSwing(attackerId, facingYaw) {
    const attacker = characters.get(attackerId);
    if (!attacker || !attacker.isAlive || getState() !== STATES.BATTLE) return [];
    if (isOnCooldown(attackerId, 'melee')) return [];
    startCooldown(attackerId, 'melee');

    emit(GAME_EVENTS.MELEE_SWING, { attackerId });

    const attackerEl = document.getElementById(attacker.entityId);
    if (!attackerEl) return [];
    const myPos = attackerEl.object3D.position;

    // living enemies in reach (and in front, when a facing is given), nearest first
    const inReach = [];
    characters.forEach(target => {
        if (target.role === attacker.role || !target.isAlive) return;
        const targetEl = document.getElementById(target.entityId);
        if (!targetEl) return;
        const tp   = targetEl.object3D.position;
        const dist = myPos.distanceTo(tp);
        if (dist > MELEE_RANGE) return;
        if (facingYaw !== undefined) {
            // camera-style yaw: forward is (-sin, -cos)
            const dx = tp.x - myPos.x, dz = tp.z - myPos.z;
            const len = Math.hypot(dx, dz);
            const dot = len < 0.5 ? 1 : (-Math.sin(facingYaw) * dx - Math.cos(facingYaw) * dz) / len;
            if (dot < Math.cos(MELEE_HALF_ARC)) return;
        }
        inReach.push({ target, dist });
    });
    inReach.sort((a, b) => a.dist - b.dist);
    if (attacker.role === 'villain') inReach.length = Math.min(inReach.length, VILLAIN_MAX_CLEAVE);

    const hits = [];
    inReach.forEach(({ target }) => {
        const damage = applyHit(attackerId, target.id, 'strength');
        if (damage > 0) {
            hits.push({ targetId: target.id, damage });
            emit(GAME_EVENTS.MELEE_FIRED, { attackerId, defenderId: target.id, damage });
        }
    });
    return hits;
}

/**
 * Fire a magic projectile.
 * @param {string} attackerId
 * @param {object} direction - {x,y,z} unit aim vector
 * @returns {boolean} whether it fired
 */
function performMagic(attackerId, direction) {
    const attacker = characters.get(attackerId);
    if (!attacker || !attacker.isAlive || getState() !== STATES.BATTLE) return false;
    if (isOnCooldown(attackerId, 'magic')) return false;

    startCooldown(attackerId, 'magic');
    emit(GAME_EVENTS.MAGIC_FIRED, { attackerId, direction });
    return true;
}

/**
 * Heal (heroes only). Returns the amount healed, or 0.
 */
function performHeal(healerId, healeeId) {
    const healer = characters.get(healerId);
    const healee = characters.get(healeeId);
    if (!healer || !healee || !healer.isAlive || !healee.isAlive || healer.role !== 'hero') return 0;
    if (getState() !== STATES.BATTLE || isOnCooldown(healerId, 'heal')) return 0;

    startCooldown(healerId, 'heal');
    const amount = applyHealAmount(healeeId, BASE_HEAL_RATE * healer.power, healerId);
    emit(GAME_EVENTS.HEAL_PERFORMED, { healerId, healeeId, amount });
    return amount;
}

/** Characters simulated on this machine (local player + bots) own their hits. */
function isSimulatedLocally(char) {
    return !!char && (char.id === LOCAL_ID || char.isBot === true);
}

// =================================================
// A-Frame components
// =================================================
const PROJECTILE_SPEED      = 10;  // units per second
const PROJECTILE_RANGE      = 20;  // max distance before despawn
const PROJECTILE_HIT_RADIUS = 1.5;
const PROJECTILE_SPIN       = 9;   // radians per second around the flight axis
const _tmpVec               = new THREE.Vector3();

AFRAME.registerComponent('projectile', {
  schema: {
    attackerId: { type: 'string' },
    dirX:       { type: 'number', default: 0 },
    dirY:       { type: 'number', default: 0 },
    dirZ:       { type: 'number', default: -1 },
  },

  init() {
    this.distanceTravelled = 0;
    this.direction = new THREE.Vector3(this.data.dirX, this.data.dirY, this.data.dirZ).normalize();

    // point the fireball model's head (+Z) along its flight path
    const obj = this.el.object3D;
    obj.lookAt(_tmpVec.copy(obj.position).add(this.direction));
  },

  tick(time, delta) {
    if (getState() !== STATES.BATTLE) { this.despawn(); return; }

    const obj     = this.el.object3D;
    const moveAmt = PROJECTILE_SPEED * (delta / 1000);
    obj.position.addScaledVector(this.direction, moveAmt);
    obj.rotateZ(PROJECTILE_SPIN * (delta / 1000));
    this.distanceTravelled += moveAmt;

    if (this.distanceTravelled >= PROJECTILE_RANGE) { this.despawn(); return; }

    // cover, walls and the floor stop fireballs
    const p = obj.position;
    if (typeof ArenaLayout !== 'undefined' && ArenaLayout.blocksPoint(p.x, p.y, p.z)) { this.despawn(); return; }

    this.checkCollision();
  },

  checkCollision() {
    const attacker = characters.get(this.data.attackerId);
    if (!attacker) return;

    // Projectiles also spawn on other clients purely for visuals. Only the
    // machine that simulates the attacker applies (and broadcasts) the damage.
    if (!isSimulatedLocally(attacker)) return;

    for (const char of characters.values()) {
      if (char.role === attacker.role || !char.isAlive) continue;
      const targetEl = document.getElementById(char.entityId);
      if (!targetEl) continue;

      // compare against the body centre (projectiles fly at chest height)
      _tmpVec.copy(targetEl.object3D.position);
      _tmpVec.y += CHEST_HEIGHT;
      const dist = this.el.object3D.position.distanceTo(_tmpVec);
      if (dist < PROJECTILE_HIT_RADIUS) {
        const damage = applyHit(this.data.attackerId, char.id, 'magic');
        if (damage > 0 && typeof sendAttackEvent === 'function' && !attacker.isBot) {
          sendAttackEvent('magic', char.id, damage);
        }
        this.despawn();
        return;
      }
    }
  },

  despawn() {
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
  },
});

// ============================================
// WEAPON SWING — quick chop animation whenever the owner swings
//   weapon-swing="characterId: bot-1; amount: 70"   (degrees around X)
// ============================================
AFRAME.registerComponent('weapon-swing', {
  schema: {
    characterId: { type: 'string' },
    amount:      { type: 'number', default: 70 },
    duration:    { type: 'number', default: 220 },
  },

  init() {
    this.elapsed = -1;
    this.onSwing = (e) => {
      if (e.detail.attackerId !== this.data.characterId) return;
      if (this.elapsed < 0) this.baseX = this.el.object3D.rotation.x;
      this.elapsed = 0;
    };
    document.addEventListener(GAME_EVENTS.MELEE_SWING, this.onSwing);
  },

  tick(time, delta) {
    if (this.elapsed < 0) return;
    this.elapsed += delta;
    const t = Math.min(1, this.elapsed / this.data.duration);
    this.el.object3D.rotation.x = this.baseX + THREE.MathUtils.degToRad(this.data.amount) * Math.sin(Math.PI * t);
    if (t >= 1) { this.el.object3D.rotation.x = this.baseX; this.elapsed = -1; }
  },

  remove() {
    document.removeEventListener(GAME_EVENTS.MELEE_SWING, this.onSwing);
  },
});

// Attach to the a-scene: <a-scene game-manager>
AFRAME.registerComponent('game-manager', {
  init() {
    onMagicFired(({ attackerId, direction }) => this.spawnProjectile(attackerId, direction));
    onHealthChanged(({ characterId, isDamage }) => {
      if (isDamage) this.flashHit(characterId);
    });
    onCharacterDefeated(({ characterId }) => this.handleDeathVisual(characterId));
    onMatchOver(() => this.clearProjectiles());
  },

  spawnProjectile(attackerId, direction) {
    const attacker   = characters.get(attackerId);
    const attackerEl = attacker && document.getElementById(attacker.entityId);
    if (!attackerEl) return;

    // start just in front of the caster so it doesn't appear inside their head
    const pos = attackerEl.object3D.position;
    const projectile = document.createElement('a-entity');
    projectile.setAttribute('gltf-model', '#fireball');
    projectile.setAttribute('scale', '1.2 1.2 1.2');
    projectile.setAttribute('position',
      `${pos.x + direction.x * 0.8} ${pos.y + CHEST_HEIGHT + direction.y * 0.8} ${pos.z + direction.z * 0.8}`);
    projectile.setAttribute('projectile',
      `attackerId: ${attackerId}; dirX: ${direction.x}; dirY: ${direction.y}; dirZ: ${direction.z}`);
    projectile.classList.add('projectile-entity');
    this.el.appendChild(projectile);
  },

  /** Briefly tint every mesh in the character's model red. */
  flashHit(characterId) {
    const char = characters.get(characterId);
    if (!char || char.id === LOCAL_ID) return;
    const el = document.getElementById(char.entityId);
    if (!el) return;

    const tinted = [];
    el.object3D.traverse(node => {
      const mats = node.isMesh ? [].concat(node.material) : [];
      mats.forEach(m => {
        if (!m || !m.emissive || m.userData._flashing) return;
        m.userData._flashing = true;
        tinted.push([m, m.emissive.getHex()]);
        m.emissive.setHex(0xaa1111);
      });
    });
    setTimeout(() => tinted.forEach(([m, hex]) => {
      m.emissive.setHex(hex);
      m.userData._flashing = false;
    }), 140);
  },

  handleDeathVisual(characterId) {
    const char = characters.get(characterId);
    if (!char || char.id === LOCAL_ID) return; // local player switches to spectate instead
    const el = document.getElementById(char.entityId);
    if (el) el.setAttribute('visible', 'false');
  },

  clearProjectiles() {
    this.el.querySelectorAll('.projectile-entity').forEach(p => p.parentNode.removeChild(p));
  },
});
