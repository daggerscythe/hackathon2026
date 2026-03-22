// =================================================
// Event Bus - communicating with other files
// =================================================
const GAME_EVENTS = {
    // State
    STATE_CHANGE:        'game:stateChange',

    // Match
    MATCH_STARTED:       'game:matchStarted',
    MATCH_OVER:          'game:matchOver',

    // Characters
    CHARACTER_DEFEATED:  'game:characterDefeated',
    HEALTH_CHANGED:      'game:healthChanged',
    EXP_AWARDED:         'game:expAwarded',

    // Combat
    MELEE_FIRED:         'game:meleeFired',
    MAGIC_FIRED:         'game:magicFired',
    HEAL_PERFORMED:      'game:healPerformed',
};

// Emitters
function emit(eventName, detail = {}) {
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

// Listeners
/**
 * fires when game changes state
 * @param {function} callback - ({previous, current}) => void 
 */
function onStateChange(callback) {
  document.addEventListener(GAME_EVENTS.STATE_CHANGE, e => callback(e.detail));
}

/**
 * Fires when a match begins.
 * @param {function} callback - ({ villainId, heroIds }) => void
 */
function onMatchStarted(callback) {
  document.addEventListener(GAME_EVENTS.MATCH_STARTED, e => callback(e.detail));
}

/**
 * Fires when a match ends.
 * @param {function} callback - ({ winner, villainId, heroIds, duration }) => void
 */
function onMatchOver(callback) {
  document.addEventListener(GAME_EVENTS.MATCH_OVER, e => callback(e.detail));
}

/**
 * Fires when any character reaches 0 HP.
 * @param {function} callback - ({ characterId, role }) => void
 */
function onCharacterDefeated(callback) {
  document.addEventListener(GAME_EVENTS.CHARACTER_DEFEATED, e => callback(e.detail));
}

/**
 * Fires when any character's health changes (damage or healing).
 * Earnest uses this to update health bars.
 * @param {function} callback - ({ characterId, health, maxHealth }) => void
 */
function onHealthChanged(callback) {
  document.addEventListener(GAME_EVENTS.HEALTH_CHANGED, e => callback(e.detail));
}

/**
 * Fires when exp is awarded at match end.
 * @param {function} callback - ({ characterId, amount, total }) => void
 */
function onExpAwarded(callback) {
  document.addEventListener(GAME_EVENTS.EXP_AWARDED, e => callback(e.detail));
}

/**
 * Fires when a melee hit lands.
 * A-Frame hooks uses this to trigger hit animations.
 * @param {function} callback - ({ attackerId, defenderId }) => void
 */
function onMeleeFired(callback) {
  document.addEventListener(GAME_EVENTS.MELEE_FIRED, e => callback(e.detail));
}

/**
 * Fires when a magic projectile is launched.
 * A-Frame hooks uses this to spawn the projectile entity.
 * @param {function} callback - ({ attackerId, direction }) => void
 */
function onMagicFired(callback) {
  document.addEventListener(GAME_EVENTS.MAGIC_FIRED, e => callback(e.detail));
}

/**
 * Fires when a heal is performed.
 * @param {function} callback - ({ healerId, healeeId }) => void
 */
function onHealPerformed(callback) {
  document.addEventListener(GAME_EVENTS.HEAL_PERFORMED, e => callback(e.detail));
}

// =====================================
// Game State Machine
// =====================================
const STATES = {
    CHARACTER_SELECT: 'CHARACTER_SELECT',
    BATTLE: 'BATTLE',
    GAME_OVER: 'GAME_OVER',
};

const VALID_TRANSITIONS = {
    [STATES.CHARACTER_SELECT]: [STATES.BATTLE],
    [STATES.BATTLE]: [STATES.GAME_OVER],
    [STATES.GAME_OVER]: [STATES.CHARACTER_SELECT],
};

let currentState = STATES.CHARACTER_SELECT;

function transitionTo(newState) {
    const allowed = VALID_TRANSITIONS[currentState];

    if (!allowed.includes(newState)) {
        console.warn(`Invalid transition: ${currentState} --> ${newState}`);
        return false;
    }

    console.log(`State: ${currentState} --> ${newState}`);

    // let other files know of state change
    const previousState = currentState;
    currentState = newState;
    emit(GAME_EVENTS.STATE_CHANGE, { previous: previousState, current: newState });

    return true;
}

function getState() {
    return currentState;
}

// =====================================
// Player Character Data Model
// =====================================

// Constants

const BASE_HEALTH = 100;
const BASE_DAMAGE = 10;
const VILLAIN_HEALTH_PER_KILL = 50;
const BASE_HEAL_RATE = 5;

const characterPools = {
    hero: { tank: [], dps: [], support: [], mage: [] },
    villain: { brute: [], agile: [], mage: [] },
};

const characters = new Map(); // player registry
let heroesAlive = 3; // for villain scaling

function populateCharacterPools(classifiedData) {
    Object.assign(characterPools.hero, classifiedData.hero);
    Object.assign(characterPools.villain, classifiedData.villain);
    console.log(`Character pools ready: `, characterPools);
}

// randomly pick a charater from the pool
function pickRandomCharater(role, chosenClass) {
    const pool = characterPools[role]?.[chosenClass];

    if (!pool || pool.length === 0) {
        console.warn(`No characters available for ${role} / ${chosenClass}`);
        return null;
    }

    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex]; // returns the raw CSV row
}

