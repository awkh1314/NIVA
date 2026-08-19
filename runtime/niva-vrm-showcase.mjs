import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import {
  NIVA_VRM_BONE_LIMITS,
  NIVA_VRM_EXPECTED_BONES,
  NIVA_VRM_GROUPS,
  clamp,
  clampBoneRotation,
  neutralPose,
  randomSafePose,
  validateLimitTable,
} from './niva-vrm-limits.mjs?v=20260819-1924';

const NIVA_BUILD = '2026.08.19-1924';
const NIVA_MODEL_BLOB = 'cac284d2fe68c0f29c53f0367b5ad5fc1dc96a21';
const NIVA_MODEL_URL = `./NIVA.vrm?v=${NIVA_MODEL_BLOB}`;

const canvas = document.querySelector('#niva3d');
const shell = document.querySelector('#stageShell');
const statusEl = document.querySelector('#status');
const progressEl = document.querySelector('#progress');
const jointCountEl = document.querySelector('#jointCount');
const currentEl = document.querySelector('#currentMotion');
const intensityEl = document.querySelector('#intensity');
const speedEl = document.querySelector('#speed');
const pauseBtn = document.querySelector('#pauseBtn');
const resetBtn = document.querySelector('#resetBtn');
const limitsEl = document.querySelector('#limitsList');

const validation = validateLimitTable();
if (!validation.ok) throw new Error(`NIVA limit table invalid: ${JSON.stringify(validation)}`);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = null;
const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.minDistance = 1;
controls.maxDistance = 8;

