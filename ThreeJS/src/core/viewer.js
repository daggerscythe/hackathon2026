import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

function createToonGradientMap(steps = 4) {
  const safeSteps = Math.max(2, Math.min(16, Math.floor(steps)));
  const data = new Uint8Array(safeSteps);

  for (let i = 0; i < safeSteps; i++) {
    data[i] = Math.round((255 * i) / (safeSteps - 1));
  }

  const gradientMap = new THREE.DataTexture(data, safeSteps, 1, THREE.RedFormat);
  gradientMap.needsUpdate = true;
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  return gradientMap;
}

function ensureSmoothNormals(mesh) {
  const geometry = mesh.geometry;
  if (!geometry || !geometry.isBufferGeometry) return;

  // If normals are missing (or if the asset has poor normals), this helps reduce faceted shading.
  // For many stylized assets, recomputing normals is acceptable.
  if (!geometry.attributes?.normal) {
    geometry.computeVertexNormals();
  } else {
    geometry.computeVertexNormals();
  }

  if (typeof geometry.normalizeNormals === 'function') {
    geometry.normalizeNormals();
  }
}

function addOutlines(root, {
  color = 0x000000,
  thickness = 0.03,
} = {}) {
  if (!root) return;

  const outlineMaterial = new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide,
    depthTest: true,
    depthWrite: false,
  });

  // Collect first, then mutate. Mutating the graph while traversing can recurse forever.
  const meshesToOutline = [];
  root.traverse((obj) => {
    if (obj.userData?.__isOutline) return;
    if (!obj.isMesh) return;
    if (obj.isSkinnedMesh) return; // keep it simple; skinned outlines need special handling
    if (obj.userData.__outlineAdded) return;
    meshesToOutline.push(obj);
  });

  for (const mesh of meshesToOutline) {
    const outline = new THREE.Mesh(mesh.geometry, outlineMaterial);
    outline.name = '__outline';
    outline.userData.__isOutline = true;
    outline.frustumCulled = false;
    outline.renderOrder = -1;
    outline.scale.setScalar(1 + thickness);

    mesh.add(outline);
    mesh.userData.__outlineAdded = true;
  }
}

function applyCelShading(root, gradientMap) {
  if (!root) return;

  root.traverse((obj) => {
    if (obj.userData?.__isOutline) return;
    if (!obj.isMesh) return;

    ensureSmoothNormals(obj);

    const sourceMat = obj.material;
    const mats = Array.isArray(sourceMat) ? sourceMat : [sourceMat];

    const toonMats = mats.map((m) => {
      if (!m) return m;

      const toon = new THREE.MeshToonMaterial();

      // Preserve basic appearance when coming from glTF materials.
      if (m.color) toon.color.copy(m.color);
      if (m.map) toon.map = m.map;
      if (m.transparent != null) toon.transparent = m.transparent;
      if (m.opacity != null) toon.opacity = m.opacity;
      if (m.side != null) toon.side = m.side;

      // Preserve animation-related flags when present.
      if (obj.isSkinnedMesh) toon.skinning = true;
      if (obj.morphTargetInfluences) toon.morphTargets = true;

      toon.gradientMap = gradientMap;
      toon.flatShading = false;
      toon.needsUpdate = true;
      return toon;
    });

    obj.material = Array.isArray(sourceMat) ? toonMats : toonMats[0];
    obj.castShadow = true;
    obj.receiveShadow = true;
  });
}

function frameObject(camera, controls, object3d) {
  const box = new THREE.Box3().setFromObject(object3d);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDim) || maxDim <= 0) {
    return;
  }

  // Fit object in view for current FOV while preserving a consistent camera model.
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const fitDistance = (maxDim / 2) / Math.tan(fov / 2);
  const distance = fitDistance * 1.25;

  camera.position.set(center.x, center.y + distance * 0.15, center.z + distance);
  camera.near = Math.max(0.01, distance / 100);
  camera.far = distance * 100;
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
}

