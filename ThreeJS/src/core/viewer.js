import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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
  scene.background = new THREE.Color(0x111111);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
  camera.position.set(0, 1.2, 4);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const ambient = new THREE.AmbientLight(0xffffff, 0.65);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  keyLight.position.set(2, 5, 3);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
  fillLight.position.set(-3, 2, -2);
  scene.add(fillLight);

  let currentModel = null;
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

    currentModel = object3d;
    if (currentModel) {
      scene.add(currentModel);
      if (autoFrame) {
        frameObject(camera, controls, currentModel);
      }
    }
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
    start,
    stop,
    dispose,
  };
}
