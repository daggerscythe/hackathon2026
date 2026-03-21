import * as THREE from 'three';

export function createModel() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x4f8cff, roughness: 0.35, metalness: 0.1 });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.rotation.set(0.4, 0.6, 0);
  return mesh;
}