// Villain stat multiplier scales down as heroes are defeated
// 3 heroes alive -> 3x, 1 alive -> 1.5x

/**
    * Factory function - builds a character entity from CSV data
    * @param {string} id - unique id 
    * @param {string} role - 'hero' | 'villain'
    * @param {string} chosenClass - tank | dps | support | mage OR brute | agile | mage
    * @param {object} csvRow - randomly picked row
    * @param {string} entityId - A-Frame entity id in index.html
*/

function createCharacter(id, role, chosenClass, csvRow, entityId) {
    return {
        id,
        role,
        chosenClass,
        entityId,

        // identity (from CSV)
        name: csvRow.name,

        // all players start with same base health
        maxHealth: BASE_HEALTH,
        health: BASE_HEALTH,
        
        // CSV stats
        strength: csvRow.strength / 100, // melee dmg mult
        magic: csvRow.magic / 100, // range dmg mult
        defense: csvRow.defense / 100, // dmg reduction mult
        speed: csvRow.speed / 100, // movement speed mult
        power: csvRow.power / 100, // healing mult

        // runtime states
        isAlive: true,
        exp: 0,
    };
}

// register finalized character into active match
function addCharacter(id, role, chosenClass, csvRow, entityId) {
    const character = createCharacter(id, role, chosenClass, csvRow, entityId);
    characters.set(id, character);
    initCooldowns(id);
    console.log(`Registered: ${character.name} [${role} / ${chosenClass}]`);
    return character;
}

function clearCharacters() {
    characters.clear();
    heroesAlive = 3;
}

// Combat Helpers

function isAlive(id) {
    const char = characters.get(id);
    return char ? char.isAlive : false;
};

// damage calculation math
/**
 * Formula:
 * raw damage = BASE_DAMAGE * attacker dmg mult
 * damage taken = raw damage * (1 - defender dfns) 
 * @param {string} attackType - 'strength' (melee) | 'magic' (range)
 */
function calcDamage(attacker, defender, attackType) {
    const statMult = attacker[attackType]; // 0-1
    const rawDamage = BASE_DAMAGE * statMult;
    const damageTaken = rawDamage * (1 - defender.defense);
    return Math.max(0.1, damageTaken); 
}

/**
 * apply a hit from attacker to defender, fire events for UI updates & death
 * @param {string} attackerId
 * @param {string} defenderId
 * @param {string} attackerType - 'strength' | 'magic'
 */

function applyHit(attackerId, defenderId, attackType) {
    const attacker = characters.get(attackerId);
    const defender = characters.get(defenderId);

    if (!attacker || !defender || !defender.isAlive) return;

    const damage = calcDamage(attacker, defender, attackType);
    defender.health = Math.max(0, defender.health - damage);

    console.log(
        `${attacker.name} hit ${defender.name} for ${damage.toFixed(2)}` + 
        `(${attackType}) -> ${defender.health.toFixed(1)}/${defender.maxHealth} HP`
    );

    emit(GAME_EVENTS.HEALTH_CHANGED, { 
        characterId: defenderId, 
        health: defender.health, 
        maxHealth: defender.maxHealth 
    });

    if (defender.health <= 0) {
        handleDeath(defenderId);
    }
}

