https://github.com/Oxynt/three-mixamo/tree/main


---
# Ai slop:

# ThreeJS model scaffold

This folder is set up so you can build multiple Three.js models (one per file) while sharing the same viewer (camera/renderer/resize behavior).

## Run

```bash
pnpm install
pnpm dev
```

## Switch models

Open the dev URL with a query param:

- `/?model=cube`

Model names come from filenames in `src/models/` (without `.js`).

## Add a new model file

1. Create a new file in `src/models/` (example: `src/models/cube.js`).
2. Export `createModel()` and return a `THREE.Object3D`.

No registry file is needed — `src/main.js` auto-discovers `src/models/*.js` via Vite.

Optional animation: attach a tick function:

```js
object3d.userData.tick = (dt) => {
  object3d.rotation.y += dt;
};
```

The shared viewer calls `userData.tick(dt)` every frame if present.
