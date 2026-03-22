// =============================================================================
// ui.js  —  Battle Arena HUD
// Hooks into game.js events via the GAME_EVENTS bus.
// Expects to load after game.js (which defines the event listeners / emitters).
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// 0.  FONTS & GLOBAL STYLES
// ─────────────────────────────────────────────────────────────────────────────
(function injectStyles() {
  const link = document.createElement('link');
  link.rel  = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Cinzel+Decorative:wght@700&family=Share+Tech+Mono&display=swap';
  document.head.appendChild(link);

  const style = document.createElement('style');
  style.textContent = `
    /* ── CSS vars ────────────────────────────────────────────────────────── */
    :root {
      --gold:        #c9a84c;
      --gold-light:  #e8d090;
      --gold-dim:    #9a7a30;
      --hero:        #4ca8c9;
      --hero-dim:    #2a6a8a;
      --villain:     #c94c4c;
      --villain-dim: #8a2a2a;
      --heal:        #4cc94c;
      --bg-deep:     rgba(4, 6, 12, 0.92);
      --bg-panel:    rgba(8, 12, 24, 0.85);
      --white:       rgba(255,255,255,0.92);
      --white-dim:   rgba(255,255,255,0.55);
      --white-faint: rgba(255,255,255,0.25);
      --red:         #e74c3c;
      --orange:      #e8962a;
      --green:       #4cc94c;
      --font-head:   'Cinzel Decorative', serif;
      --font-label:  'Cinzel', serif;
      --font-mono:   'Share Tech Mono', monospace;
    }

    /* ── Base HUD layer ──────────────────────────────────────────────────── */
    #hud-root {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 500;
      font-family: var(--font-label);
    }

    /* ── Villain health — bottom-left ────────────────────────────────────── */
    #hud-villain {
      position: absolute;
      bottom: 28px;
      left: 28px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 280px;
    }
    .hud-role-label {
      font-size: 0.48rem;
      letter-spacing: 5px;
      text-transform: uppercase;
      color: var(--gold-dim);
    }
    .hud-name {
      font-family: var(--font-head);
      font-size: 0.85rem;
      letter-spacing: 3px;
      color: var(--white);
      text-shadow: 0 0 16px currentColor;
    }
    .hud-bar-track {
      position: relative;
      width: 100%;
      height: 8px;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.1);
      overflow: visible;
    }
    .hud-bar-fill {
      position: absolute;
      inset: 0;
      height: 100%;
      transition: width 0.35s cubic-bezier(.4,0,.2,1),
                  background 0.35s;
    }
    .hud-bar-fill.villain-fill {
      background: linear-gradient(90deg, var(--villain-dim), var(--villain));
    }
    .hud-bar-fill.hero-fill {
      background: linear-gradient(90deg, var(--hero-dim), var(--hero));
    }
    /* flash on damage */
    .hud-bar-fill.flash-damage {
      animation: flashDmg 0.3s ease;
    }
    @keyframes flashDmg {
      0%   { filter: brightness(2.5); }
      100% { filter: brightness(1); }
    }
    /* flash on heal */
    .hud-bar-fill.flash-heal {
      animation: flashHeal 0.4s ease;
    }
    @keyframes flashHeal {
      0%,50% { box-shadow: 0 0 12px 4px var(--heal); }
      100%   { box-shadow: none; }
    }
    .hud-hp-text {
      font-family: var(--font-mono);
      font-size: 0.58rem;
      color: var(--white-dim);
      margin-top: 2px;
    }

    /* ── Hero panel — bottom-right ───────────────────────────────────────── */
    #hud-heroes {
      position: absolute;
      bottom: 28px;
      right: 28px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 240px;
      align-items: flex-end;
    }
    .hero-row {
      display: flex;
      flex-direction: column;
      gap: 3px;
      width: 100%;
      align-items: flex-end;
      transition: opacity 0.4s;
    }
    .hero-row.defeated {
      opacity: 0.3;
      filter: grayscale(1);
    }
    .hero-row .hud-name {
      font-size: 0.65rem;
      text-align: right;
    }
    .hero-role-label {
      font-size: 0.42rem;
      letter-spacing: 4px;
      text-transform: uppercase;
      color: var(--gold-dim);
    }
    .skull-badge {
      font-size: 0.8rem;
      margin-left: 4px;
      animation: popIn 0.3s cubic-bezier(.4,0,.2,1);
    }
    @keyframes popIn {
      0%   { transform: scale(0); opacity: 0; }
      70%  { transform: scale(1.3); }
      100% { transform: scale(1); opacity: 1; }
    }

    /* ── Cooldown bar — bottom-center ────────────────────────────────────── */
    #hud-cooldowns {
      position: absolute;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 14px;
      align-items: flex-end;
    }
    .cd-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      width: 56px;
    }
    .cd-icon {
      width: 44px;
      height: 44px;
      border: 1px solid rgba(201,168,76,0.3);
      background: var(--bg-panel);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      position: relative;
      overflow: hidden;
      transition: border-color 0.2s;
    }
    .cd-icon.ready {
      border-color: var(--gold);
      box-shadow: 0 0 10px rgba(201,168,76,0.35);
    }
    /* sweep overlay for cooldown */
    .cd-sweep {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.65);
      transform-origin: bottom center;
      transition: transform 0.1s linear;
    }
    .cd-label {
      font-family: var(--font-mono);
      font-size: 0.5rem;
      color: var(--white-faint);
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .cd-timer {
      font-family: var(--font-mono);
      font-size: 0.52rem;
      color: var(--gold-dim);
      min-height: 0.7rem;
      text-align: center;
    }

    /* key binding hint strip */
    .cd-key {
      position: absolute;
      bottom: 2px;
      right: 3px;
      font-family: var(--font-mono);
      font-size: 0.4rem;
      color: rgba(255,255,255,0.3);
    }

    /* ── Kill feed — top-right ───────────────────────────────────────────── */
    #hud-killfeed {
      position: absolute;
      top: 24px;
      right: 24px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      align-items: flex-end;
      max-width: 300px;
    }
    .kf-entry {
      background: var(--bg-deep);
      border-right: 2px solid var(--gold);
      padding: 5px 10px;
      font-family: var(--font-mono);
      font-size: 0.58rem;
      color: var(--white-dim);
      letter-spacing: 1px;
      animation: kfSlide 0.25s ease;
      white-space: nowrap;
    }
    .kf-entry.villain-kill { border-color: var(--villain); }
    .kf-entry.hero-kill    { border-color: var(--hero); }
    @keyframes kfSlide {
      from { opacity: 0; transform: translateX(20px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .kf-entry.fade-out {
      animation: kfFade 0.5s ease forwards;
    }
    @keyframes kfFade {
      to { opacity: 0; transform: translateX(20px); }
    }

    /* ── Combat log — left panel, mid ────────────────────────────────────── */
    #hud-combatlog {
      position: absolute;
      left: 28px;
      top: 50%;
      transform: translateY(-50%);
      width: 220px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      max-height: 180px;
      overflow: hidden;
    }
    .log-header {
      font-size: 0.42rem;
      letter-spacing: 5px;
      text-transform: uppercase;
      color: var(--gold-dim);
      margin-bottom: 4px;
      border-bottom: 1px solid rgba(201,168,76,0.15);
      padding-bottom: 3px;
    }
    .log-line {
      font-family: var(--font-mono);
      font-size: 0.5rem;
      color: var(--white-faint);
      letter-spacing: 0.5px;
      line-height: 1.4;
      animation: logSlide 0.2s ease;
    }
    @keyframes logSlide {
      from { opacity: 0; transform: translateX(-8px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .log-line .log-attacker { color: var(--gold-dim); }
    .log-line .log-dmg      { color: var(--red); }
    .log-line .log-heal     { color: var(--green); }
    .log-line .log-target   { color: var(--white-dim); }

    /* ── State banner — center top ────────────────────────────────────────── */
    #hud-banner {
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      text-align: center;
      pointer-events: none;
    }
    .banner-text {
      font-family: var(--font-head);
      font-size: 1.1rem;
      letter-spacing: 8px;
      text-transform: uppercase;
      color: var(--gold-light);
      text-shadow: 0 0 30px rgba(201,168,76,0.6);
      padding: 12px 32px;
      background: linear-gradient(180deg, rgba(4,6,12,0.85) 0%, transparent 100%);
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.4s;
    }
    .banner-text.visible { opacity: 1; }

    /* ── Match Over overlay ──────────────────────────────────────────────── */
    #hud-gameover {
      position: fixed;
      inset: 0;
      background: rgba(4,6,12,0);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      z-index: 600;
      pointer-events: none;
      transition: background 0.8s;
    }
    #hud-gameover.active {
      background: rgba(4,6,12,0.82);
      pointer-events: all;
    }
    .go-title {
      font-family: var(--font-head);
      font-size: clamp(2rem, 5vw, 3.8rem);
      letter-spacing: 12px;
      text-transform: uppercase;
      opacity: 0;
      transform: translateY(30px);
      transition: opacity 0.6s 0.3s, transform 0.6s 0.3s;
    }
    .go-title.hero-win    { color: var(--hero);    text-shadow: 0 0 60px rgba(76,168,201,0.6); }
    .go-title.villain-win { color: var(--villain); text-shadow: 0 0 60px rgba(201,76,76,0.6); }
    #hud-gameover.active .go-title {
      opacity: 1;
      transform: translateY(0);
    }
    .go-sub {
      font-family: var(--font-label);
      font-size: 0.7rem;
      letter-spacing: 5px;
      color: var(--white-faint);
      text-transform: uppercase;
      opacity: 0;
      transition: opacity 0.6s 0.7s;
    }
    #hud-gameover.active .go-sub { opacity: 1; }
    .go-duration {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      color: var(--gold-dim);
      letter-spacing: 4px;
      opacity: 0;
      transition: opacity 0.4s 1s;
    }
    #hud-gameover.active .go-duration { opacity: 1; }
    .go-stats {
      display: flex;
      gap: 48px;
      opacity: 0;
      transition: opacity 0.4s 1.1s;
      margin-top: 12px;
    }
    #hud-gameover.active .go-stats { opacity: 1; }
    .go-stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .go-stat-val {
      font-family: var(--font-head);
      font-size: 1.6rem;
      color: var(--gold-light);
    }
    .go-stat-label {
      font-size: 0.45rem;
      letter-spacing: 4px;
      text-transform: uppercase;
      color: var(--white-faint);
    }
    .go-rule {
      width: 120px;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--gold), transparent);
      opacity: 0.5;
    }
    .go-btn {
      font-family: var(--font-label);
      font-size: 0.65rem;
      letter-spacing: 4px;
      text-transform: uppercase;
      background: transparent;
      border: 1px solid rgba(201,168,76,0.4);
      color: var(--gold-light);
      padding: 12px 32px;
      cursor: pointer;
      transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
      pointer-events: all;
      opacity: 0;
      transition: opacity 0.4s 1.4s, border-color 0.2s, box-shadow 0.2s;
    }
    #hud-gameover.active .go-btn { opacity: 1; }
    .go-btn:hover {
      border-color: var(--gold);
      box-shadow: 0 0 20px rgba(201,168,76,0.3);
      background: rgba(201,168,76,0.06);
    }

    /* ── Damage numbers ─────────────────────────────────────────────────── */
    .dmg-float {
      position: fixed;
      font-family: var(--font-head);
      font-size: 1rem;
      font-weight: 700;
      pointer-events: none;
      z-index: 550;
      animation: floatUp 0.9s ease forwards;
      text-shadow: 0 2px 8px rgba(0,0,0,0.8);
    }
    .dmg-float.dmg  { color: var(--red);   }
    .dmg-float.heal { color: var(--green); font-size: 0.85rem; }
    @keyframes floatUp {
      0%   { opacity: 1;   transform: translateY(0); }
      100% { opacity: 0;   transform: translateY(-52px); }
    }
  `;
  document.head.appendChild(style);
})();


