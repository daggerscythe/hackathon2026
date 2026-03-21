import './style.css';

import { createViewer } from './core/viewer.js';

// Change this import path to switch which model file is shown.
import { createModel } from './models/scene.js';

function getContainer() {
  const el = document.querySelector('[data-viewer]');
  if (!(el instanceof HTMLElement)) {
    throw new Error('Missing viewer container (expected an element with data-viewer).');
  }
  return el;
}

async function run() {
  const container = getContainer();
  const viewer = createViewer({ container });

  const model = await createModel();
  viewer.setModel(model, { autoFrame: true });
  viewer.start();

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