function handleDeath(id) {
    const char = characters.get(id);
    if (!char || getState() !== STATES.BATTLE) return;

    char.isAlive = false;

    emit(GAME_EVENTS.CHARACTER_DEFEATED, { characterId: id, role: char.role });

    // villain gets health for every killed player
    if (char.role === 'hero') {
        heroesAlive--;

        const villain = [...characters.values()].find(c => c.role === 'villain');
        if (villain && villain.isAlive) {
            villain.health = Math.min(villain.maxHealth, villain.health + VILLAIN_HEALTH_PER_KILL);
        
            console.log(
                `Villain gained ${VILLAIN_HEALTH_PER_KILL} HP from kill → ` +
                `${villain.health.toFixed(1)}/${villain.maxHealth} HP`
            );

            emit(GAME_EVENTS.HEALTH_CHANGED, { characterId: villain.id, health: villain.health, maxHealth: villain.maxHealth });
        }
    }
}

/**
 * apply one tick of healing every second
 * heal per tick = BASE_HEAL_RATE * power mult
 * @param {string} healerId - the one dealing healing
 * @param {strign} healeeId - the one being healed
 * 
 * for self-heal, applyHeal('hero-2', 'hero-2')
 */
function applyHeal(healerId, healeeId) {
    const healer = characters.get(healerId);
    const healee = characters.get(healeeId);
    if (!healer || !healee || !healer.isAlive || !healee.isAlive || healer.role !== 'hero') return;

    const healAmt = BASE_HEAL_RATE * healer.power;
    healee.health = Math.min(healee.maxHealth, healee.health + healAmt);

    console.log(`${healer.name} healed ${healee.name} for ${healAmt.toFixed(2)} → ${healee.health.toFixed(1)}/${healee.maxHealth} HP`);

    emit(GAME_EVENTS.HEALTH_CHANGED, {
        characterId: healeeId,
        health:      healee.health,
        maxHealth:   healee.maxHealth,
        });
}

// =====================================
// Match Manager
// =====================================
const EXP_REWARD = {
    win: 100,
    loss: 25,
};

let matchState = null; // current match's metadata

/**
 * all players selected characters, time to start the battle
 * @param {string} villainId
 * @param {string[]} heroIds
 */
function initMatch(villainId, heroIds) {
    if (getState() !== STATES.CHARACTER_SELECT) {
        console.warn('initMatch called outside of CHARACTER_SELECT state');
        return;
    }

    matchState = {
        villainId,
        heroIds,
        winner: null, // 'hero' | 'villain'
        startTime: Date.now(),
        endTime: null,
    };

    // start listening for deaths
    document.addEventListener('game:characterDefeated', onCharacterDefeatedMatchCheck);

    transitionTo(STATES.BATTLE);
    console.log(`Match started. Villain: ${villainId} vs Heroes: ${heroIds.join(', ')}`);

    emit(GAME_EVENTS.MATCH_STARTED, { villainId, heroIds });
}

function onCharacterDefeatedMatchCheck(event) {
    checkWin();
}

function checkWin() {
    if (!matchState || getState() !== STATES.BATTLE) return;

    const villainDead = !isAlive(matchState.villainId);
    const HeroesDead = matchState.heroIds.every(id => !isAlive(id));

    if (villainDead) {
        endMatch('hero');
    } else if (HeroesDead) {
        endMatch('villain');
    }
}

/**
 * end match, award exp, fire game over event
 * @param {string} winnerRole - 'hero' | 'villain'
 */
function endMatch(winnerRole) {
    if (!matchState) return;

    matchState.winner = winnerRole;
    matchState.endTime = Date.now();

    // stop death listener
    document.removeEventListener('game:characterDefeated', onCharacterDefeatedMatchCheck);

    awardExp(winnerRole);
    transitionTo(STATES.GAME_OVER);

    console.log(`Match over. ${winnerRole} wins.`);

    emit(GAME_EVENTS.MATCH_OVER, {
        winner: winnerRole,
        villainId: matchState.villainId,
        heroIds: matchState.heroIds,
        duration: matchState.endTime - matchState.startTime,
    });

    matchState = null;
}

