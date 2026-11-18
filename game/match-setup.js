// ============================================
// MATCH SETUP — builds the arena roster and starts the match
// Depends on game.js, physics.js, network.js, roster.js, bot-ai.js
//
// Multiplayer reads what the lobby wrote to sessionStorage:
//   lobbyPlayers — [{ clientId, username, character: {name, cls, role, str, mag, def, spd, pow}, spawnX/Y/Z }]
// Solo reads what solo-setup.html wrote:
//   soloConfig   — { difficulty, player: character, bots: [character, …] }
//
// Every character is registered up front, then initMatch() runs once,
// so every client starts with the same roster.
// ============================================

// Goliath on the red spawn platform, heroes on the blue one
const SPAWN_Y       = 1.2;
const VILLAIN_SPAWN = { x: 0, y: SPAWN_Y, z: -11 };
const HERO_SPAWNS   = [{ x: 0, y: SPAWN_Y, z: 11 }, { x: -1.3, y: SPAWN_Y, z: 11.6 }, { x: 1.3, y: SPAWN_Y, z: 11.6 }];

const CLASS_MODEL = {
  villain_mage: 'model-villain-mage',
  brute:        'model-brute',
  agile:        'model-agile',
  mage:         'model-hero-mage',
  support:      'model-support',
  dps:          'model-dps',
  tank:         'model-tank',
};

/** CSV-style character object → stats for addCharacter */
function toStats(character, fallbackName) {
  return {
    name:     character?.name || fallbackName || 'Unknown',
    strength: character?.str ?? 50,
    magic:    character?.mag ?? 50,
    defense:  character?.def ?? 30,
    speed:    character?.spd ?? 50,
    power:    character?.pow ?? 30,
  };
}

/**
 * Create a non-local character entity (remote player or bot):
 * model + optional sword + floating health bar.
 */
function createCharacterEntity(entityId, characterId, cls, label, pos) {
  const entity = document.createElement('a-entity');
  entity.setAttribute('id', entityId);
  entity.dataset.characterId = characterId;
  entity.setAttribute('position', `${pos.x} ${ArenaLayout.groundHeightAt(pos.x, pos.z) - BODY_OFFSET} ${pos.z}`);
  entity.setAttribute('health-bar', `nickname: ${label}; health: 100; maxHealth: 100`);

  const model = document.createElement('a-gltf-model');
  model.classList.add('char-model');
  model.setAttribute('src', `#${CLASS_MODEL[cls] || 'model-tank'}`);
  model.setAttribute('scale', '0.8 0.8 0.8');
  model.setAttribute('position', `0 ${MODEL_OFFSET} 0`);
  entity.appendChild(model);

  // the sword is a child of the model so it turns with the body (model faces +Z)
  if (!MAGIC_CLASSES.includes(cls) && cls !== 'support') {
    const weapon = document.createElement('a-entity');
    weapon.classList.add('char-weapon');
    weapon.setAttribute('gltf-model', '#sword');
    weapon.setAttribute('scale', '1.4 1.4 1.4');
    weapon.setAttribute('position', '-0.65 1.4 0.35');
    weapon.setAttribute('rotation', '40 0 0');
    weapon.setAttribute('weapon-swing', `characterId: ${characterId}; amount: 70`);
    model.appendChild(weapon);
  }

  document.querySelector('a-scene').appendChild(entity);
  return entity;
}

