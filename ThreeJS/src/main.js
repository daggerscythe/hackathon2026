import './style.css';

import { createViewer } from './core/viewer.js';

// Change this import path to switch which model file is shown.
import { createModel } from './models/egg3.js';

function getContainer() {
  const el = document.querySelector('[data-viewer]');
  if (!(el instanceof HTMLElement)) {
    throw new Error('Missing viewer container (expected an element with data-viewer).');
  }
  return el;
}

function getPlayButton() {
  const el = document.querySelector('[data-play]');
  return el instanceof HTMLButtonElement ? el : null;
}

async function run() {
  const container = getContainer();
  const viewer = createViewer({ container });

  const model = await createModel();
  viewer.setModel(model, { autoFrame: true });
  viewer.start();

  const playBtn = getPlayButton();
  if (playBtn) {
    const animations = viewer.listAnimations();
    playBtn.disabled = animations.length === 0;

    playBtn.addEventListener('click', () => {
      // Plays the first clip by default.
      viewer.playAnimation(0);
    });
  }

  // Helpful for debugging in DevTools without adding UI.
  window.__viewer = viewer;
}

run().catch((err) => {
  console.error(err);

  const pre = document.createElement('pre');
  pre.style.whiteSpace = 'pre-wrap';
  pre.textContent = String(err?.stack ?? err);
  document.body.appendChild(pre);
});