export function createViewer({ container }) {
  if (!container) {
    throw new Error('createViewer: container is required');
  }

  const scene = new THREE.Scene();
  // Beige background.
  scene.background = new THREE.Color('#f2e7d5');

  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
  camera.position.set(0, 1.2, 4);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const ambient = new THREE.AmbientLight(0xffffff, 1.1);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(2, 5, 3);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.7);
  fillLight.position.set(-3, 2, -2);
  scene.add(fillLight);

  const toonGradientMap = createToonGradientMap(6);

  let currentModel = null;
  let currentMixer = null;
  let currentClips = [];
  let currentActions = new Map();
  let rafId = null;
  let lastTimeMs = null;

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height, false);
  }

  function setModel(object3d, { autoFrame = true } = {}) {
    if (currentModel) {
      scene.remove(currentModel);
    }

    currentMixer = null;
    currentClips = [];
    currentActions = new Map();

    currentModel = object3d;
    if (currentModel) {
      applyCelShading(currentModel, toonGradientMap);
      addOutlines(currentModel, { color: 0x000000, thickness: 0.03 });

      // If the loader attached clips, prep an AnimationMixer.
      const clips = currentModel.userData?.gltfAnimations;
      if (Array.isArray(clips) && clips.length > 0) {
        currentClips = clips;
        currentMixer = new THREE.AnimationMixer(currentModel);
      }

      scene.add(currentModel);
      if (autoFrame) {
        frameObject(camera, controls, currentModel);
      }
    }
  }

  function listAnimations() {
    return currentClips.map((c, i) => ({ index: i, name: c?.name ?? '' }));
  }

  function playAnimation(indexOrName = 0, {
    fadeIn = 0.08,
    loop = THREE.LoopOnce,
    clampWhenFinished = true,
    reset = true,
  } = {}) {
    if (!currentMixer || currentClips.length === 0) return false;

    let clip = null;
    if (typeof indexOrName === 'number') {
      clip = currentClips[indexOrName];
    } else {
      clip = currentClips.find((c) => c?.name === indexOrName);
    }
    if (!clip) return false;

    const key = clip.uuid ?? clip.name ?? String(indexOrName);
    let action = currentActions.get(key);
    if (!action) {
      action = currentMixer.clipAction(clip);
      currentActions.set(key, action);
    }

    action.setLoop(loop, Infinity);
    action.clampWhenFinished = clampWhenFinished;
    if (reset) action.reset();
    action.enabled = true;

    // Stop other actions for a simple “one animation at a time” behavior.
    for (const [k, a] of currentActions.entries()) {
      if (k !== key) {
        a.fadeOut(fadeIn);
      }
    }

    action.fadeIn(fadeIn);
    action.play();
    return true;
  }

  function stopAllAnimations() {
    if (!currentMixer) return;
    currentMixer.stopAllAction();
    currentActions.clear();
  }

  function start() {
    if (rafId != null) return;

    resize();

    lastTimeMs = performance.now();

    const tick = () => {
      rafId = window.requestAnimationFrame(tick);

      const nowMs = performance.now();
      const dt = Math.min(0.05, (nowMs - lastTimeMs) / 1000);
      lastTimeMs = nowMs;

      if (currentModel && currentModel.userData && typeof currentModel.userData.tick === 'function') {
        currentModel.userData.tick(dt);
      }

      if (currentMixer) {
        currentMixer.update(dt);
      }

      controls.update();
      renderer.render(scene, camera);
    };

    rafId = window.requestAnimationFrame(tick);
  }

  function stop() {
    if (rafId != null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }

    lastTimeMs = null;
  }

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(container);

  window.addEventListener('resize', resize);

  function dispose() {
    stop();
    window.removeEventListener('resize', resize);
    resizeObserver.disconnect();
    controls.dispose();
    renderer.dispose();

    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement);
    }
  }

  return {
    scene,
    camera,
    renderer,
    controls,
    resize,
    setModel,
    listAnimations,
    playAnimation,
    stopAllAnimations,
    start,
    stop,
    dispose,
  };
}