/** Configure the physics-driven local player entity for the chosen character. */
function setupLocalPlayer(character, spawn) {
  const cls      = character?.cls  || 'brute';
  const role     = character?.role || 'villain';
  const playerEl = document.getElementById(LOCAL_ENTITY);

  addCharacter(LOCAL_ID, role, cls, toStats(character, 'You'), LOCAL_ENTITY);

  playerEl.dataset.characterId = LOCAL_ID;
  playerEl.setAttribute('position', `${spawn.x} ${spawn.y} ${spawn.z}`);
  playerEl.setAttribute('attack-input', `attackClass: ${cls}`);

  // the physics body may not exist yet — place it as soon as it does
  const placeBody = () => {
    const body = playerEl.components['dynamic-body']?.body;
    if (!body) return false;
    body.position.set(spawn.x, spawn.y, spawn.z);
    body.velocity.set(0, 0, 0);
    return true;
  };
  if (!placeBody()) playerEl.addEventListener('body-loaded', placeBody, { once: true });

  playerEl.components['attack-input']?.spawnPermanentWeapon();

  // face the arena centre
  const look = document.getElementById('main-camera').components['look-controls'];
  if (look?.yawObject) look.yawObject.rotation.y = Math.atan2(spawn.x, spawn.z);
}

function startMultiplayerMatch() {
  const lobbyPlayers = JSON.parse(sessionStorage.getItem('lobbyPlayers') || '[]');

  lobbyPlayers.forEach(p => {
    const spawn = { x: p.spawnX ?? 0, y: p.spawnY ?? SPAWN_Y, z: p.spawnZ ?? 0 };
    const cls   = p.character?.cls  || 'tank';
    const role  = p.character?.role || 'hero';

    if (p.clientId === LOCAL_ID) {
      setupLocalPlayer(p.character, spawn);
      return;
    }

    const entityId = `remote-${p.clientId}`;
    createCharacterEntity(entityId, p.clientId, cls, p.username || 'Player', spawn);
    addCharacter(p.clientId, role, cls, toStats(p.character, p.username), entityId);
    remoteTargets[entityId] = { position: { ...spawn, y: ArenaLayout.groundHeightAt(spawn.x, spawn.z) - BODY_OFFSET }, rotation: { y: 0 } };
  });

  connectToGame();
  beginMatch();
}

/** Arena opened directly (no setup screen): random hero + 2 allies vs a villain bot. */
async function defaultSoloConfig() {
  await Roster.load();
  const pick = (side, classes) => {
    const cls = classes[Math.floor(Math.random() * classes.length)];
    return Roster.toGameCharacter(Roster.random(side, cls), side);
  };
  return {
    difficulty: 'normal',
    player: pick('Hero', Roster.HERO_CLASSES),
    bots:   [pick('Villain', Roster.VILLAIN_CLASSES), pick('Hero', Roster.HERO_CLASSES), pick('Hero', Roster.HERO_CLASSES)],
  };
}

async function startSoloMatch() {
  let config = null;
  try { config = JSON.parse(sessionStorage.getItem('soloConfig') || 'null'); } catch {}
  if (!config?.player) config = await defaultSoloConfig();

  const heroSpawns = [...HERO_SPAWNS];
  const spawnFor   = c => (c.role === 'villain' ? VILLAIN_SPAWN : heroSpawns.shift() || { x: 0, y: SPAWN_Y, z: 9 });

  setupLocalPlayer(config.player, spawnFor(config.player));

  config.bots.forEach((character, i) => {
    const id    = `bot-${i + 1}`;
    const spawn = spawnFor(character);
    const label = character.role === 'villain' ? `${character.name} (Goliath)` : character.name;

    const entity = createCharacterEntity(id, id, character.cls, label, spawn);
    const bot    = addCharacter(id, character.role, character.cls, toStats(character), id);
    bot.isBot    = true;
    entity.setAttribute('bot-brain', `characterId: ${id}; difficulty: ${config.difficulty || 'normal'}`);
  });

  beginMatch();
}

/** Start the match with whatever is registered in `characters`. */
function beginMatch() {
  const all     = [...characters.values()];
  const villain = all.find(c => c.role === 'villain');
  const heroIds = all.filter(c => c.role === 'hero').map(c => c.id);
  initMatch(villain?.id, heroIds);
}

function setupMatch() {
  if (Net.isMultiplayer) startMultiplayerMatch();
  else startSoloMatch();
}

document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene');
  if (scene.hasLoaded) setupMatch();
  else scene.addEventListener('loaded', setupMatch);
});
