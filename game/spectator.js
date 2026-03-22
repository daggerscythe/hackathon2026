// ============================================
// SPECTATOR SYSTEM

// ============================================
var isSpectating    = false;
var spectateTargets = []; // list of living remote player ids
var spectateIndex   = 0;
const myLocalCharId = sessionStorage.getItem('selectedRole') === 'villain'
  ? 'villain'
  : sessionStorage.getItem('clientId');

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
  startSpectateFollow();

  // show overlay
  document.getElementById('spectate-overlay').style.display = 'block';

  // listen for N key to cycle players
  window.addEventListener('keydown', onSpectateKey);
}

function switchSpectateTarget() {
  const targetId = spectateTargets[spectateIndex];
  const targetEl = document.getElementById(targetId);
  if (!targetEl) return;

  window._spectateTargetId = targetId;

  // // move camera to target entity
  // const cam = document.getElementById('main-camera');
  // if (cam) {
  //   // detach from current parent, attach to target
  //   targetEl.appendChild(cam);
  //   cam.setAttribute('position', '0 3 0');
  // }

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

function startSpectateFollow() {
  function tick() {
    if (!isSpectating) return;
    const targetId = window._spectateTargetId;
    if (!targetId) { requestAnimationFrame(tick); return; }

    const targetEl = document.getElementById(targetId);
    if (!targetEl) { requestAnimationFrame(tick); return; }

    const cam = document.getElementById('main-camera');
    if (!cam) { requestAnimationFrame(tick); return; }

    // position camera above and behind target in world space
    const targetPos = targetEl.object3D.position;
    // move player-villain directly to target position — camera offset handles the rest
    const playerEl = document.getElementById('player-villain');
    if (!playerEl) { requestAnimationFrame(tick); return; }

    const body = playerEl.components['dynamic-body']?.body;
    if (body) {
      body.position.set(0, 8, 0);
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
    } else {
      playerEl.object3D.position.set(targetPos.x, targetPos.y, targetPos.z);
    }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// listen for local player death
document.addEventListener('game:characterDefeated', (e) => {
  if (e.detail.characterId !== myLocalCharId) return; // only care about local player

  const myRole = sessionStorage.getItem('selectedRole') || 'villain';

  if (myRole === 'villain') {
    // villain died — game over, handled by match manager
    return;
  }

  // hero died — enter spectate
  enterSpectateMode();
});