scene.add(new THREE.HemisphereLight(0xdff6ff, 0x182035, 2.2));
const key = new THREE.DirectionalLight(0xffffff, 3.0);
key.position.set(2.4, 4.8, 3.2);
key.castShadow = true;
scene.add(key);
const rim = new THREE.DirectionalLight(0xb69aff, 2.0);
rim.position.set(-3, 2.5, -2.5);
scene.add(rim);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(1.35, 64),
  new THREE.MeshStandardMaterial({ color: 0x0b1522, roughness: 0.9, metalness: 0.05, transparent: true, opacity: 0.78 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

let vrm = null;
let autoDemo = true;
let demoTime = 0;
let manualPose = neutralPose();
let randomTargetPose = neutralPose();
let nextRandomTargetAt = 0;
let randomTargetIndex = 0;
const state = new Map();
const clock = new THREE.Clock();
let blinkClock = 0;
let nextBlink = 2.6;

function stateFor(name, axisName, neutral) {
  const key = `${name}.${axisName}`;
  if (!state.has(key)) state.set(key, { angle: neutral, velocity: 0 });
  return state.get(key);
}

function stepAxis(s, target, limit, dt, speedScale) {
  const error = target - s.angle;
  const maxSpeed = limit.maxSpeed * speedScale;
  const maxAccel = limit.maxAccel * speedScale;
  const desiredVelocity = clamp(error * 7.5 * speedScale, -maxSpeed, maxSpeed);
  const dv = clamp(desiredVelocity - s.velocity, -maxAccel * dt, maxAccel * dt);
  s.velocity = clamp(s.velocity + dv, -maxSpeed, maxSpeed);
  let next = s.angle + s.velocity * dt;
  if ((error > 0 && next > target) || (error < 0 && next < target)) {
    next = target;
    s.velocity *= 0.35;
  }
  return next;
}

function applyPose(targetPose, dt, speedScale) {
  if (!vrm) return;
  for (const name of NIVA_VRM_EXPECTED_BONES) {
    const limits = NIVA_VRM_BONE_LIMITS[name];
    const node = vrm.humanoid.getNormalizedBoneNode(name);
    if (!node) continue;
    const target = clampBoneRotation(name, targetPose[name] || {});
    const xState = stateFor(name, 'x', limits.x.neutral);
    const yState = stateFor(name, 'y', limits.y.neutral);
    const zState = stateFor(name, 'z', limits.z.neutral);
    xState.angle = clamp(stepAxis(xState, target.x, limits, dt, speedScale), limits.x.min, limits.x.max);
    yState.angle = clamp(stepAxis(yState, target.y, limits, dt, speedScale), limits.y.min, limits.y.max);
    zState.angle = clamp(stepAxis(zState, target.z, limits, dt, speedScale), limits.z.min, limits.z.max);
    node.rotation.set(
      THREE.MathUtils.degToRad(xState.angle),
      THREE.MathUtils.degToRad(yState.angle),
      THREE.MathUtils.degToRad(zState.angle),
      'XYZ',
    );
  }
}

function resetLimiterToNeutral() {
  state.clear();
  manualPose = neutralPose();
}

function refreshRandomTarget(force = false) {
  if (!autoDemo && !force) return;
  const intensity = clamp(Number(intensityEl.value), 0, 1);
  const speed = clamp(Number(speedEl.value), 0.25, 1);
  randomTargetPose = randomSafePose(intensity, Math.random, 0.36);
  randomTargetIndex += 1;
  nextRandomTargetAt = demoTime + (6.5 + Math.random() * 4.5) / speed;
  currentEl.textContent = `完整 ROM 随机目标 #${randomTargetIndex}`;
}

function captureCurrentPose() {
  return Object.fromEntries(NIVA_VRM_EXPECTED_BONES.map((name) => {
    const l = NIVA_VRM_BONE_LIMITS[name];
    return [name, {
      x: stateFor(name, 'x', l.x.neutral).angle,
      y: stateFor(name, 'y', l.y.neutral).angle,
      z: stateFor(name, 'z', l.z.neutral).angle,
    }];
  }));
}

function setBlink(value) {
  if (!vrm?.expressionManager) return;
  vrm.expressionManager.setValue('blink', clamp(value, 0, 1));
}

function updateBlink(dt) {
  if (!vrm?.expressionManager) return;
  blinkClock += dt;
  if (blinkClock < nextBlink) return setBlink(0);
  const local = blinkClock - nextBlink;
  if (local < 0.09) return setBlink(local / 0.09);
  if (local < 0.18) return setBlink(1 - (local - 0.09) / 0.09);
  blinkClock = 0;
  nextBlink = 2.2 + Math.random() * 2.8;
  setBlink(0);
}

function updateExpression(t) {
  if (!vrm?.expressionManager) return;
  const happy = 0.06 + 0.04 * Math.sin(t * 0.55);
  vrm.expressionManager.setValue('happy', clamp(happy, 0, 0.12));
}

function fitModel() {
  const box = new THREE.Box3().setFromObject(vrm.scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const height = Math.max(size.y, 0.5);
  ground.position.y = box.min.y - 0.012;
  ground.scale.setScalar(Math.max(size.x, size.z, 0.6) * 0.85);
  controls.target.set(center.x, box.min.y + height * 0.5, center.z);
  camera.position.set(center.x + height * 0.12, box.min.y + height * 0.52, center.z + height * 2.35);
  camera.near = Math.max(0.01, height / 100);
  camera.far = height * 20;
  camera.updateProjectionMatrix();
  controls.minDistance = height * 0.75;
  controls.maxDistance = height * 5;
  controls.update();
}

function resize() {
  const rect = shell.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(shell);
resize();

function renderLimits() {
  const grouped = Object.groupBy(Object.entries(NIVA_VRM_BONE_LIMITS), ([, value]) => value.group);
  limitsEl.innerHTML = '';
  for (const group of NIVA_VRM_GROUPS) {
    const section = document.createElement('details');
    if (group === '头颈' || group === '上肢' || group === '下肢') section.open = true;
    const items = grouped[group] || [];
    section.innerHTML = `<summary>${group}<span>${items.length}</span></summary>`;
    const body = document.createElement('div');
    body.className = 'limit-grid';
    for (const [name, l] of items) {
      const item = document.createElement('div');
      item.className = 'limit-item';
      item.innerHTML = `<b>${l.label}</b><code>${name}</code><small>X ${l.x.min}°~${l.x.max}° · Y ${l.y.min}°~${l.y.max}° · Z ${l.z.min}°~${l.z.max}° · ≤${l.maxSpeed}°/s</small>`;
      body.appendChild(item);
    }
    section.appendChild(body);
    limitsEl.appendChild(section);
  }
}
renderLimits();

const loader = new GLTFLoader();
loader.crossOrigin = 'anonymous';
loader.register((parser) => new VRMLoaderPlugin(parser));

progressEl.textContent = `加载当前 NIVA.vrm · ${NIVA_MODEL_BLOB.slice(0, 8)}`;
loader.load(
  NIVA_MODEL_URL,
  (gltf) => {
    vrm = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.combineSkeletons(vrm.scene);
    vrm.scene.traverse((obj) => {
      obj.frustumCulled = false;
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    scene.add(vrm.scene);
    const available = NIVA_VRM_EXPECTED_BONES.filter((name) => vrm.humanoid.getNormalizedBoneNode(name));
    const missing = NIVA_VRM_EXPECTED_BONES.filter((name) => !vrm.humanoid.getNormalizedBoneNode(name));
    jointCountEl.textContent = `${available.length}/${NIVA_VRM_EXPECTED_BONES.length}`;
    statusEl.textContent = missing.length ? `● 已载入 · 缺 ${missing.length} 骨骼` : '● 已载入 · 安全限制开启';
    statusEl.classList.add('ok');
    progressEl.textContent = `MODEL ${NIVA_MODEL_BLOB.slice(0, 8)} · BUILD ${NIVA_BUILD}`;
    fitModel();
    resetLimiterToNeutral();
    refreshRandomTarget(true);
  },
  (event) => {
    if (event.total) {
      const pct = Math.round(event.loaded / event.total * 100);
      progressEl.textContent = `加载 NIVA.vrm ${pct}% · ${NIVA_MODEL_BLOB.slice(0, 8)}`;
    } else {
      progressEl.textContent = `加载 NIVA.vrm ${(event.loaded / 1024 / 1024).toFixed(1)} MB · ${NIVA_MODEL_BLOB.slice(0, 8)}`;
    }
  },
  (error) => {
    console.error(error);
    statusEl.textContent = '● 模型加载失败';
    statusEl.classList.add('bad');
    progressEl.textContent = `加载失败 · MODEL ${NIVA_MODEL_BLOB.slice(0, 8)}`;
  },
);

intensityEl.addEventListener('input', () => {
  if (autoDemo) refreshRandomTarget(true);
});

pauseBtn.addEventListener('click', () => {
  autoDemo = !autoDemo;
  pauseBtn.textContent = autoDemo ? '暂停随机活动' : '继续随机活动';
  if (autoDemo) {
    refreshRandomTarget(true);
  } else {
    currentEl.textContent = '保持当前姿态';
    manualPose = captureCurrentPose();
  }
});

resetBtn.addEventListener('click', () => {
  autoDemo = false;
  pauseBtn.textContent = '继续随机活动';
  currentEl.textContent = '安全中立姿态';
  manualPose = neutralPose();
});

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const speed = clamp(Number(speedEl.value), 0.25, 1);
  demoTime += dt;
  if (vrm) {
    if (autoDemo && demoTime >= nextRandomTargetAt) refreshRandomTarget();
    const target = autoDemo ? randomTargetPose : manualPose;
    applyPose(target, dt, speed);
    updateBlink(dt);
    updateExpression(demoTime);
    vrm.update(dt);
  }
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.NIVA3D = Object.freeze({
  build: NIVA_BUILD,
  modelBlob: NIVA_MODEL_BLOB,
  get limits() { return NIVA_VRM_BONE_LIMITS; },
  get autoDemo() { return autoDemo; },
  get randomTarget() { return randomTargetPose; },
  setAutoDemo(enabled) {
    autoDemo = Boolean(enabled);
    pauseBtn.textContent = autoDemo ? '暂停随机活动' : '继续随机活动';
    if (autoDemo) refreshRandomTarget(true);
  },
  randomize() {
    autoDemo = true;
    refreshRandomTarget(true);
    return randomTargetPose;
  },
  setBoneRotation(name, rotation) {
    if (!NIVA_VRM_BONE_LIMITS[name]) throw new Error(`Unsupported NIVA bone: ${name}`);
    autoDemo = false;
    manualPose = { ...manualPose, [name]: clampBoneRotation(name, rotation) };
    return { ...manualPose[name] };
  },
  getBoneRotation(name) {
    const l = NIVA_VRM_BONE_LIMITS[name];
    if (!l) return null;
    return {
      x: stateFor(name, 'x', l.x.neutral).angle,
      y: stateFor(name, 'y', l.y.neutral).angle,
      z: stateFor(name, 'z', l.z.neutral).angle,
    };
  },
  reset() {
    autoDemo = false;
    manualPose = neutralPose();
  },
});
