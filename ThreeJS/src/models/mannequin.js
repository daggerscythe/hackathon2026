import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export async function createModel() {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync('/blends/Mannequin.glb');
  gltf.scene.userData.gltfAnimations = gltf.animations;
  return gltf.scene;
}