function awardExp(winnerRole) {
    characters.forEach(char => {
        const won = char.role === winnerRole;
        char.exp += won ? EXP_REWARD.win : EXP_REWARD.loss;

        console.log(
            `${char.name} earned ${won ? EXP_REWARD.win : EXP_REWARD.loss} EXP` + 
            ` (total: ${char.exp})`
        );

        emit(GAME_EVENTS.EXP_AWARDED, {
            characterId: char.id,
            amount: won ? EXP_REWARD.win : EXP_REWARD.loss,
            total: char.exp,
        });
    });
}

function resetMatch() {
    matchState = null;
    clearCharacters();
    transitionTo(STATES.CHARACTER_SELECT);
}

// =====================================
// Combat System
// =====================================
const COOLDOWNS = {
    magic: 3000, // in ms
    heal: 5000,
};

const CLASS_ATTACK_TYPE = {
    // hero classes
    tank: 'strength',
    dps: 'strength',
    support: 'strength',
    mage: 'magic',
    // villain classes
    brute: 'strength',
    agile: 'strength',
    villain_mage: 'magic',
};

// key: characterId, value: { magic: timestamp, heal: timestamp }
const cooldownTracker = new Map();

/**
 * initialize cooldown tracking upon initial join
 * called inside addCharacter
 */
function initCooldowns(id) {
    cooldownTracker.set(id, {
        magic: 0,
        heal: 0,
    });
}

/**
 * returns true if ability still on cooldown
 * @param {string} id
 * @param {string} ability - 'magic' | 'heal'
 */
function isOnCooldown(id, ability) {
    const tracker = cooldownTracker.get(id);
    if (!tracker) return false;

    const elapsed = Date.now() - tracker[ability];
    return elapsed < COOLDOWNS[ability];
}

/**
 * returns how many ms remain for UI
 * @param {string} id 
 * @param {string} ability 
 */
function getCooldownRemaining(id, ability) {
    const tracker = cooldownTracker.get(id);
    if (!tracker) return 0;

    const elapsed = Date.now() - tracker[ability];
    return Math.max(0, COOLDOWNS[ability] - elapsed);
}

// Attack Methods
/**
 * melee has no cooldown
 * @param {string} attackerId 
 * @param {string} defenderId 
 */
function performMelee(attackerId, defenderId) {
    const attacker = characters.get(attackerId);
    const defender = characters.get(defenderId);

    if (!attacker || !defender || !attacker.isAlive || !defender.isAlive || getState() !== STATES.BATTLE) return;

    applyHit(attackerId, defenderId, 'strength');

    emit(GAME_EVENTS.MELEE_FIRED, { attackerId, defenderId });
}

/**
 * magic attack has cooldown
 * @param {string} attackerId 
 * @param {object} direction - {x,y,z} unit vector of aim directin
 */
function performMagic(attackerId, direction) {
    const attacker = characters.get(attackerId);

    if (!attacker || !attacker.isAlive || getState() !== STATES.BATTLE) return;
    if (isOnCooldown(attackerId, 'magic')) {
        const remaining = (getCooldownRemaining(attackerId, 'magic') / 1000).toFixed(1);
        console.log(`${attacker.name} magic on cooldown - ${remaining}s remaining`);
        return;
    }

    cooldownTracker.get(attackerId).magic = Date.now();
    console.log(`${attacker.name} fired magic towards ${JSON.stringify(direction)}`);

    emit(GAME_EVENTS.MAGIC_FIRED, { attackerId, direction });
}

/**
 * heal has cooldown
 * @param {string} healerId 
 * @param {string} healeeId 
 */
function performHeal(healerId, healeeId) {
    const healer = characters.get(healerId);
    const healee = characters.get(healeeId);

    if (!healer || !healee || !healer.isAlive || !healee.isAlive || healer.role !== 'hero') return;
    if (isOnCooldown(healerId, 'heal')) {
        const remaining = (getCooldownRemaining(healerId, 'heal') / 1000).toFixed(1);
        console.log(`${healer.name} heal on cooldown - ${remaining}s remaining`);
        return;
    }

    cooldownTracker.get(healerId).heal = Date.now();
    applyHeal(healerId, healeeId);

    emit(GAME_EVENTS.HEAL_PERFORMED, { healerId, healeeId });
}

/**
 * wrapper function to determine what attack type to call
 * @param {string} attackerId 
 * @param {string} defenderId - required for melee, ignored for magic
 * @param {object} direction  - required for magic, ignored for melee
 */