// ─────────────────────────────────────────────────────────────────────────────
// 1.  DOM SCAFFOLD
// ─────────────────────────────────────────────────────────────────────────────
let hudRoot, hudVillain, hudHeroes, hudCooldowns, hudKillfeed, hudCombatlog,
    hudBanner, hudGameover;

// Track per-character HP for delta calculations
const _hpCache = new Map();          // characterId → { health, maxHealth, name, role }
const _heroRows = new Map();         // characterId → DOM .hero-row element
let   _villainId = null;             // set on matchStarted
let   _matchStart = null;            // timestamp
let   _totalDmgDealt = 0;
let   _totalKills = 0;
let   _localCharId = null;           // set once we know local player

// Cooldown tracking for the HUD (mirrors game.js but we only read it here)
const CD_CONFIG = {
  magic: { label: 'Magic',  key: 'RMB', icon: '🔮', duration: 3000 },
  heal:  { label: 'Heal',   key: 'H',   icon: '💚', duration: 5000 },
  melee: { label: 'Melee',  key: 'LMB', icon: '⚔️',  duration: 0    },
};

const _cdTimers  = {};   // ability → { lastUsed, intervalId }
const _cdEls     = {};   // ability → { sweep, timer }

function buildHUD() {
  // Root
  hudRoot = document.createElement('div');
  hudRoot.id = 'hud-root';
  document.body.appendChild(hudRoot);

  // ── State banner
  hudBanner = document.createElement('div');
  hudBanner.id = 'hud-banner';
  hudBanner.innerHTML = '<div class="banner-text" id="banner-text">Waiting…</div>';
  hudRoot.appendChild(hudBanner);

  // ── Villain panel
  hudVillain = document.createElement('div');
  hudVillain.id = 'hud-villain';
  hudVillain.innerHTML = `
    <div class="hud-role-label">— Villain</div>
    <div class="hud-name" id="villain-name">—</div>
    <div class="hud-bar-track">
      <div class="hud-bar-fill villain-fill" id="villain-fill" style="width:100%"></div>
    </div>
    <div class="hud-hp-text" id="villain-hp">100 / 100</div>
  `;
  hudRoot.appendChild(hudVillain);

  // ── Hero panel
  hudHeroes = document.createElement('div');
  hudHeroes.id = 'hud-heroes';
  hudRoot.appendChild(hudHeroes);

  // ── Cooldown bar
  hudCooldowns = document.createElement('div');
  hudCooldowns.id = 'hud-cooldowns';
  ['melee','magic','heal'].forEach(ab => {
    const cfg = CD_CONFIG[ab];
    const slot = document.createElement('div');
    slot.className = 'cd-slot';
    slot.innerHTML = `
      <div class="cd-icon ready" id="cd-icon-${ab}">
        ${cfg.icon}
        <div class="cd-sweep" id="cd-sweep-${ab}" style="transform:scaleY(0)"></div>
        <span class="cd-key">${cfg.key}</span>
      </div>
      <div class="cd-label">${cfg.label}</div>
      <div class="cd-timer" id="cd-timer-${ab}"></div>
    `;
    hudCooldowns.appendChild(slot);
    _cdEls[ab] = {
      sweep: slot.querySelector(`#cd-sweep-${ab}`),
      timer: slot.querySelector(`#cd-timer-${ab}`),
      icon:  slot.querySelector(`#cd-icon-${ab}`),
    };
  });
  hudRoot.appendChild(hudCooldowns);

  // ── Kill feed
  hudKillfeed = document.createElement('div');
  hudKillfeed.id = 'hud-killfeed';
  hudRoot.appendChild(hudKillfeed);

  // ── Combat log
  hudCombatlog = document.createElement('div');
  hudCombatlog.id = 'hud-combatlog';
  hudCombatlog.innerHTML = '<div class="log-header">— Combat Log</div>';
  hudRoot.appendChild(hudCombatlog);

  // ── Game Over overlay
  hudGameover = document.createElement('div');
  hudGameover.id = 'hud-gameover';
  hudGameover.innerHTML = `
    <div class="go-title" id="go-title">Victory</div>
    <div class="go-rule"></div>
    <div class="go-sub" id="go-sub">The battle is decided</div>
    <div class="go-duration" id="go-duration"></div>
    <div class="go-stats">
      <div class="go-stat-item">
        <div class="go-stat-val" id="go-kills">0</div>
        <div class="go-stat-label">Defeated</div>
      </div>
      <div class="go-stat-item">
        <div class="go-stat-val" id="go-dmg">0</div>
        <div class="go-stat-label">Damage Dealt</div>
      </div>
      <div class="go-stat-item">
        <div class="go-stat-val" id="go-time">0:00</div>
        <div class="go-stat-label">Duration</div>
      </div>
    </div>
    <button class="go-btn" onclick="UI.onPlayAgain()">← Return to Menu</button>
  `;
  document.body.appendChild(hudGameover);
}


