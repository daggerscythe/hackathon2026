// ============================================
// BILLBOARD HEALTH BAR COMPONENT
// Projects the entity's head position to screen space and places an
// HTML health bar there. Listens to game.js health / death events.
// ============================================
const _hbWorldPos = new THREE.Vector3();

AFRAME.registerComponent('health-bar', {
  schema: {
    nickname:  { type: 'string', default: 'Player' },
    health:    { type: 'number', default: 100 },
    maxHealth: { type: 'number', default: 100 },
  },

  init() {
    this.container = document.createElement('div');
    this.container.className = 'health-bar-container';
    this.container.innerHTML = `
      <div class="player-nickname"></div>
      <div class="health-bar-bg"><div class="health-bar-fill" style="width:100%"></div></div>
    `;
    this.container.querySelector('.player-nickname').textContent = this.data.nickname;
    document.body.appendChild(this.container);

    this.fill    = this.container.querySelector('.health-bar-fill');
    this.nameEl  = this.container.querySelector('.player-nickname');
    this.defeated = false;

    this.onHealthChanged = (e) => {
      if (e.detail.characterId === this.characterId()) this.updateHealth(e.detail.health, e.detail.maxHealth);
    };
    this.onDefeated = (e) => {
      if (e.detail.characterId !== this.characterId()) return;
      this.defeated = true;
      this.container.style.display = 'none';
    };
    document.addEventListener('game:healthChanged',     this.onHealthChanged);
    document.addEventListener('game:characterDefeated', this.onDefeated);
  },

  update() {
    if (this.nameEl) this.nameEl.textContent = this.data.nickname;
  },

  // read lazily: match-setup sets data-character-id after the entity exists
  characterId() {
    return this.el.dataset.characterId || this.el.id;
  },

  updateHealth(health, maxHealth) {
    const pct = Math.max(0, (health / maxHealth) * 100);
    this.fill.style.width = `${pct}%`;
    this.fill.style.background = pct > 60 ? '#2ecc71' : pct > 30 ? '#f39c12' : '#e74c3c';
  },

  tick() {
    // never draw a bar over our own head, or for the dead
    if (this.defeated || this.el.id === LOCAL_ENTITY || !this.el.object3D.visible) {
      this.container.style.display = 'none';
      return;
    }

    const camera   = this.el.sceneEl.camera;
    const renderer = this.el.sceneEl.renderer;
    if (!camera || !renderer) return;

    this.el.object3D.getWorldPosition(_hbWorldPos);
    _hbWorldPos.y += MODEL_OFFSET + 3.1; // just above the model's head
    _hbWorldPos.project(camera);

    if (_hbWorldPos.z > 1) { // behind the camera
      this.container.style.display = 'none';
      return;
    }

    const canvas = renderer.domElement;
    this.container.style.display = 'flex';
    this.container.style.left = `${(_hbWorldPos.x * 0.5 + 0.5) * canvas.clientWidth}px`;
    this.container.style.top  = `${(1 - (_hbWorldPos.y * 0.5 + 0.5)) * canvas.clientHeight}px`;
  },

  remove() {
    document.removeEventListener('game:healthChanged',     this.onHealthChanged);
    document.removeEventListener('game:characterDefeated', this.onDefeated);
    this.container?.parentNode?.removeChild(this.container);
  },
});
