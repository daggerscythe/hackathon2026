// ============================================
// MATCH SETUP — builds the arena roster and starts the match
// Depends on game.js, physics.js, network.js
//
// Reads what the lobby wrote to sessionStorage:
//   lobbyPlayers — [{ clientId, username, character: {name, cls, role, str, mag, def, spd, pow}, spawnX/Y/Z }]
// Every character is registered up front, then initMatch() runs once,
// so every client starts with the same roster.
// ============================================

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
  entity.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);
  entity.setAttribute('health-bar', `nickname: ${label}; health: 100; maxHealth: 100`);

  const model = document.createElement('a-gltf-model');
  model.classList.add('char-model');
  model.setAttribute('src', `#${CLASS_MODEL[cls] || 'model-tank'}`);
  model.setAttribute('scale', '0.8 0.8 0.8');
  entity.appendChild(model);

  if (!MAGIC_CLASSES.includes(cls) && cls !== 'support') {
    const weapon = document.createElement('a-gltf-model');
    weapon.classList.add('char-weapon');
    weapon.setAttribute('src', '#sword');
    weapon.setAttribute('scale', '0.08 0.08 0.08');
    weapon.setAttribute('position', '-0.2 0.2 -0.75');
    weapon.setAttribute('rotation', '0 0 -45');
    entity.appendChild(weapon);
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
    const spawn = { x: p.spawnX ?? 0, y: p.spawnY ?? 3, z: p.spawnZ ?? 0 };
    const cls   = p.character?.cls  || 'tank';
    const role  = p.character?.role || 'hero';

    if (p.clientId === LOCAL_ID) {
      setupLocalPlayer(p.character, spawn);
      return;
    }

    const entityId = `remote-${p.clientId}`;
    createCharacterEntity(entityId, p.clientId, cls, p.username || 'Player', spawn);
    addCharacter(p.clientId, role, cls, toStats(p.character, p.username), entityId);
    remoteTargets[entityId] = { position: spawn, rotation: { y: 0 } };
  });

  connectToGame();
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
  startMultiplayerMatch();
}

document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene');
  if (scene.hasLoaded) setupMatch();
  else scene.addEventListener('loaded', setupMatch);
});
