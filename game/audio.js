// =================================================
// Depends on game.js
// Load after game.js in index.html:
// =================================================

// holds sounds
const SOUNDS = {
    heal: 'assets/sounds/skyrim-healing.mp3',
};

// audio cache
const audioCache = {};

function loadSound(key) {
    console.log("i am loading sound here")
    if (audioCache[key]) return audioCache[key];
    const path = SOUNDS[key];
    if (!path) {
        console.warn(`[Audio] No path registered for sound key: "${key}"`);
        return null;
    }
    const audio = new Audio(path);
    audio.preload = 'auto';
    audioCache[key] = audio;
    return audio;
}

// Pre-load all registered sounds on script parse.
Object.keys(SOUNDS).forEach(loadSound);

// ─── Playback Helper ──────────────────────────────
/**
 * Play a registered sound by key.
 * Resets currentTime so rapid re-triggers always play from the start.
 * @param {string} key - key from the SOUNDS registry
 * @param {number} [volume=1] - 0.0 to 1.0
 */
function playSound(key, volume = 1) {
    console.log("i am playing the sound here")
    const audio = loadSound(key);
    if (!audio) return;
    audio.volume = Math.min(1, Math.max(0, volume));
    audio.currentTime = 0;
    audio.play().catch(err => {
        // Browsers block autoplay until the user interacts with the page.
        // This is a silent fallback — the first keypress (H) counts as interaction,
        // so in practice this only fires if somehow triggered before any user input.
        console.warn(`[Audio] Playback blocked for "${key}":`, err.message);
    });
}

// for ensuring 
function getLocalCharacterId() {
    console.log("finding data of character")
    const localEl = document.querySelector('[data-character-id][data-role]');
    // The local player entity carries both attributes; remote entities only get
    // data-character-id injected by network.js after the fact.
    // Fallback: look for the element whose player-controller has isLocal=true.
    if (localEl) return localEl.dataset.characterId;

    // Fallback path: find via A-Frame component if DOM attr isn't ready yet.
    const controllerEl = document.querySelector('[player-controller]');
    if (controllerEl) {
        const comp = controllerEl.components['player-controller'];
        if (comp && comp.data.isLocal) return comp.data.characterId;
    }

    return null;
}

// ─── Event Wiring ─────────────────────────────────
// Wait for the DOM so A-Frame and game.js are fully initialised.
document.addEventListener('DOMContentLoaded', () => {

    // Listen for every heal event emitted by game.js.
    // Only play audio when the healer is the local player —
    // this keeps audio purely client-side regardless of how many
    // characters game.js is tracking across the network.
    onHealPerformed(({ healerId }) => {
        console.log("on heal performed")
        const localId = getLocalCharacterId();
        if (!localId) return;           // scene not ready yet
        if (healerId !== localId) return; // someone else healed, not our sound to play

        playSound('heal');
    });

});