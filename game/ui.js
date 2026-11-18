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
  link.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@400;700&family=Share+Tech+Mono&display=swap';
  document.head.appendChild(link);

  const style = document.createElement('style');
  style.textContent = `
    /* ── CSS vars — mirrors menu.css palette exactly ─────────────────────── */
    :root {
      --gold:        #c9a84c;
      --gold-light:  #e8c96a;
      --gold-dim:    rgba(201,168,76,0.55);
      --gold-solid:  #9a7a30;
      --hero:        #4ca8c9;
      --hero-dim:    #2a6a8a;
      --villain:     #c94c4c;
      --villain-dim: #8a2a2a;
      --heal:        #4cc94c;
      --bg-deep:     rgba(4, 6, 12, 0.92);
      --bg-panel:    rgba(8, 12, 24, 0.82);
      --white:       #f0ece4;
      --white-dim:   rgba(240,236,228,0.6);
      --white-faint: rgba(240,236,228,0.25);
      --red:         #e74c3c;
      --orange:      #e8962a;
      --green:       #4cc94c;
      --dark:        #0a0c0f;
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

    /* ═══════════════════════════════════════════════════════════════════════
       VILLAIN PANEL — bottom-left
    ═══════════════════════════════════════════════════════════════════════ */
    #hud-villain {
      position: absolute;
      bottom: 28px;
      left: 28px;
      display: flex;
      flex-direction: column;
      gap: 7px;
      width: 300px;
      /* Solid dark backing so it reads over any background */
      background: linear-gradient(135deg, rgba(4,6,12,0.9) 0%, rgba(8,10,18,0.82) 100%);
      border: 1px solid rgba(201,168,76,0.2);
      border-left: 2px solid var(--gold);
      padding: 14px 16px 14px 20px;
    }

    /* Gold corner accent top-right */
    #hud-villain::after {
      content: '';
      position: absolute;
      top: -1px; right: -1px;
      width: 18px; height: 18px;
      border-top: 1px solid var(--gold);
      border-right: 1px solid var(--gold);
      opacity: 0.6;
    }

    .hud-role-label {
      font-size: 0.5rem;
      letter-spacing: 5px;
      text-transform: uppercase;
      color: rgba(201,168,76,0.7);
    }

    .hud-name {
      font-family: var(--font-head);
      font-size: 1rem;
      letter-spacing: 3px;
      color: var(--gold-light);
      text-shadow:
        0 0 28px rgba(201,168,76,0.7),
        0 2px 6px rgba(0,0,0,0.95);
    }

    /* Bar track */
    .hud-bar-track {
      position: relative;
      width: 100%;
      height: 8px;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.12);
      overflow: visible;
    }

    /* End-cap tick */
    .hud-bar-track::after {
      content: '';
      position: absolute;
      right: 0; top: -4px;
      width: 1px; height: 16px;
      background: var(--gold);
      opacity: 0.5;
    }

    .hud-bar-fill {
      position: absolute;
      inset: 0;
      height: 100%;
      transition: width 0.38s cubic-bezier(.4,0,.2,1), background 0.38s;
    }

    .hud-bar-fill.villain-fill {
      background: linear-gradient(90deg, var(--villain-dim), var(--villain));
      box-shadow: 0 0 10px rgba(201,76,76,0.55), 0 0 2px rgba(201,76,76,0.8);
    }

    .hud-bar-fill.hero-fill {
      background: linear-gradient(90deg, var(--hero-dim), var(--hero));
      box-shadow: 0 0 10px rgba(76,168,201,0.5), 0 0 2px rgba(76,168,201,0.8);
    }

    .hud-bar-fill.flash-damage {
      animation: flashDmg 0.28s ease;
    }
    @keyframes flashDmg {
      0%   { filter: brightness(3) saturate(1.5); }
      100% { filter: brightness(1) saturate(1); }
    }

    .hud-bar-fill.flash-heal {
      animation: flashHeal 0.45s ease;
    }
    @keyframes flashHeal {
      0%,45% { box-shadow: 0 0 14px 5px rgba(76,201,76,0.7); }
      100%   { box-shadow: none; }
    }

    .hud-hp-text {
      font-family: var(--font-mono);
      font-size: 0.62rem;
      color: rgba(240,236,228,0.55);
      letter-spacing: 2px;
      margin-top: 2px;
    }

    /* Class name badge shown under the character name */
    .hud-class-name {
      font-family: var(--font-label);
      font-size: 0.48rem;
      letter-spacing: 4px;
      text-transform: uppercase;
      color: rgba(201,168,76,0.6);
      margin-top: -2px;
    }

    /* Ability pips row — shows which actions a class can use */
    .hud-abilities {
      display: flex;
      gap: 6px;
      margin-top: 2px;
    }

    .hud-ability-pip {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 7px 2px 5px;
      border: 1px solid rgba(201,168,76,0.2);
      background: rgba(4,6,12,0.5);
      font-family: var(--font-mono);
      font-size: 0.44rem;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: rgba(240,236,228,0.45);
      white-space: nowrap;
    }

    .hud-ability-pip.pip-active { border-color: rgba(201,168,76,0.5); color: rgba(240,236,228,0.85); }
    .hud-ability-pip.pip-active.pip-melee { border-color: rgba(232,150,42,0.6);  color: #e8962a; }
    .hud-ability-pip.pip-active.pip-magic { border-color: rgba(150,100,220,0.6); color: #c09aee; }
    .hud-ability-pip.pip-active.pip-heal  { border-color: rgba(76,201,76,0.55);  color: #60d060; }
    .hud-ability-pip.pip-inactive { opacity: 0.28; filter: grayscale(1); }

    /* cd-slot dimmed state for abilities a class can't use */
    .cd-slot.cd-unavailable {
      opacity: 0.22;
      filter: grayscale(1);
      pointer-events: none;
    }
    .cd-slot.cd-unavailable .cd-icon {
      border-color: rgba(255,255,255,0.08);
      box-shadow: none;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       HERO PANEL — bottom-right
    ═══════════════════════════════════════════════════════════════════════ */
    #hud-heroes {
      position: absolute;
      bottom: 28px;
      right: 28px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      width: 260px;
      align-items: flex-end;
      background: linear-gradient(225deg, rgba(4,6,12,0.9) 0%, rgba(8,10,18,0.82) 100%);
      border: 1px solid rgba(201,168,76,0.2);
      border-right: 2px solid var(--gold);
      padding: 14px 20px 14px 16px;
    }

    /* Gold corner accent top-left */
    #hud-heroes::before {
      content: '';
      position: absolute;
      top: -1px; left: -1px;
      width: 18px; height: 18px;
      border-top: 1px solid var(--gold);
      border-left: 1px solid var(--gold);
      opacity: 0.6;
    }

    .hero-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
      align-items: flex-end;
      transition: opacity 0.45s, filter 0.45s;
    }

    .hero-row.defeated {
      opacity: 0.22;
      filter: grayscale(1) brightness(0.5);
    }

    .hero-row .hud-name {
      font-size: 0.78rem;
      text-align: right;
    }

    .hero-role-label {
      font-size: 0.44rem;
      letter-spacing: 5px;
      text-transform: uppercase;
      color: rgba(201,168,76,0.7);
    }

    .skull-badge {
      font-size: 0.8rem;
      margin-left: 5px;
      animation: popIn 0.28s cubic-bezier(.4,0,.2,1);
    }
    @keyframes popIn {
      0%   { transform: scale(0) rotate(-20deg); opacity: 0; }
      65%  { transform: scale(1.35) rotate(5deg); }
      100% { transform: scale(1) rotate(0); opacity: 1; }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       COOLDOWN BAR — bottom-center
    ═══════════════════════════════════════════════════════════════════════ */
    #hud-cooldowns {
      position: absolute;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 10px;
      align-items: flex-end;
      background: rgba(4,6,12,0.82);
      border: 1px solid rgba(201,168,76,0.18);
      padding: 10px 14px 8px;
    }

    .cd-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      width: 62px;
    }

    .cd-icon {
      width: 52px;
      height: 52px;
      border: 1px solid rgba(201,168,76,0.3);
      background: rgba(4,6,12,0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.4rem;
      position: relative;
      overflow: hidden;
      transition: border-color 0.25s, box-shadow 0.25s;
    }

    /* Corner ornaments */
    .cd-icon::before,
    .cd-icon::after {
      content: '';
      position: absolute;
      width: 7px; height: 7px;
      border-color: var(--gold);
      border-style: solid;
      opacity: 0.5;
      z-index: 2;
    }
    .cd-icon::before { top: 2px; left: 2px;  border-width: 1px 0 0 1px; }
    .cd-icon::after  { bottom: 2px; right: 2px; border-width: 0 1px 1px 0; }

    .cd-icon.ready {
      border-color: rgba(201,168,76,0.65);
      box-shadow: 0 0 16px rgba(201,168,76,0.4), inset 0 0 10px rgba(201,168,76,0.08);
    }
    .cd-icon.ready::before,
    .cd-icon.ready::after { opacity: 1; }

    .cd-sweep {
      position: absolute;
      inset: 0;
      background: rgba(4,6,12,0.78);
      transform-origin: bottom center;
      transition: transform 0.1s linear;
    }

    .cd-label {
      font-family: var(--font-label);
      font-size: 0.46rem;
      color: rgba(240,236,228,0.45);
      letter-spacing: 3px;
      text-transform: uppercase;
    }

    .cd-timer {
      font-family: var(--font-mono);
      font-size: 0.56rem;
      color: var(--gold);
      min-height: 0.7rem;
      text-align: center;
      letter-spacing: 1px;
    }

    .cd-key {
      position: absolute;
      bottom: 3px;
      right: 4px;
      font-family: var(--font-mono);
      font-size: 0.42rem;
      color: rgba(240,236,228,0.38);
      z-index: 3;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       KILL FEED — top-right
    ═══════════════════════════════════════════════════════════════════════ */
    #hud-killfeed {
      position: absolute;
      top: 28px;
      right: 28px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: flex-end;
      max-width: 300px;
    }

    .kf-entry {
      background: rgba(4,6,12,0.92);
      border-right: 2px solid var(--gold);
      padding: 6px 14px 6px 16px;
      font-family: var(--font-label);
      font-size: 0.58rem;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--white-dim);
      animation: kfSlide 0.22s ease;
      white-space: nowrap;
    }

    .kf-entry.villain-kill { border-color: var(--villain); color: rgba(230,100,100,0.95); }
    .kf-entry.hero-kill    { border-color: var(--hero);    color: rgba(100,190,220,0.95); }

    @keyframes kfSlide {
      from { opacity: 0; transform: translateX(18px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .kf-entry.fade-out {
      animation: kfFade 0.45s ease forwards;
    }
    @keyframes kfFade {
      to { opacity: 0; transform: translateX(14px); }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       COMBAT LOG — left panel mid
    ═══════════════════════════════════════════════════════════════════════ */
    #hud-combatlog {
      position: absolute;
      left: 28px;
      top: 50%;
      transform: translateY(-50%);
      width: 240px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      max-height: 200px;
      overflow: hidden;
      background: rgba(4,6,12,0.82);
      border: 1px solid rgba(201,168,76,0.15);
      border-left: 2px solid rgba(201,168,76,0.5);
      padding: 12px 14px;
    }

    .log-header {
      font-size: 0.46rem;
      letter-spacing: 6px;
      text-transform: uppercase;
      color: rgba(201,168,76,0.8);
      margin-bottom: 8px;
      padding-bottom: 5px;
      border-bottom: 1px solid rgba(201,168,76,0.22);
      position: relative;
    }

    .log-header::after {
      content: '◆';
      position: absolute;
      right: 0; bottom: -5px;
      font-size: 0.35rem;
      color: var(--gold);
      opacity: 0.6;
    }

    .log-line {
      font-family: var(--font-mono);
      font-size: 0.56rem;
      color: rgba(240,236,228,0.55);
      letter-spacing: 0.5px;
      line-height: 1.55;
      animation: logSlide 0.18s ease;
    }
    @keyframes logSlide {
      from { opacity: 0; transform: translateX(-6px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .log-line .log-attacker { color: var(--gold-light); }
    .log-line .log-dmg      { color: #f06060; }
    .log-line .log-heal     { color: #60d060; }
    .log-line .log-target   { color: rgba(240,236,228,0.8); }

    /* ═══════════════════════════════════════════════════════════════════════
       STATE BANNER — center top
    ═══════════════════════════════════════════════════════════════════════ */
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
      font-size: 1.15rem;
      letter-spacing: 10px;
      text-transform: uppercase;
      color: var(--gold-light);
      text-shadow:
        0 0 32px rgba(201,168,76,0.8),
        0 0 70px rgba(201,168,76,0.3),
        0 2px 8px rgba(0,0,0,1);
      padding: 16px 40px;
      background: none;
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.38s;
      display: inline-block;
    }
    .banner-text.visible { }

    /* ═══════════════════════════════════════════════════════════════════════
       GAME OVER OVERLAY — full cinematic screen, menu-grade typography
    ═══════════════════════════════════════════════════════════════════════ */
    #hud-gameover {
      position: fixed;
      inset: 0;
      /* Same layered atmosphere as menu body background */
      background:
        radial-gradient(ellipse 60% 55% at 72% 18%, rgba(220,160,60,0) 0%, transparent 65%),
        rgba(4,6,12,0);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 18px;
      z-index: 600;
      pointer-events: none;
      transition: background 0.9s;
    }

    #hud-gameover.active {
      background:
        radial-gradient(ellipse 60% 55% at 72% 18%, rgba(220,160,60,0.12) 0%, transparent 65%),
        rgba(4,6,12,0.88);
      pointer-events: all;
    }

    /* Thin vertical accent left of game-over content */
    #hud-gameover.active::before {
      content: '';
      position: absolute;
      left: calc(50% - 180px);
      top: 28%;
      height: 44%;
      width: 1px;
      background: linear-gradient(180deg, transparent, var(--gold), transparent);
      opacity: 0.5;
    }

    .go-title {
      font-family: var(--font-head);
      font-size: clamp(2rem, 5vw, 3.6rem);
      letter-spacing: 10px;
      text-transform: uppercase;
      opacity: 0;
      transform: translateY(28px);
      transition: opacity 0.65s 0.3s, transform 0.65s 0.3s;
    }

    .go-title.hero-win {
      color: var(--gold-light);
      text-shadow:
        0 0 40px rgba(232,201,106,0.6),
        0 0 80px rgba(232,201,106,0.2);
    }
    .go-title.villain-win {
      color: var(--villain);
      text-shadow: 0 0 50px rgba(201,76,76,0.65);
    }

    #hud-gameover.active .go-title {
      opacity: 1;
      transform: translateY(0);
    }

    .go-sub {
      font-family: var(--font-label);
      font-size: 0.66rem;
      letter-spacing: 6px;
      color: var(--white-faint);
      text-transform: uppercase;
      opacity: 0;
      transition: opacity 0.6s 0.7s;
    }
    #hud-gameover.active .go-sub { opacity: 1; }

    .go-duration {
      font-family: var(--font-mono);
      font-size: 0.6rem;
      color: var(--gold-dim);
      letter-spacing: 5px;
      opacity: 0;
      transition: opacity 0.4s 1s;
    }
    #hud-gameover.active .go-duration { opacity: 1; }

    /* Horizontal gold rule — like menu's gradient accent */
    .go-rule {
      width: 140px;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--gold), transparent);
      opacity: 0.55;
    }

    .go-stats {
      display: flex;
      gap: 52px;
      opacity: 0;
      transition: opacity 0.4s 1.1s;
      margin-top: 10px;
    }
    #hud-gameover.active .go-stats { opacity: 1; }

    .go-stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
    }

    .go-stat-val {
      font-family: var(--font-head);
      font-size: 1.55rem;
      color: var(--gold-light);
      text-shadow: 0 0 24px rgba(201,168,76,0.4);
    }

    .go-stat-label {
      font-size: 0.42rem;
      letter-spacing: 5px;
      text-transform: uppercase;
      color: var(--white-faint);
    }

    /* Return button — styled exactly like menu's .menu-btn */
    .go-btn {
      position: relative;
      padding: 10px 0;
      font-family: var(--font-label);
      font-size: 0.88rem;
      font-weight: 600;
      letter-spacing: 3px;
      text-transform: uppercase;
      background: transparent;
      border: none;
      color: var(--white-dim);
      cursor: pointer;
      text-align: left;
      min-width: 220px;
      transition: color 0.2s ease, letter-spacing 0.2s ease;
      pointer-events: all;
      opacity: 0;
      /* two transitions: fade-in delay + hover effects */
      animation: none;
    }

    #hud-gameover.active .go-btn {
      animation: goFadeIn 0.4s 1.4s ease both;
    }
    @keyframes goFadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* Left accent bar (menu ::before) */
    .go-btn::before {
      content: '';
      position: absolute;
      left: -14px; top: 50%;
      transform: translateY(-50%) scaleY(0);
      width: 2px; height: 60%;
      background: var(--gold);
      transition: transform 0.18s ease;
      transform-origin: center;
    }

    /* Underline (menu ::after) */
    .go-btn::after {
      content: '';
      position: absolute;
      bottom: 6px; left: 0;
      width: 0; height: 1px;
      background: linear-gradient(90deg, var(--gold), transparent);
      transition: width 0.22s ease;
    }

    .go-btn:hover {
      color: var(--gold-light);
      letter-spacing: 4px;
      text-shadow: 0 0 20px rgba(201,168,76,0.45);
    }
    .go-btn:hover::before { transform: translateY(-50%) scaleY(1); }
    .go-btn:hover::after  { width: 100%; }
    .go-btn:active {
      color: var(--white);
      transform: translateX(2px);
    }

    /* ═══════════════════════════════════════════════════════════════════════
       FLOATING DAMAGE NUMBERS
    ═══════════════════════════════════════════════════════════════════════ */
    .dmg-float {
      position: fixed;
      font-family: var(--font-head);
      font-size: 0.95rem;
      font-weight: 700;
      pointer-events: none;
      z-index: 550;
      animation: floatUp 0.95s ease forwards;
      text-shadow: 0 2px 10px rgba(0,0,0,0.9);
    }
    .dmg-float.dmg  { color: var(--red); }
    .dmg-float.heal { color: var(--green); font-size: 0.82rem; }
    @keyframes floatUp {
      0%   { opacity: 1;   transform: translateY(0) scale(1); }
      15%  { opacity: 1;   transform: translateY(-8px) scale(1.12); }
      100% { opacity: 0;   transform: translateY(-54px) scale(0.9); }
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
// `cooldown` is the game.js COOLDOWNS key each HUD slot reads from
const CD_CONFIG = {
  magic:     { label: 'Magic',      key: 'LMB', icon: '🔮', cooldown: 'magic' },
  heal_ally: { label: 'Heal Ally',  key: 'LMB', icon: '❤️', cooldown: 'heal'  },
  heal_self: { label: 'Heal Self',  key: 'RMB', icon: '💚', cooldown: 'heal'  },
  melee:     { label: 'Melee',      key: 'LMB', icon: '⚔️', cooldown: 'melee' },
};

const _cdTimers  = {};   // ability → { lastUsed, intervalId }
const _cdEls     = {};   // ability → { sweep, timer }

// Round timer — heroes win if the villain hasn't finished them by 0:00
const ROUND_SECONDS = 180;
let timeLeft = ROUND_SECONDS;
let _timerInterval = null;

function startRoundTimer() {
  clearInterval(_timerInterval);
  timeLeft = ROUND_SECONDS;
  const interval = _timerInterval = setInterval(() => {
    if (getState() !== STATES.BATTLE) { clearInterval(interval); return; }
    timeLeft--;

    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    const timerEl = document.getElementById('round-timer');
    if (!timerEl) return;

    timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    timerEl.style.color = timeLeft <= 30 ? '#e74c3c' : 'white';

    if (timeLeft <= 0) {
      clearInterval(interval);
      timerEl.textContent = '0:00';
      endMatch('hero');
    }
  }, 1000);
}

function buildHUD() {
  // Root
  hudRoot = document.createElement('div');
  hudRoot.id = 'hud-root';
  document.body.appendChild(hudRoot);

  // ── Round timer
  const timerEl = document.createElement('div');
  timerEl.id = 'round-timer';
  timerEl.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    color: white;
    font-size: 28px;
    font-family: 'Courier New', monospace;
    text-shadow: 0 0 8px #000;
    z-index: 999;
    pointer-events: none;
  `;
  timerEl.textContent = '3:00';
  document.body.appendChild(timerEl);

  // ── Crosshair
  const crosshair = document.createElement('div');
  crosshair.id = 'crosshair';
  crosshair.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 999;
  `;
  crosshair.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <!-- top line -->
      <line x1="12" y1="2"  x2="12" y2="8"  stroke="white" stroke-width="1.5" stroke-linecap="round"/>
      <!-- bottom line -->
      <line x1="12" y1="16" x2="12" y2="22" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
      <!-- left line -->
      <line x1="2"  y1="12" x2="8"  y2="12" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
      <!-- right line -->
      <line x1="16" y1="12" x2="22" y2="12" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
      <!-- center dot -->
      <circle cx="12" cy="12" r="1.2" fill="white"/>
    </svg>
  `;
  document.body.appendChild(crosshair);

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
    <div class="hud-class-name" id="villain-class"></div>
    <div class="hud-abilities" id="villain-abilities"></div>
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

  // ── Cooldown bar — built later once we know the player's class
  hudCooldowns = document.createElement('div');
  hudCooldowns.id = 'hud-cooldowns';
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

