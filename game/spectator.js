// ============================================
// SPECTATOR SYSTEM
// ============================================
let isSpectating    = false;
let spectateTargets = []; // list of living remote player ids
let spectateIndex   = 0;

function enterSpectateMode() {
  if (isSpectating) return;
  isSpectating = true;

  console.log('[SPECTATE] Entering spectate mode');

  // build list of living remote players
  spectateTargets = [];
  characters.forEach((char, id) => {
    if (id === 'villain') return;    // skip self
    if (!char.isAlive)    return;    // skip dead
    spectateTargets.push(id);
  });

  if (spectateTargets.length === 0) {
    console.log('[SPECTATE] No living players to spectate');
    return;
  }

  // pick random starting target
  spectateIndex = Math.floor(Math.random() * spectateTargets.length);
  switchSpectateTarget();

  // show overlay
  document.getElementById('spectate-overlay').style.display = 'block';

  // listen for N key to cycle players
  window.addEventListener('keydown', onSpectateKey);
}

function switchSpectateTarget() {
  const targetId = spectateTargets[spectateIndex];
  const targetEl = document.getElementById(targetId);
  if (!targetEl) return;

  // move camera to target entity
  const cam = document.getElementById('main-camera');
  if (cam) {
    // detach from current parent, attach to target
    targetEl.appendChild(cam);
    cam.setAttribute('position', '0 3 0');
  }

  // update overlay text
  const char = characters.get(targetId);
  const name = char?.name || targetId;
  document.getElementById('spectate-text').textContent = `Spectating: ${name}`;

  console.log('[SPECTATE] Now spectating:', name);
}

function onSpectateKey(e) {
  if (e.code !== 'KeyN') return;

  // remove dead players from list
  spectateTargets = spectateTargets.filter(id => {
    const char = characters.get(id);
    return char && char.isAlive;
  });

  if (spectateTargets.length === 0) return;

  spectateIndex = (spectateIndex + 1) % spectateTargets.length;
  switchSpectateTarget();
}

// listen for local player death
document.addEventListener('game:characterDefeated', (e) => {
  if (e.detail.characterId !== 'villain') return; // only care about local player

  const myRole = sessionStorage.getItem('selectedRole') || 'villain';

  if (myRole === 'villain') {
    // villain died — game over, handled by match manager
    return;
  }

  // hero died — enter spectate
  enterSpectateMode();
});