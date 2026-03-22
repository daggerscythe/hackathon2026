import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * @param {HTMLElement} container
 * @param {{ modelUrl: string }} opts
 */
export function mountGameView(container, { modelUrl }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f5f4);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(6, 7, 10);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.left = '12px';
  overlay.style.top = '12px';
  overlay.style.padding = '8px 10px';
  overlay.style.borderRadius = '10px';
  overlay.style.border = '1px solid rgba(0,0,0,0.12)';
  overlay.style.background = 'rgba(255,255,255,0.9)';
  overlay.style.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  overlay.style.color = '#111827';
  overlay.textContent = `Loading model: ${modelUrl}`;
  container.appendChild(overlay);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.9);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(6, 10, 4);
  scene.add(dir);

  const ambient = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(ambient);

  // Visual reference so we know rendering is working even before the model loads.
  scene.add(new THREE.GridHelper(20, 20, 0x999999, 0xd1d5db));
  scene.add(new THREE.AxesHelper(2));

  const loader = new GLTFLoader();

  /** @type {THREE.Group | null} */
  let battlefield = null;

  const cameraDir = camera.position.clone().normalize();

  /**
   * @param {THREE.Object3D} obj
   */
  function fitCameraToObject(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return;

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (camera.fov * Math.PI) / 180;
    const dist = maxDim / (2 * Math.tan(fov / 2));
    const padded = dist * 1.6;

    camera.position.copy(center.clone().add(cameraDir.clone().multiplyScalar(padded)));
    camera.near = Math.max(0.01, padded / 200);
    camera.far = Math.max(50, padded * 10);
    camera.updateProjectionMatrix();
    camera.lookAt(center);
  }

  loader.load(
    modelUrl,
    (gltf) => {
      battlefield = gltf.scene;

      const box = new THREE.Box3().setFromObject(battlefield);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      // Center the model around the origin
      battlefield.position.x += -center.x;
      battlefield.position.z += -center.z;

      // Put the model on the "ground" (y=0)
      const box2 = new THREE.Box3().setFromObject(battlefield);
      battlefield.position.y += -box2.min.y;

      // If it's huge or tiny, normalize to a reasonable footprint.
      const maxXZ = Math.max(size.x, size.z);
      if (Number.isFinite(maxXZ) && maxXZ > 0) {
        const target = 12;
        const s = THREE.MathUtils.clamp(target / maxXZ, 0.05, 20);
        battlefield.scale.setScalar(s);

        const box3 = new THREE.Box3().setFromObject(battlefield);
        battlefield.position.y += -box3.min.y;
      }

      scene.add(battlefield);

      fitCameraToObject(battlefield);
      overlay.textContent = 'Loaded.';
    },
    undefined,
    (err) => {
      overlay.textContent = `Failed to load model. Check /models path and dev server. (${String(err?.message ?? err)})`;
    }
  );

  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, true);
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  resize();

  let raf = 0;

  function tick() {
    raf = requestAnimationFrame(tick);

    renderer.render(scene, camera);
  }

  tick();

  return {
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
      overlay.remove();

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose?.();
          const m = obj.material;
          if (Array.isArray(m)) m.forEach((mm) => mm?.dispose?.());
          else m?.dispose?.();
        }
      });
    },
  };
}
