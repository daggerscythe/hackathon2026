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
    document.dispatchEvent(new CustomEvent('game:stateChange', {
        detail: { previous: previousState, current: newState}
    }));

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

    document.dispatchEvent(new CustomEvent('game:healthChanged', {
        detail: {
            characterId: defenderId,
            health: defender.health,
            maxHealth: defender.maxHealth,
        }
    }));

    if (defender.health <= 0) {
        handleDeath(defenderId);
    }
}

function handleDeath(id) {
    const char = characters.get(id);
    if (!char) return;

    char.isAlive = false;

    document.dispatchEvent(new CustomEvent('game:characterDefeated', {
        detail: { id, role: char.role }
    }));

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

            document.dispatchEvent(new CustomEvent('game:healthChanged', {
                detail: {
                    characterId: villain.id,
                    health:      villain.health,
                    maxHealth:   villain.maxHealth,
                }
            }));
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

    document.dispatchEvent(new CustomEvent('game:healthChanged', {
        detail: {
            characterId: healeeId,
            health:      healee.health,
            maxHealth:   healee.maxHealth,
        }
    }));
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
}

matchState = {
    villainId,
    heroIds,
    winner: null, // 'hero' | 'villain'
    startTime: Date.now(),
    endTime: null,
};

// start listening for deaths
document.addEventListener('game:characterDefeated', onCharacterDefeated);

transitionTo(STATES.BATTLE);
console.log(`Match started. Villain: ${villainId} vs Heroes: ${heroIds.join(', ')}`);

document.dispatchEvent(new CustomEvent('game:matchStarted', {
    detail: { villainId, heroIds }
}));

function onCharacterDefeated(event) {
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
    document.removeEventListener('game:characterDefeated', onCharacterDefeated);

    awardExp(winnerRole);
    transitionTo(STATES.GAME_OVER);

    console.log(`Match over. ${winnerRole} wins.`);

    document.dispatchEvent(new CustomEvent('game:matchOver', {
        detail: {
            winner: winnerRole,
            villainId: matchState.villainId,
            heroIds: matchState.heroIds,
            duration: matchState.endTime - matchState.startTime,
        }
    }));

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

        document.dispatchEvent(new CustomEvent('game:expAwarded', {
            detail: {
                characterId: char.id,
                amount:      won ? EXP_REWARD.win : EXP_REWARD.loss,
                total:       char.exp,
            }
        }));
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

    document.dispatchEvent(new CustomEvent('game:meleeFired', {
        detail: {
            attackerId,
            defenderId,
        }
    }));
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

    document.dispatchEvent(new CustomEvent('game:magicFired', {
        detail: {
            attackerId,
            direction,
        }
    }));
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

    document.dispatchEvent(new CustomEvent('game:healPerformed', {
        detail: {
            healerId,
            healeeId,
        }
    }));
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
// EXP & Progression 
// =====================================

// =================================================
// Event Bus - communicating with other files
// =================================================

// =================================================
// A-Frame Hooks - moving entities, animations, etc
// =================================================