function performAttack(attackerId, defenderId, direction) {
    const attacker = characters.get(attackerId);
    if (!attacker || !attacker.isAlive) return; 
    const attackType = CLASS_ATTACK_TYPE[attacker.chosenClass];

    if (attackType === 'magic') {
        performMagic(attackerId, direction);
    } else {
        performMelee(attackerId, defenderId);
    }
}

// =====================================
// EXP & Progression -- FOR LATER IMPLEMENTATION
// =====================================

// =================================================
// A-Frame Hooks - moving entities, animations, etc
// =================================================
const PROJECTILE_SPEED = 10;  // units per second
const PROJECTILE_RANGE = 20;  // max distance before projectile disappears
const MELEE_RANGE = 4;   // how close you need to be to melee
const CAMERA_OFFSET = { x: 0, y: 5, z: 10 }; // 3rd person offset

// ============================================
// PLAYER CONTROLLER
// Attach to each player entity in index.html:
// <a-entity id="player-hero-1" player-controller="characterId: hero-1">
// ============================================
AFRAME.registerComponent('player-controller', {
  schema: {
    characterId: { type: 'string' }, // links this entity to game.js character
    isLocal:     { type: 'boolean', default: false }, // is this the local player?
  },

  init() {
    this.keys = {};         // tracks which keys are currently held
    this.velocity = new THREE.Vector3();

    // only bind input for the local player
    if (!this.data.isLocal) return;

    this.onKeyDown = (e) => { this.keys[e.code] = true;  };
    this.onKeyUp   = (e) => { this.keys[e.code] = false; };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup',   this.onKeyUp);

    // left click = melee
    this.onMouseDown = (e) => {
      if (e.button !== 0) return;
      this.tryMelee();
    };

    // right click = magic
    this.onRightClick = (e) => {
      e.preventDefault();
      this.tryMagic();
    };

    // H key = heal
    this.onHealKey = (e) => {
      if (e.code !== 'KeyH') return;
      const charId = this.data.characterId;
      performHeal(charId, charId); // self heal by default
    };

    window.addEventListener('mousedown',       this.onMouseDown);
    window.addEventListener('contextmenu',     this.onRightClick);
    window.addEventListener('keydown',         this.onHealKey);
  },

  tick(time, delta) {
    if (!this.data.isLocal) return;
    if (getState() !== STATES.BATTLE) return;

    const char = characters.get(this.data.characterId);
    if (!char || !char.isAlive) return;

    this.handleMovement(delta, char.speed);
  },

  /**
   * Moves the entity based on WASD input.
   * Speed stat (0-1) scales against a base movement speed.
   * @param {number} delta  - ms since last frame, keeps movement frame-rate independent
   * @param {number} speed  - character's speed multiplier (0-1)
   */
  handleMovement(delta, speed) {
    const BASE_SPEED   = 5; // units per second at speed 1.0
    const actualSpeed  = BASE_SPEED * speed * (delta / 1000);
    const pos          = this.el.object3D.position;

    if (this.keys['KeyW']) pos.z -= actualSpeed;
    if (this.keys['KeyS']) pos.z += actualSpeed;
    if (this.keys['KeyA']) pos.x -= actualSpeed;
    if (this.keys['KeyD']) pos.x += actualSpeed;
  },

  /**
   * Finds the nearest enemy and attempts a melee hit if in range.
   */
  tryMelee() {
    if (getState() !== STATES.BATTLE) return;

    const char    = characters.get(this.data.characterId);
    if (!char || !char.isAlive) return;

    const target  = this.getNearestEnemy();
    if (!target)  return;

    const dist    = this.distanceTo(target.entityId);
    if (dist > MELEE_RANGE) {
      console.log(`Too far to melee — ${dist.toFixed(2)} units away`);
      return;
    }

    performMelee(this.data.characterId, target.id);
  },

  /**
   * Fires a magic projectile in the direction the camera is facing.
   */
  tryMagic() {
    if (getState() !== STATES.BATTLE) return;

    const char = characters.get(this.data.characterId);
    if (!char || !char.isAlive) return;

    // get the direction the camera is currently facing
    const camera    = document.getElementById('main-camera');
    const direction = new THREE.Vector3();
    camera.object3D.getWorldDirection(direction);

    performMagic(this.data.characterId, {
      x: direction.x,
      y: direction.y,
      z: direction.z,
    });
  },

  /**
   * Finds the nearest living enemy to the local player.
   * Heroes target the villain, villain targets the nearest hero.
   */
  getNearestEnemy() {
    const char    = characters.get(this.data.characterId);
    if (!char) return null;

    const enemies = [...characters.values()].filter(c => {
      return c.role !== char.role && c.isAlive;
    });

    if (enemies.length === 0) return null;

    // sort by distance, return closest
    return enemies.sort((a, b) => {
      return this.distanceTo(a.entityId) - this.distanceTo(b.entityId);
    })[0];
  },

  /**
   * Returns the distance in 3D units between this entity and another.
   * @param {string} targetEntityId - the A-Frame entity id
   */
  distanceTo(targetEntityId) {
    const targetEl = document.getElementById(targetEntityId);
    if (!targetEl) return Infinity;

    const myPos     = this.el.object3D.position;
    const targetPos = targetEl.object3D.position;
    return myPos.distanceTo(targetPos);
  },

  remove() {
    if (!this.data.isLocal) return;
    window.removeEventListener('keydown',     this.onKeyDown);
    window.removeEventListener('keyup',       this.onKeyUp);
    window.removeEventListener('mousedown',   this.onMouseDown);
    window.removeEventListener('contextmenu', this.onRightClick);
    window.removeEventListener('keydown',     this.onHealKey);
  },
});