function buildCooldownSlots(chosenClass) {
  hudCooldowns.innerHTML = '';
  Object.keys(_cdEls).forEach(k => delete _cdEls[k]);

  const magicClasses   = ['mage', 'villain_mage'];
  const supportClasses = ['support'];

  let abilities = [];

  if (magicClasses.includes(chosenClass)) {
    // mage: only magic on LMB
    abilities = ['magic'];
  } else if (supportClasses.includes(chosenClass)) {
    abilities = ['heal_ally', 'heal_self'];
  } else {
    // tank, dps, brute, agile: only melee on LMB
    abilities = ['melee'];
  }

  abilities.forEach(ab => {
    const cfg  = CD_CONFIG[ab];
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

    // seed cache from real character data
    const hp = char ? (char.health ?? char.maxHealth) : 100;
    const maxHp = char ? char.maxHealth : 100;
    _hpCache.set(id, { health: hp, maxHealth: maxHp });

    // set real starting values on the bar
    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    const fillEl = row.querySelector(`#hero-fill-${id}`);
    const hpEl   = row.querySelector(`#hero-hp-${id}`);
    if (fillEl) fillEl.style.width = pct + '%';
    if (hpEl)   hpEl.textContent   = Math.ceil(hp) + ' / ' + maxHp;
  });
}

