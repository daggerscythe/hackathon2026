import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * @param {HTMLElement} container
 * @param {{ modelUrl: string, players?: { modelUrl: string, spawns?: Array<{id:string, x:number, z:number}> } }} opts
 */
export function mountGameView(container, { modelUrl, players }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f5f4);

  const PLATFORM_TOP_EPSILON = 0.02;
  const PLAYER_SPAWN_Y = 0.62;

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

  const loader = new GLTFLoader();

  const playerLayer = new THREE.Group();
  scene.add(playerLayer);

  /** @type {Map<string, THREE.Object3D>} */
  const playerRoots = new Map();

  /** @type {Array<{id:string, x:number, y:number, z:number}> | null} */
  let pendingSnapshot = null;

  /** @type {THREE.Group | null} */
  let battlefield = null;

  /** @type {THREE.Group | null} */
  let playerTemplate = null;
  /** @type {Array<{id:string, x:number, z:number}>} */
  let pendingSpawns = Array.isArray(players?.spawns) ? players.spawns : [];

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

      // Lower the model so the *top* surface sits on y≈0.
      // (Eggs/players will spawn at y=0, so this prevents clipping through platform thickness.)
      const box2 = new THREE.Box3().setFromObject(battlefield);
      battlefield.position.y += -box2.max.y - PLATFORM_TOP_EPSILON;

      // If it's huge or tiny, normalize to a reasonable footprint.
      const maxXZ = Math.max(size.x, size.z);
      if (Number.isFinite(maxXZ) && maxXZ > 0) {
        const target = 12;
        const s = THREE.MathUtils.clamp(target / maxXZ, 0.05, 20);
        battlefield.scale.setScalar(s);

        const box3 = new THREE.Box3().setFromObject(battlefield);
        battlefield.position.y += -box3.max.y - PLATFORM_TOP_EPSILON;
      }

      scene.add(battlefield);

      fitCameraToObject(battlefield);

      if (players?.modelUrl) {
        overlay.textContent = `Loading players: ${players.modelUrl}`;
        loader.load(
          players.modelUrl,
          (gltf2) => {
            playerTemplate = gltf2.scene;

            const box = new THREE.Box3().setFromObject(playerTemplate);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);

            // Normalize + center so spawn positions are intuitive.
            const targetHeight = 1.2;
            const h = Math.max(1e-6, size.y);
            const s = THREE.MathUtils.clamp(targetHeight / h, 0.02, 50);
            playerTemplate.scale.setScalar(s);

            const box2 = new THREE.Box3().setFromObject(playerTemplate);
            const center2 = new THREE.Vector3();
            box2.getCenter(center2);
            playerTemplate.position.x += -center2.x;
            playerTemplate.position.z += -center2.z;

            const box3 = new THREE.Box3().setFromObject(playerTemplate);
            playerTemplate.position.y += -box3.min.y;

            spawnPlayers(pendingSpawns);

            if (pendingSnapshot) {
              setPlayersState(pendingSnapshot);
              pendingSnapshot = null;
            }
            overlay.textContent = 'Loaded.';
          },
          undefined,
          (err) => {
            overlay.textContent = `Loaded battlefield, but failed to load players. (${String(err?.message ?? err)})`;
          }
        );
      } else {
        overlay.textContent = 'Loaded.';
      }
    },
    undefined,
    (err) => {
      overlay.textContent = `Failed to load model. Check /models path and dev server. (${String(err?.message ?? err)})`;
    }
  );

  /**
   * @param {Array<{id:string, x:number, z:number}>} spawns
   */
  function spawnPlayers(spawns) {
    pendingSpawns = Array.isArray(spawns) ? spawns : [];
    if (!playerTemplate) return;

    // Clear any previous placeholders.
    while (playerLayer.children.length > 0) {
      const c = playerLayer.children[playerLayer.children.length - 1];
      playerLayer.remove(c);
    }

    playerRoots.clear();

    for (const s of pendingSpawns) {
      const inst = playerTemplate.clone(true);
      inst.position.set(0, 0, 0);

      const root = new THREE.Group();
      root.add(inst);
      root.position.set(
        Number.isFinite(s.x) ? s.x : 0,
        PLAYER_SPAWN_Y,
        Number.isFinite(s.z) ? s.z : 0
      );
      root.userData.playerId = s.id;
      playerLayer.add(root);

      if (typeof s.id === 'string' && s.id) {
        playerRoots.set(s.id, root);
      }
    }
  }

  /**
   * @param {Array<{id:string, x:number, y:number, z:number}>} playersState
   */
  function setPlayersState(playersState) {
    if (!Array.isArray(playersState)) return;
    if (!playerTemplate || playerRoots.size === 0) {
      pendingSnapshot = playersState;
      return;
    }

    for (const p of playersState) {
      if (!p || typeof p.id !== 'string') continue;
      const root = playerRoots.get(p.id);
      if (!root) continue;
      const x = Number.isFinite(p.x) ? p.x : root.position.x;
      const y = Number.isFinite(p.y) ? p.y : root.position.y;
      const z = Number.isFinite(p.z) ? p.z : root.position.z;
      root.position.set(x, y, z);
    }
  }

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
    setPlayersState,
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