// ============================================
// CAMERA FOLLOW
// Attach to the camera rig in index.html:
// <a-entity id="camera-rig" camera-follow="targetId: player-hero-1">
// ============================================

AFRAME.registerComponent('camera-follow', {
  schema: {
    targetId: { type: 'string' }, // entity id to follow
  },

  tick() {
    const target = document.getElementById(this.data.targetId);
    if (!target) return;

    const targetPos = target.object3D.position;

    // smoothly lerp camera towards target + offset
    // lerp = linear interpolation, moves 10% closer each frame = smooth follow
    this.el.object3D.position.lerp(
      new THREE.Vector3(
        targetPos.x + CAMERA_OFFSET.x,
        targetPos.y + CAMERA_OFFSET.y,
        targetPos.z + CAMERA_OFFSET.z,
      ),
      0.1 // lerp factor — lower = smoother but laggier
    );
  },
});


// ============================================
// PROJECTILE
// Spawned dynamically by the game-manager
// when game:magicFired fires.
// ============================================

AFRAME.registerComponent('projectile', {
  schema: {
    attackerId: { type: 'string' },
    dirX:       { type: 'number', default: 0 },
    dirY:       { type: 'number', default: 0 },
    dirZ:       { type: 'number', default: -1 },
  },

  init() {
    this.distanceTravelled = 0;
    this.direction = new THREE.Vector3(
      this.data.dirX,
      this.data.dirY,
      this.data.dirZ,
    ).normalize();

    this.startPos = this.el.object3D.position.clone();
  },

  tick(time, delta) {
    const moveAmt = PROJECTILE_SPEED * (delta / 1000);

    // move projectile forward
    this.el.object3D.position.addScaledVector(this.direction, moveAmt);
    this.distanceTravelled += moveAmt;

    // despawn if out of range
    if (this.distanceTravelled >= PROJECTILE_RANGE) {
      this.despawn();
      return;
    }

    // check collision with all living enemies
    this.checkCollision();
  },

  checkCollision() {
    const attacker = characters.get(this.data.attackerId);
    if (!attacker) return;

    // check against all characters on the opposite side
    characters.forEach(char => {
      if (char.role === attacker.role) return; // skip teammates
      if (!char.isAlive)               return;

      const targetEl = document.getElementById(char.entityId);
      if (!targetEl) return;

      const dist = this.el.object3D.position.distanceTo(
        targetEl.object3D.position
      );

      // 1.0 unit hit radius
      if (dist < 1.0) {
        applyHit(this.data.attackerId, char.id, 'magic');
        this.despawn();
      }
    });
  },

  despawn() {
    this.el.parentNode.removeChild(this.el);
  },
});


// ============================================
// GAME MANAGER
// Attach to the a-scene in index.html:
// <a-scene game-manager>
// ============================================

