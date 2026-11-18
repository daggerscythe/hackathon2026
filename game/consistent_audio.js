// =================================================
// Menu theme that keeps playing across the menu pages.
// Saves its position in sessionStorage so each page resumes where the
// previous one left off. Depends on audio.js.
// =================================================

function tryStartTheme() {
    const audio = loadSound('game_theme');
    if (!audio.paused) return;
    audio.currentTime = parseFloat(sessionStorage.getItem('theme_time') || '0');
    playSound('game_theme', 0.6, true, true);
    sessionStorage.setItem('theme_started', 'true');
}

function saveThemeTime() {
    const audio = audioCache['game_theme'];
    if (audio && !audio.paused) sessionStorage.setItem('theme_time', audio.currentTime);
}

setInterval(saveThemeTime, 500);
window.addEventListener('beforeunload', saveThemeTime);

// Pages call tryStartTheme on the first click / keypress (browsers block
// audio before a user gesture).