// Maps each class to the abilities it can use
const CLASS_ABILITIES = {
  tank:         { melee: true,  magic: false, heal: false },
  dps:          { melee: true,  magic: false, heal: false },
  support:      { melee: false, magic: false, heal: true  },
  mage:         { melee: false, magic: true,  heal: false },
  brute:        { melee: true,  magic: false, heal: false },
  agile:        { melee: true,  magic: false, heal: false },
  villain_mage: { melee: false, magic: true,  heal: false },
};

const ABILITY_DISPLAY = [
  { key: 'melee', icon: '\u2694', label: 'Melee', mod: 'pip-melee' },
  { key: 'magic', icon: '🔮', label: 'Magic', mod: 'pip-magic' },
  { key: 'heal',  icon: '💚', label: 'Heal',  mod: 'pip-heal'  },
];

function buildAbilityPips(containerId, chosenClass) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const abilities = CLASS_ABILITIES[chosenClass] ?? {};
  container.innerHTML = '';
  ABILITY_DISPLAY.forEach(({ key, icon, label, mod }) => {
    const active = !!abilities[key];
    const pip = document.createElement('div');
    pip.className = 'hud-ability-pip ' + (active ? 'pip-active ' + mod : 'pip-inactive');
    pip.textContent = icon + ' ' + label;
    container.appendChild(pip);
  });
}