AFRAME.registerComponent('game-manager', {

  init() {
    // spawn projectile when magic is fired
    onMagicFired(({ attackerId, direction }) => {
      this.spawnProjectile(attackerId, direction);
    });

    // play hit animation when melee lands
    onMeleeFired(({ attackerId, defenderId }) => {
      this.playMeleeEffect(attackerId, defenderId);
    });

    // handle character death in the scene
    onCharacterDefeated(({ characterId }) => {
      this.handleDeathVisual(characterId);
    });

    // clean up scene when match ends
    onMatchOver(({ winner }) => {
      this.clearProjectiles();
      console.log(`Match over — ${winner} wins!`);
    });
  },

  /**
   * Dynamically creates a projectile entity and attaches
   * the projectile component to it.
   */
  spawnProjectile(attackerId, direction) {
    const attacker   = characters.get(attackerId);
    if (!attacker)   return;

    const attackerEl = document.getElementById(attacker.entityId);
    if (!attackerEl) return;

    const pos        = attackerEl.object3D.position;

    const projectile = document.createElement('a-sphere');
    projectile.setAttribute('radius', '0.2');
    projectile.setAttribute('color',  '#f39c12');
    projectile.setAttribute('position', `${pos.x} ${pos.y + 1} ${pos.z}`);
    projectile.setAttribute('projectile', `
      attackerId: ${attackerId};
      dirX: ${direction.x};
      dirY: ${direction.y};
      dirZ: ${direction.z};
    `);
    projectile.classList.add('projectile-entity');

    this.el.appendChild(projectile);
  },

  /**
   * Flashes the defender red briefly on a melee hit.
   * Bisesh can swap this for a real hit animation later.
   */
  playMeleeEffect(attackerId, defenderId) {
    const defender   = characters.get(defenderId);
    if (!defender)   return;

    const defenderEl = document.getElementById(defender.entityId);
    if (!defenderEl) return;

    const mesh = defenderEl.getObject3D('mesh');
    if (!mesh)  return;

    // flash red for 200ms
    mesh.material.color.set('#e74c3c');
    setTimeout(() => mesh.material.color.set('#ffffff'), 200);
  },

  /**
   * Visually removes a defeated character from the scene.
   * Bisesh can replace this with a death animation later.
   */
  handleDeathVisual(characterId) {
    const char   = characters.get(characterId);
    if (!char)   return;

    const charEl = document.getElementById(char.entityId);
    if (!charEl) return;

    // hide entity — don't fully remove so we can still reference it
    charEl.setAttribute('visible', 'false');
  },

  /**
   * Removes all in-flight projectiles from the scene.
   * Called on match end to clean up.
   */
  clearProjectiles() {
    const projectiles = this.el.querySelectorAll('.projectile-entity');
    projectiles.forEach(p => p.parentNode.removeChild(p));
  },
});

// ============================================
// NAME TAG
// Attach to any player entity:
// <a-entity name-tag="label: Adventurer; color: #c9a84c">
// Renders a floating text label above the character's head.
// ============================================
AFRAME.registerComponent('name-tag', {
  schema: {
    label: { type: 'string',  default: '' },
    color: { type: 'color',   default: '#c9a84c' },
    yOffset: { type: 'number', default: 2.4 },
  },

  init() {
    // Background pill
    this.bg = document.createElement('a-plane');
    this.bg.setAttribute('width',    '1.6');
    this.bg.setAttribute('height',   '0.36');
    this.bg.setAttribute('color',    '#04060c');
    this.bg.setAttribute('opacity',  '0.72');
    this.bg.setAttribute('position', `0 ${this.data.yOffset} 0`);
    this.bg.setAttribute('look-at',  '[camera]');

    // Text label
    this.text = document.createElement('a-text');
    this.text.setAttribute('value',    this.data.label);
    this.text.setAttribute('align',    'center');
    this.text.setAttribute('color',    this.data.color);
    this.text.setAttribute('width',    '1.4');
    this.text.setAttribute('position', `0 ${this.data.yOffset + 0.01} 0`);
    this.text.setAttribute('look-at',  '[camera]');
    this.text.setAttribute('font',     'https://cdn.aframe.io/fonts/Exo2Bold.fnt');

    this.el.appendChild(this.bg);
    this.el.appendChild(this.text);
  },

  update() {
    if (this.text) {
      this.text.setAttribute('value', this.data.label);
      this.text.setAttribute('color', this.data.color);
    }
  },

  remove() {
    if (this.bg)   this.el.removeChild(this.bg);
    if (this.text) this.el.removeChild(this.text);
  },
});