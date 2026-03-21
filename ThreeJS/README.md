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

Edit the single import line in `src/main.js`:

```js
import { createModel } from './models/cube.js';
```

Point it at whichever model file you want to show.

If you use `scene.gltf`, make sure its referenced `scene.bin` file is also present in `public/blends/`.

## Add a new model file

1. Create a new file in `src/models/` (example: `src/models/myModel.js`).
2. Export `createModel()` and return a `THREE.Object3D`.
3. Update the import in `src/main.js` to point to your new file.

Optional animation: attach a tick function:

```js
object3d.userData.tick = (dt) => {
  object3d.rotation.y += dt;
};
```

The shared viewer calls `userData.tick(dt)` every frame if present.
