import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

async function assertAssetExists(url) {
  // Prefer HEAD (cheap), fall back to GET if needed.
  let res;
  try {
    res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) {
      res = await fetch(url);
    }
  } catch {
    // ignore and handle below
  }

  if (!res || !res.ok) {
    throw new Error(
      `Missing required asset: ${url}. If you're loading a .gltf, be sure its referenced .bin/textures are also in public/.`
    );
  }
}

export async function createModel() {
  await assertAssetExists('/blends/scene.gltf');
  // This project’s scene.gltf references scene.bin.
  await assertAssetExists('/blends/scene.bin');

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync('/blends/scene.gltf');
  gltf.scene.userData.gltfAnimations = gltf.animations;
  return gltf.scene;
}