// ─────────────────────────────────────────────────────────────────────────────
// 2.  HERO ROSTER — called on game:matchStarted
// ─────────────────────────────────────────────────────────────────────────────
function buildHeroRows(heroIds) {
  hudHeroes.innerHTML = '';
  _heroRows.clear();

  // header label
  const lbl = document.createElement('div');
  lbl.innerHTML = '<div class="hud-role-label" style="text-align:right">Heroes —</div>';
  hudHeroes.appendChild(lbl);

  heroIds.forEach(id => {
    const char = characters.get(id); // game.js Map
    const name = char ? char.name : id;

    const row = document.createElement('div');
    row.className = 'hero-row';
    row.id = `hero-row-${id}`;
    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:6px; justify-content:flex-end">
        <span class="hero-role-label">${char?.chosenClass ?? 'hero'}</span>
        <span class="hud-name">${name}</span>
      </div>
      <div class="hud-bar-track" style="direction:rtl">
        <div class="hud-bar-fill hero-fill" id="hero-fill-${id}" style="width:100%"></div>
      </div>
      <div class="hud-hp-text" id="hero-hp-${id}" style="text-align:right">100 / 100</div>
    `;
    hudHeroes.appendChild(row);
    _heroRows.set(id, row);

    // seed cache
    _hpCache.set(id, { health: 100, maxHealth: 100 });
  });
}

function setVillainIdentity(id) {
  _villainId = id;
  const char = characters.get(id);
  if (!char) return;
  document.getElementById('villain-name').textContent = char.name;
  _hpCache.set(id, { health: 100, maxHealth: 100 });
}


// ─────────────────────────────────────────────────────────────────────────────
// 3.  HEALTH BAR UPDATE
// ─────────────────────────────────────────────────────────────────────────────
function updateBar(characterId, health, maxHealth) {
  const pct     = Math.max(0, Math.min(100, (health / maxHealth) * 100));
  const prev    = _hpCache.get(characterId);
  const isHeal  = prev && health > prev.health;
  const delta   = prev ? Math.abs(health - prev.health) : 0;

  _hpCache.set(characterId, { health, maxHealth });

  if (characterId === _villainId) {
    _updateSingleBar('villain-fill', 'villain-hp', pct, health, maxHealth, isHeal);
  } else if (_heroRows.has(characterId)) {
    _updateSingleBar(`hero-fill-${characterId}`, `hero-hp-${characterId}`, pct, health, maxHealth, isHeal);
  }

  // spawn floating number near the bar
  if (delta > 0.05) {
    spawnFloatingNumber(characterId, delta, isHeal);
  }

  // track damage for end-screen
  if (!isHeal) _totalDmgDealt += delta;
}

function _updateSingleBar(fillId, hpId, pct, health, maxHealth, isHeal) {
  const fill = document.getElementById(fillId);
  const hp   = document.getElementById(hpId);
  if (!fill || !hp) return;

  fill.style.width = `${pct}%`;

  // color shift based on HP
  if (fill.classList.contains('villain-fill')) {
    if (pct > 60)      fill.style.background = 'linear-gradient(90deg,#8a2a2a,#c94c4c)';
    else if (pct > 30) fill.style.background = 'linear-gradient(90deg,#8a4a00,#e8962a)';
    else               fill.style.background = 'linear-gradient(90deg,#5a0000,#e74c3c)';
  } else {
    if (pct > 60)      fill.style.background = 'linear-gradient(90deg,#2a6a8a,#4ca8c9)';
    else if (pct > 30) fill.style.background = 'linear-gradient(90deg,#6a6a00,#c9c94c)';
    else               fill.style.background = 'linear-gradient(90deg,#5a0000,#e74c3c)';
  }

  hp.textContent = `${Math.ceil(health)} / ${maxHealth}`;

  // flash animation
  fill.classList.remove('flash-damage', 'flash-heal');
  void fill.offsetWidth; // force reflow
  fill.classList.add(isHeal ? 'flash-heal' : 'flash-damage');
}


// ─────────────────────────────────────────────────────────────────────────────
// 4.  FLOATING DAMAGE NUMBERS
// ─────────────────────────────────────────────────────────────────────────────
function spawnFloatingNumber(characterId, amount, isHeal) {
  // Attempt to find entity position in screen space
  let x = window.innerWidth  * 0.5;
  let y = window.innerHeight * 0.5;

  // Try to project via A-Frame entity
  const char = characters?.get?.(characterId);
  if (char) {
    const el = document.getElementById(char.entityId);
    if (el && el.object3D) {
      const scene    = document.querySelector('a-scene');
      const renderer = scene?.renderer;
      const camera   = scene?.camera;
      if (renderer && camera) {
        const pos = new THREE.Vector3();
        el.object3D.getWorldPosition(pos);
        pos.y += 2;
        const proj = pos.clone().project(camera);
        const canvas = renderer.domElement;
        x = (proj.x * 0.5 + 0.5) * canvas.clientWidth  + (Math.random() - 0.5) * 30;
        y = (1 - (proj.y * 0.5 + 0.5)) * canvas.clientHeight;
      }
    }
  }

  // Fallback: park near the health bar
  if (characterId === _villainId) {
    x = 170; y = window.innerHeight - 80;
  } else if (_heroRows.has(characterId)) {
    x = window.innerWidth - 170; y = window.innerHeight - 100;
  }

  const div = document.createElement('div');
  div.className = `dmg-float ${isHeal ? 'heal' : 'dmg'}`;
  div.textContent = (isHeal ? '+' : '-') + amount.toFixed(1);
  div.style.left = `${x}px`;
  div.style.top  = `${y}px`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 950);
}


// ─────────────────────────────────────────────────────────────────────────────
// 5.  KILL FEED
// ─────────────────────────────────────────────────────────────────────────────
const MAX_KF_ENTRIES = 5;

function pushKillFeed(characterId, role) {
  _totalKills++;

  const char  = characters?.get?.(characterId);
  const name  = char ? char.name : characterId;
  const icon  = role === 'villain' ? '💀' : '⚔️';
  const cls   = role === 'villain' ? 'villain-kill' : 'hero-kill';
  const verb  = role === 'villain' ? 'Villain Defeated' : `${name} Fallen`;

  const entry = document.createElement('div');
  entry.className = `kf-entry ${cls}`;
  entry.textContent = `${icon}  ${verb}`;
  hudKillfeed.prepend(entry);

  // cap entries
  const all = hudKillfeed.querySelectorAll('.kf-entry');
  if (all.length > MAX_KF_ENTRIES) {
    all[all.length - 1].remove();
  }

  // auto-fade after 5 s
  setTimeout(() => {
    entry.classList.add('fade-out');
    setTimeout(() => entry.remove(), 500);
  }, 5000);
}


// ─────────────────────────────────────────────────────────────────────────────
// 6.  COMBAT LOG
// ─────────────────────────────────────────────────────────────────────────────
const MAX_LOG_LINES = 8;

function logCombat(html) {
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = html;
  hudCombatlog.appendChild(line);

  // trim old lines
  const lines = hudCombatlog.querySelectorAll('.log-line');
  if (lines.length > MAX_LOG_LINES) lines[0].remove();
}


// ─────────────────────────────────────────────────────────────────────────────
// 7.  COOLDOWN HUD  (polling loop)
// ─────────────────────────────────────────────────────────────────────────────
let _cdRafId = null;
let _localCdId = null; // characterId for cooldown reads

function startCooldownLoop(charId) {
  _localCdId = charId;
  if (_cdRafId) cancelAnimationFrame(_cdRafId);

  function tick() {
    if (!_localCdId) return;
    ['magic','heal'].forEach(ab => {
      const el  = _cdEls[ab];
      if (!el) return;

      // Read remaining time from game.js
      const remaining = (typeof getCooldownRemaining === 'function')
        ? getCooldownRemaining(_localCdId, ab)
        : 0;
      const total     = CD_CONFIG[ab].duration;
      const frac      = total > 0 ? remaining / total : 0;

      el.sweep.style.transform = `scaleY(${frac})`;

      if (remaining > 0) {
        el.icon.classList.remove('ready');
        el.timer.textContent = (remaining / 1000).toFixed(1) + 's';
      } else {
        el.icon.classList.add('ready');
        el.timer.textContent = '';
      }
    });

    _cdRafId = requestAnimationFrame(tick);
  }

  tick();
}


// ─────────────────────────────────────────────────────────────────────────────
// 8.  BANNER HELPER
// ─────────────────────────────────────────────────────────────────────────────
let _bannerTimeout = null;
function showBanner(text, duration = 2800) {
  const el = document.getElementById('banner-text');
  if (!el) return;
  el.textContent = text;
  el.classList.add('visible');
  clearTimeout(_bannerTimeout);
  if (duration > 0) {
    _bannerTimeout = setTimeout(() => el.classList.remove('visible'), duration);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// 9.  GAME OVER SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function showGameOver(winner, duration) {
  const title = document.getElementById('go-title');
  const sub   = document.getElementById('go-sub');
  const dur   = document.getElementById('go-duration');

  const heroWon = winner === 'hero';
  title.textContent = heroWon ? 'Heroes Triumph' : 'Villain Victorious';
  title.className   = `go-title ${heroWon ? 'hero-win' : 'villain-win'}`;
  sub.textContent   = heroWon ? 'The forces of good prevail.' : 'Darkness consumes the arena.';

  const secs  = Math.floor(duration / 1000);
  const m     = Math.floor(secs / 60), s = secs % 60;
  dur.textContent = `Duration  ·  ${m}:${s.toString().padStart(2,'0')}`;

  document.getElementById('go-kills').textContent = _totalKills;
  document.getElementById('go-dmg').textContent   = Math.round(_totalDmgDealt);
  document.getElementById('go-time').textContent  = `${m}:${s.toString().padStart(2,'0')}`;

  hudGameover.classList.add('active');
}


// ─────────────────────────────────────────────────────────────────────────────
// 10.  GAME.JS EVENT HOOKS
// ─────────────────────────────────────────────────────────────────────────────
function wireGameEvents() {
  // Match started
  onMatchStarted(({ villainId, heroIds }) => {
    _matchStart = Date.now();
    _totalDmgDealt = 0;
    _totalKills = 0;

    setVillainIdentity(villainId);
    buildHeroRows(heroIds);
    showBanner('Battle!', 2000);

    // Determine local player for cooldown tracking
    // Heuristic: 'villain' id maps to the local villain entity
    _localCharId = villainId; // default; override below if you store local id differently
    startCooldownLoop(villainId);
  });

  // Health changed
  onHealthChanged(({ characterId, health, maxHealth }) => {
    updateBar(characterId, health, maxHealth);

    // Log significant hits
    const prev  = _hpCache.get(characterId);
    const delta = prev ? Math.abs(health - prev.health) : 0;
    const char  = characters?.get?.(characterId);
    const name  = char ? char.name : characterId;
    const isHeal = prev && health > prev.health;

    if (delta >= 1) {
      if (isHeal) {
        logCombat(`<span class="log-target">${name}</span> <span class="log-heal">+${delta.toFixed(1)} HP</span>`);
      } else {
        logCombat(`<span class="log-target">${name}</span> took <span class="log-dmg">${delta.toFixed(1)}</span> dmg`);
      }
    }
  });

  // Character defeated
  onCharacterDefeated(({ characterId, role }) => {
    pushKillFeed(characterId, role);

    // Grey out hero row if a hero dies
    if (_heroRows.has(characterId)) {
      const row = _heroRows.get(characterId);
      row.classList.add('defeated');
      const fill = document.getElementById(`hero-fill-${characterId}`);
      if (fill) fill.style.width = '0%';
      row.querySelector('.hud-name').insertAdjacentHTML('beforeend', '<span class="skull-badge">💀</span>');
    }

    const char = characters?.get?.(characterId);
    const name = char ? char.name : characterId;
    logCombat(`<span class="log-target">${name}</span> <span class="log-dmg">defeated</span>`);
  });

  // Melee fired
  onMeleeFired(({ attackerId, defenderId }) => {
    const a = characters?.get?.(attackerId);
    const d = characters?.get?.(defenderId);
    if (a && d) {
      logCombat(`<span class="log-attacker">${a.name}</span> ⚔ <span class="log-target">${d.name}</span>`);
    }
  });

  // Magic fired
  onMagicFired(({ attackerId }) => {
    const a = characters?.get?.(attackerId);
    if (a) {
      logCombat(`<span class="log-attacker">${a.name}</span> 🔮 cast magic`);
    }
  });

  // Heal performed
  onHealPerformed(({ healerId, healeeId }) => {
    const hr = characters?.get?.(healerId);
    const he = characters?.get?.(healeeId);
    if (hr && he) {
      logCombat(`<span class="log-attacker">${hr.name}</span> <span class="log-heal">healed</span> <span class="log-target">${he.name}</span>`);
    }
  });

  // State changed
  onStateChange(({ current }) => {
    if (current === STATES.BATTLE) {
      showBanner('Battle!', 2000);
    }
    if (current === STATES.GAME_OVER) {
      showBanner('Match Over', -1); // keep visible
    }
  });

  // Match over
  onMatchOver(({ winner, duration }) => {
    if (_cdRafId) cancelAnimationFrame(_cdRafId);
    const elapsed = duration ?? (Date.now() - (_matchStart || Date.now()));
    showGameOver(winner, elapsed);
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// 11.  PLAY AGAIN
// ─────────────────────────────────────────────────────────────────────────────
const UI = {
  onPlayAgain() {
    window.location.href = '/UI/menu.html';
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// 12.  BOOT  —  wait for DOM + A-Frame scene ready
// ─────────────────────────────────────────────────────────────────────────────
function bootUI() {
  buildHUD();
  wireGameEvents();
  showBanner('Entering the Arena…', 3000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootUI);
} else {
  bootUI();
}