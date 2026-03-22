// ============================================
// BILLBOARD HEALTH BAR COMPONENT
// Projects a world position to screen space
// and places an HTML health bar there
// ============================================
AFRAME.registerComponent('health-bar', {
    schema: {
    nickname: { type: 'string', default: 'Player' },
    health:   { type: 'number', default: 100 },
    maxHealth:{ type: 'number', default: 100 },
    },

    init() {
    // create the HTML overlay element
    this.container = document.createElement('div');
    this.container.className = 'health-bar-container';
    this.container.innerHTML = `
        <div class="player-nickname">${this.data.nickname}</div>
        <div class="health-bar-bg">
        <div class="health-bar-fill" style="width:100%"></div>
        </div>
    `;
    document.body.appendChild(this.container);

    this.fill     = this.container.querySelector('.health-bar-fill');
    this.nameEl   = this.container.querySelector('.player-nickname');
    this.camera   = null;
    this.renderer = null;

    // listen for health changes from game.js
    const id = this.el.dataset.characterId || this.el.getAttribute('id');
    this.characterId = id;
    this.onHealthChanged = (e) => {
        if (e.detail.characterId !== this.characterId) return;
        this.updateHealth(e.detail.health, e.detail.maxHealth);
    };

    this.onDefeated = (e) => {
        console.log('[HEALTHBAR] defeated event:', e.detail.characterId, '| my id:', this.characterId);
        if (e.detail.characterId !== this.characterId) return;
        this.container.style.display = 'none';
    };
    document.addEventListener('game:healthChanged',      this.onHealthChanged);
    document.addEventListener('game:characterDefeated',  this.onDefeated);

    },

    // call this from game.js when health changes
    updateHealth(health, maxHealth) {
    const pct = Math.max(0, (health / maxHealth) * 100);
    this.fill.style.width = `${pct}%`;

    // color shifts green → yellow → red
    if (pct > 60)      this.fill.style.background = '#2ecc71';
    else if (pct > 30) this.fill.style.background = '#f39c12';
    else               this.fill.style.background = '#e74c3c';
    },

    tick() {
    // lazy-grab camera and renderer once scene is ready
    if (!this.camera) {
        const camEl = document.getElementById('main-camera');
        if (!camEl || !camEl.object3D) return;
        this.camera   = camEl.object3D;
        this.renderer = this.el.sceneEl.renderer;
    }

    // world position — place bar above the entity's head
    const worldPos = new THREE.Vector3();
    this.el.object3D.getWorldPosition(worldPos);
    worldPos.y += 2.4; // float above head

    // project to screen space
    const canvas   = this.renderer.domElement;
    const projected = worldPos.clone().project(
        this.el.sceneEl.camera
    );

    const x = (projected.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = (1 - (projected.y * 0.5 + 0.5)) * canvas.clientHeight;

    // hide if behind camera
    if (projected.z > 1) {
        this.container.style.display = 'none';
        return;
    }

    this.container.style.display = 'flex';
    this.container.style.left    = `${x}px`;
    this.container.style.top     = `${y}px`;
    },

    remove() {
    document.removeEventListener('game:healthChanged',     this.onHealthChanged);
    document.removeEventListener('game:characterDefeated', this.onDefeated);
    if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
    }
    },
});