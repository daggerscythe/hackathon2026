import './style.css';

import { createViewer } from './core/viewer.js';

const modelModules = import.meta.glob('./models/*.js');

function getModelNames() {
  return Object.keys(modelModules)
    .map((p) => p.replace('./models/', '').replace(/\.js$/, ''))
    .sort();
}

async function loadModel(name) {
  const path = `./models/${name}.js`;
  const loader = modelModules[path];
  if (!loader) {
    const valid = getModelNames().join(', ');
    throw new Error(`Unknown model "${name}". Valid: ${valid}`);
  }

  const mod = await loader();
  const createModel = mod.createModel ?? mod.default;
  if (typeof createModel !== 'function') {
    throw new Error(`Model "${name}" must export createModel() (or default export a function).`);
  }

  return createModel();
}

function getModelFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('model');
}

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

  const available = getModelNames();
  if (available.length === 0) {
    throw new Error('No models found. Add a file in src/models/, e.g. cube.js exporting createModel().');
  }
  const requested = getModelFromUrl();
  const modelName = requested && available.includes(requested) ? requested : available[0];

  const model = await loadModel(modelName);
  viewer.setModel(model, { autoFrame: true });
  viewer.start();

  // Helpful for debugging in DevTools without adding UI.
  window.__viewer = viewer;
  window.__modelName = modelName;
}

run().catch((err) => {
  console.error(err);

  const pre = document.createElement('pre');
  pre.style.whiteSpace = 'pre-wrap';
  pre.textContent = String(err?.stack ?? err);
  document.body.appendChild(pre);
});
