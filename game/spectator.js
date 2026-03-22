// ============================================
// SPECTATOR SYSTEM
// ============================================
var isSpectating    = false;

const myLocalCharId = sessionStorage.getItem('selectedRole') === 'villain'
  ? 'villain'
  : sessionStorage.getItem('clientId');

function enterSpectateMode() {
  if (isSpectating) return;
  isSpectating = true;
  console.log('[SPECTATE] Entering spectate mode');
  startSpectateFollow();
}

function startSpectateFollow() {
  function tick() {
    if (!isSpectating) return;

    const playerEl = document.getElementById('player-villain');
    if (!playerEl) { requestAnimationFrame(tick); return; }

    const body = playerEl.components['dynamic-body']?.body;
    if (body) {
      body.position.set(0, 8, 0);
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
    } else {
      playerEl.object3D.position.set(0, 8, 0);
    }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

document.addEventListener('game:characterDefeated', (e) => {
  if (e.detail.characterId !== myLocalCharId) return;
  const myRole = sessionStorage.getItem('selectedRole') || 'villain';
  if (myRole === 'villain') return;
  enterSpectateMode();
});