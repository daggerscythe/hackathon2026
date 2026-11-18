// ============================================
// SPECTATOR — a defeated hero floats above the arena until the match ends
// Depends on game.js
// ============================================
var isSpectating = false;

const SPECTATE_POS = { x: 0, y: 10, z: 12 };

function enterSpectateMode() {
  if (isSpectating) return;
  isSpectating = true;

  const playerEl = document.getElementById(LOCAL_ENTITY);
  if (!playerEl) return;

  // freeze the physics body high above the arena so the camera has a clear view
  const body = playerEl.components['dynamic-body']?.body;
  if (body) {
    body.type = 4; // CANNON.Body.KINEMATIC — ignore gravity and collisions
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    body.position.set(SPECTATE_POS.x, SPECTATE_POS.y, SPECTATE_POS.z);
  }
  playerEl.object3D.position.set(SPECTATE_POS.x, SPECTATE_POS.y, SPECTATE_POS.z);

  document.getElementById('local-weapon')?.setAttribute('visible', 'false');
  if (typeof showBanner === 'function') showBanner('You have fallen — spectating', 3000);
}

onCharacterDefeated(({ characterId, role }) => {
  if (characterId === LOCAL_ID && role === 'hero') enterSpectateMode();
});
