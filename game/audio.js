// =================================================
// AUDIO — sound registry, playback, and game-event hooks
// Loaded by the menu pages and the arena. Event hooks only attach on
// pages where game.js is present.
// =================================================

// resolve asset paths relative to this script, so it works from any page
const AUDIO_BASE = new URL('../assets/sounds/', document.currentScript.src).href;

// All tracks are from Pixabay (Pixabay Content License)
const SOUNDS = {
    heal:            'healing.mp3',
    sword_sound:     'sword_sound_effect.mp3',
    death:           'scream.mp3',
    fire_ball:       'fireball.mp3',
    victory_hero:    'victory-hero.mp3',
    victory_villain: 'victory-villian.mp3',
    game_theme:      'bg_music.mp3',
    battle_theme:    'battle-dun-dun.mp3',
};

const audioCache = {};

function loadSound(key) {
    if (audioCache[key]) return audioCache[key];
    const file = SOUNDS[key];
    if (!file) return null;
    const audio = new Audio(AUDIO_BASE + encodeURIComponent(file));
    audio.preload = 'auto';
    audioCache[key] = audio;
    return audio;
}

/**
 * Play a registered sound. Restarts it if already playing.
 * @param {string}  key
 * @param {number}  [volume=1]
 * @param {boolean} [loop=false]
 * @param {boolean} [keepTime=false] - resume from the current position instead of restarting
 */
function playSound(key, volume = 1, loop = false, keepTime = false) {
    const audio = loadSound(key);
    if (!audio) return;
    audio.volume = Math.min(1, Math.max(0, volume));
    if (!keepTime) audio.currentTime = 0;
    audio.loop = loop;
    // browsers block audio until the first user gesture — ignore that rejection
    audio.play().catch(() => {});
}

function stopSound(key) {
    const audio = audioCache[key];
    if (audio) audio.pause();
}

// ── Arena-only event wiring ──────────────────────────────────────────────
if (typeof GAME_EVENTS !== 'undefined') {
    ['heal', 'sword_sound', 'death', 'fire_ball', 'victory_hero', 'victory_villain', 'battle_theme']
        .forEach(loadSound);

    // you healed someone, or someone healed you
    onHealPerformed(({ healerId, healeeId }) => {
        if (healerId === LOCAL_ID || healeeId === LOCAL_ID) playSound('heal', 0.7);
    });

    onCharacterDefeated(({ characterId }) => {
        if (characterId === LOCAL_ID) playSound('death', 0.6);
    });

    onMagicFired(({ attackerId }) => {
        if (attackerId === LOCAL_ID) playSound('fire_ball', 0.7);
    });

    onMeleeSwing(({ attackerId }) => {
        if (attackerId === LOCAL_ID) playSound('sword_sound', 0.7);
    });

    onMatchStarted(() => {
        playSound('battle_theme', 0.4, true);
    });

    onMatchOver(({ winner }) => {
        stopSound('battle_theme');
        playSound(winner === 'hero' ? 'victory_hero' : 'victory_villain', 0.8);
    });
}
