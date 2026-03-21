import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export async function createModel() {
  const loader = new GLTFLoader();
  // Served from Vite's `public/` directory.
  const gltf = await loader.loadAsync('/blends/Egg2.glb');

  // Most GLBs put their content under gltf.scene
  gltf.scene.userData.gltfAnimations = gltf.animations;
  return gltf.scene;
}
