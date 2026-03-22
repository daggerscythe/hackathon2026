let themeStarted = sessionStorage.getItem('theme_started') === 'true';

function tryStartTheme() {
    const audio = loadSound('game_theme');

    const savedTime = parseFloat(sessionStorage.getItem('theme_time') || '0');

    audio.currentTime = savedTime;

    playSound('game_theme', 0.6, true, true); // preserve time

    themeStarted = true;
    sessionStorage.setItem('theme_started', 'true');
}

// Save progress frequently
setInterval(() => {
    const audio = loadSound('game_theme');
    if (audio && !audio.paused) {
        sessionStorage.setItem('theme_time', audio.currentTime);
    }
}, 500);

// Save on page leave
window.addEventListener('beforeunload', () => {
    const audio = loadSound('game_theme');
    if (audio) {
        sessionStorage.setItem('theme_time', audio.currentTime);
    }
});