function refreshCooldownSlots(chosenClass) {
  const abilities = CLASS_ABILITIES[chosenClass] ?? {};
  const meleeSlot = _cdEls['melee']?.icon?.closest('.cd-slot');
  const magicSlot = _cdEls['magic']?.icon?.closest('.cd-slot');
  const healSlot  = _cdEls['heal']?.icon?.closest('.cd-slot');
  if (meleeSlot) meleeSlot.classList.toggle('cd-unavailable', !abilities.melee);
  if (magicSlot) magicSlot.classList.toggle('cd-unavailable', !abilities.magic);
  if (healSlot)  healSlot.classList.toggle('cd-unavailable',  !abilities.heal);
}

function setVillainIdentity(id) {
  _villainId = id;
  const char = characters.get(id);
  if (!char) return;

  document.getElementById('villain-name').textContent = char.name;

  const classEl = document.getElementById('villain-class');
  if (classEl) classEl.textContent = char.chosenClass ?? '';

  buildAbilityPips('villain-abilities', char.chosenClass);

  const hp = char.health ?? char.maxHealth;
  _hpCache.set(id, { health: hp, maxHealth: char.maxHealth });

  const pct = Math.max(0, Math.min(100, (hp / char.maxHealth) * 100));
  const fill = document.getElementById('villain-fill');
  const hpEl = document.getElementById('villain-hp');
  if (fill) fill.style.width = pct + '%';
  if (hpEl) hpEl.textContent = Math.ceil(hp) + ' / ' + char.maxHealth;

  refreshCooldownSlots(char.chosenClass);
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
  // Fallback: park near the matching health bar
  let x = window.innerWidth  * 0.5;
  let y = window.innerHeight * 0.5;
  if (characterId === _villainId)      { x = 170; y = window.innerHeight - 80; }
  else if (_heroRows.has(characterId)) { x = window.innerWidth - 170; y = window.innerHeight - 100; }

  // Try to project via A-Frame entity
  const char = characters?.get?.(characterId);
  if (char && char.id !== LOCAL_ID) {
    const el = document.getElementById(char.entityId);
    if (el && el.object3D && el.object3D.visible) {
      const scene    = document.querySelector('a-scene');
      const renderer = scene?.renderer;
      const camera   = scene?.camera;
      if (renderer && camera) {
        const pos = new THREE.Vector3();
        el.object3D.getWorldPosition(pos);
        pos.y += 2;
        const proj = pos.project(camera);
        if (proj.z < 1) { // in front of the camera
          const canvas = renderer.domElement;
          x = (proj.x * 0.5 + 0.5) * canvas.clientWidth  + (Math.random() - 0.5) * 30;
          y = (1 - (proj.y * 0.5 + 0.5)) * canvas.clientHeight;
        }
      }
    }
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
    Object.entries(_cdEls).forEach(([ab, el]) => {
      const cdKey     = CD_CONFIG[ab].cooldown;
      const remaining = getCooldownRemaining(_localCdId, cdKey);
      const total     = cooldownDuration(_localCdId, cdKey);
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
    startRoundTimer();

    const me = getLocalCharacter();
    buildCooldownSlots(me?.chosenClass);
    _localCharId = LOCAL_ID;
    startCooldownLoop(_localCharId);
  });

  // Health changed
  onHealthChanged(({ characterId, health, maxHealth, sourceId, isDamage }) => {
    // end-screen stat: damage dealt by the local player only
    if (isDamage && sourceId === LOCAL_ID) {
      const before = _hpCache.get(characterId)?.health ?? health;
      _totalDmgDealt += Math.max(0, before - health);
    }
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
  onCharacterDefeated(({ characterId, role, killerId }) => {
    if (killerId === LOCAL_ID) _totalKills++;
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
    if (current === STATES.GAME_OVER) {
      showBanner('Match Over', -1); // keep visible
    }
  });

  // Match over
  onMatchOver(({ winner, duration }) => {
    if (_cdRafId) cancelAnimationFrame(_cdRafId);
    clearInterval(_timerInterval);
    if (document.pointerLockElement) document.exitPointerLock();
    const elapsed = duration ?? (Date.now() - (_matchStart || Date.now()));
    showGameOver(winner, elapsed);
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// 11.  PLAY AGAIN
// ─────────────────────────────────────────────────────────────────────────────
const UI = {
  onPlayAgain() {
    window.location.href = 'UI/menu.html';
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