import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { NIVA_VRM_BONE_LIMITS, NIVA_VRM_EXPECTED_BONES, clampBoneRotation, neutralPose } from '../runtime/niva-vrm-limits.mjs';
import { calibrateCollisionThresholds, detectAnatomicalCollisions } from '../runtime/niva-vrm-collision-guard.mjs';
import { applyCoupledJointConstraints, applyPosePatch, blendPose, clonePose, createSafePosePlanner } from './safe-pose-planner.mjs';
import { gestureDuration, gesturePatch, NIVA_GESTURES } from './gestures.mjs';
import { deepSeekPayload, fallbackOrchestration, NIVA_ORCHESTRATION_SYSTEM_PROMPT, normalizeOrchestration } from './orchestrator.mjs';
import { NIVA_PRESETS } from './presets.mjs';
import { kokoroVoiceStatus, speakWithKokoro } from './kokoro-voice.mjs';

const BUILD = '0.83.1';
const MODEL_URL = new URL('../NIVA.vrm', import.meta.url).href;
const $ = (q) => document.querySelector(q);
const isTauri = () => Boolean(window.__TAURI_INTERNALS__);

const canvas = $('#nivaCanvas');
const stage = $('#avatarStage');
const panel = $('#panel');
const bubble = $('#speechBubble');
const modeBadge = $('#modeBadge');
const plannerBadge = $('#plannerBadge');
const voiceBadge = $('#voiceBadge');
const bankCountEl = $('#bankCount');
const pathCountEl = $('#pathCount');
const rejectCountEl = $('#rejectCount');
const queueInfo = $('#queueInfo');

let apiKeySession = '';
let panelVisible = false;
let vrm = null;
let modelHeight = 1.65;
let collisionThresholds = null;
let safePoseBank = [];
let currentPose = neutralPose();
let currentSegment = null;
let motionQueue = [];
let responseQueue = [];
let activeResponse = null;
let speaking = false;
let plannerPathCount = 0;
let plannerRejectCount = 0;
let modelReady = false;
let modelYaw = 0;
let dragStart = null;
let inputPipeline = Promise.resolve();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const avatarRoot = new THREE.Group();
scene.add(avatarRoot);
const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 100);
scene.add(new THREE.HemisphereLight(0xe9f8ff, 0x172030, 2.6));
const key = new THREE.DirectionalLight(0xffffff, 3.4);
key.position.set(2.2, 4.4, 3.2);
scene.add(key);
const fill = new THREE.DirectionalLight(0xa7cfff, 1.4);
fill.position.set(-2.4, 2.2, 2);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xc9a8ff, 1.8);
rim.position.set(-2.2, 2.8, -2.6);
scene.add(rim);

function resizeRenderer() {
  const r = stage.getBoundingClientRect();
  const w = Math.max(1, Math.floor(r.width));
  const h = Math.max(1, Math.floor(r.height));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resizeRenderer).observe(stage);
resizeRenderer();

function fitCamera() {
  if (!vrm) return;
  const box = new THREE.Box3().setFromObject(vrm.scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  modelHeight = Math.max(size.y, 0.5);
  camera.position.set(center.x, box.min.y + modelHeight * 0.53, center.z + modelHeight * 2.25);
  camera.lookAt(center.x, box.min.y + modelHeight * 0.5, center.z);
  camera.near = Math.max(0.01, modelHeight / 100);
  camera.far = modelHeight * 20;
  camera.updateProjectionMatrix();
}

function setImmediatePose(pose) {
  if (!vrm) return;
  for (const name of NIVA_VRM_EXPECTED_BONES) {
    const node = vrm.humanoid.getNormalizedBoneNode(name);
    const lim = NIVA_VRM_BONE_LIMITS[name];
    if (!node || !lim) continue;
    const r = clampBoneRotation(name, pose[name] || {});
    node.rotation.set(
      THREE.MathUtils.degToRad(r.x),
      THREE.MathUtils.degToRad(r.y),
      THREE.MathUtils.degToRad(r.z),
      'XYZ',
    );
  }
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
}

function captureWorldPoints() {
  const points = {};
  if (!vrm) return points;
  vrm.scene.updateMatrixWorld(true);
  for (const name of NIVA_VRM_EXPECTED_BONES) {
    const node = vrm.humanoid.getNormalizedBoneNode(name);
    if (!node) continue;
    const p = new THREE.Vector3();
    node.getWorldPosition(p);
    points[name] = { x: p.x, y: p.y, z: p.z };
  }
  return points;
}

function inspectCurrentPose() {
  if (!collisionThresholds) return { safe: true, collisions: [] };
  const collisions = detectAnatomicalCollisions(captureWorldPoints(), modelHeight, collisionThresholds);
  return { safe: collisions.length === 0, collisions };
}

function validatePose(candidate) {
  const saved = clonePose(currentPose);
  setImmediatePose(candidate);
  const result = inspectCurrentPose();
  setImmediatePose(saved);
  return result;
}

function validatePath(from, to, samples = 18) {
  const saved = clonePose(currentPose);
  const count = Math.max(8, Math.min(36, Math.round(samples)));
  plannerPathCount += 1;
  for (let i = 1; i <= count; i += 1) {
    setImmediatePose(blendPose(from, to, i / count));
    const result = inspectCurrentPose();
    if (!result.safe) {
      setImmediatePose(saved);
      plannerRejectCount += 1;
      updateStats();
      return { safe: false, collisions: result.collisions, samples: i };
    }
  }
  setImmediatePose(saved);
  updateStats();
  return { safe: true, collisions: [], samples: count };
}

function updateStats() {
  bankCountEl.textContent = String(safePoseBank.length);
  pathCountEl.textContent = String(plannerPathCount);
  rejectCountEl.textContent = String(plannerRejectCount);
}

function bankSides(name) {
  return ['wave', 'point', 'think', 'step', 'tilt'].includes(name) ? ['l', 'r'] : ['c'];
}

function buildSafePoseBank() {
  const base = neutralPose();
  safePoseBank = [];
  plannerBadge.textContent = '预计算安全姿态…';
  const intensities = [0.28, 0.46, 0.64, 0.82];
  for (const name of NIVA_GESTURES) {
    for (const side of bankSides(name)) {
      for (const intensity of intensities) {
        for (let variant = 0; variant < 2; variant += 1) {
          const patch = gesturePatch(name, side, intensity, NIVA_VRM_BONE_LIMITS, variant);
          const candidate = applyCoupledJointConstraints(
            applyPosePatch(base, patch, NIVA_VRM_BONE_LIMITS),
            NIVA_VRM_BONE_LIMITS,
          );
          const end = validatePose(candidate);
          if (!end.safe) {
            plannerRejectCount += 1;
            continue;
          }
          const path = validatePath(base, candidate, 12);
          if (!path.safe) continue;
          safePoseBank.push({ name, side, intensity, variant, patch });
        }
      }
    }
  }
  plannerBadge.textContent = `安全姿态库 ${safePoseBank.length}`;
  updateStats();
}

function nearestBankEntries(request) {
  const side = request.side === 'c' ? null : request.side;
  let candidates = safePoseBank.filter((x) => x.name === request.gesture && (!side || x.side === side));
  if (!candidates.length) candidates = safePoseBank.filter((x) => x.name === request.gesture);
  candidates.sort((a, b) => Math.abs(a.intensity - request.intensity) - Math.abs(b.intensity - request.intensity));
  return candidates;
}

function planOneGesture(fromPose, request) {
  const entries = nearestBankEntries(request);
  const planner = createSafePosePlanner({
    limits: NIVA_VRM_BONE_LIMITS,
    capturePose: () => fromPose,
    makeCandidate: (_req, from, attempt) => {
      const entry = entries[attempt % Math.max(1, entries.length)];
      const fallbackIntensity = Math.max(0.18, request.intensity * Math.pow(0.84, attempt));
      const patch = entry?.patch || gesturePatch(request.gesture, request.side, fallbackIntensity, NIVA_VRM_BONE_LIMITS, attempt);
      return applyPosePatch(from, patch, NIVA_VRM_BONE_LIMITS);
    },
    validatePose,
    validatePath,
    maxAttempts: Math.max(12, Math.min(48, entries.length + 12)),
  });
  const result = planner.plan({ pathSamples: 18 });
  if (!result.ok) plannerRejectCount += result.attempts || 1;
  updateStats();
  return result;
}

function quintic(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function requiredDuration(from, to, requested = 1.2) {
  let min = Math.max(0.4, requested);
  for (const [name, lim] of Object.entries(NIVA_VRM_BONE_LIMITS)) {
    const a = from[name];
    const b = to[name];
    if (!a || !b) continue;
    for (const axis of ['x', 'y', 'z']) {
      const delta = Math.abs((b[axis] || 0) - (a[axis] || 0));
      if (!delta) continue;
      min = Math.max(
        min,
        1.875 * delta / Math.max(1, lim.maxSpeed),
        Math.sqrt(5.8 * delta / Math.max(1, lim.maxAccel)),
      );
    }
  }
  return Math.min(4.5, min);
}

function queueSegment(from, to, duration, label) {
  motionQueue.push({ from: clonePose(from), to: clonePose(to), duration: requiredDuration(from, to, duration), label });
}

function planResponseMotions(data) {
  let tail = motionQueue.length
    ? clonePose(motionQueue[motionQueue.length - 1].to)
    : (currentSegment ? clonePose(currentSegment.to) : clonePose(currentPose));
  let planned = 0;
  for (const item of data.g || []) {
    const [gesture, side, intensity] = item;
    const result = planOneGesture(tail, { gesture, side, intensity });
    if (!result.ok) continue;
    queueSegment(tail, result.target, gestureDuration(gesture, intensity), gesture);
    tail = result.target;
    planned += 1;
  }
  const rest = neutralPose();
  const restCheck = validatePath(tail, rest, 16);
  if (restCheck.safe && (planned || JSON.stringify(tail) !== JSON.stringify(rest))) {
    queueSegment(tail, rest, 1.25, 'settle');
  }
  return planned;
}

function startNextMotion(now) {
  if (currentSegment || !motionQueue.length) return;
  currentSegment = { ...motionQueue.shift(), startedAt: now };
}

function updateMotion(now) {
  startNextMotion(now);
  if (!currentSegment) return;
  const elapsed = (now - currentSegment.startedAt) / 1000;
  const t = Math.min(1, elapsed / currentSegment.duration);
  currentPose = blendPose(currentSegment.from, currentSegment.to, quintic(t));
  setImmediatePose(currentPose);
  if (t >= 1) {
    currentPose = clonePose(currentSegment.to);
    currentSegment = null;
    startNextMotion(now);
  }
}

function setEmotion(name) {
  if (!vrm?.expressionManager) return;
  const map = {
    happy: 'happy',
    sad: 'sad',
    angry: 'angry',
    surprise: 'surprised',
    shy: 'relaxed',
    thinking: 'neutral',
    neutral: 'neutral',
  };
  for (const keyName of ['happy', 'sad', 'angry', 'surprised', 'relaxed']) {
    try { vrm.expressionManager.setValue(keyName, 0); } catch {}
  }
  const target = map[name];
  if (target && target !== 'neutral') {
    try { vrm.expressionManager.setValue(target, 0.45); } catch {}
  }
}

function updateMouth(now) {
  if (!vrm?.expressionManager) return;
  let value = 0;
  if (speaking) value = 0.12 + 0.32 * Math.abs(Math.sin(now * 0.018)) + 0.08 * Math.abs(Math.sin(now * 0.041));
  try { vrm.expressionManager.setValue('aa', Math.min(0.58, value)); } catch {}
}

function speakFallback(text, style = 'neutral') {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = style === 'excited' ? 1.08 : (style === 'sad' || style === 'gentle' ? 0.93 : 1);
    utterance.pitch = style === 'bright' || style === 'excited' ? 1.08 : (style === 'serious' ? 0.96 : 1.02);
    utterance.onend = resolve;
    utterance.onerror = resolve;
    speechSynthesis.speak(utterance);
  });
}

async function speak(data) {
  const [style, intensity] = data.v || ['neutral', 0.5];
  speaking = true;
  try {
    try {
      await speakWithKokoro(data.t, style, intensity, (status) => { voiceBadge.textContent = status; });
      voiceBadge.textContent = kokoroVoiceStatus();
    } catch (error) {
      console.warn('Kokoro unavailable, using system TTS', error);
      voiceBadge.textContent = '系统语音回退';
      await speakFallback(data.t, style);
    }
  } finally {
    speaking = false;
  }
}

function showBubble(text) {
  bubble.textContent = text;
  bubble.classList.remove('hidden');
}

function hideBubble() {
  bubble.classList.add('hidden');
}

function updateQueueInfo() {
  const waiting = responseQueue.length;
  const state = activeResponse ? '运行中' : '空闲';
  queueInfo.textContent = waiting ? `${state} · 后续输入排队 ${waiting} 条` : state;
}

function enqueueResponse(value) {
  const data = normalizeOrchestration(value);
  responseQueue.push(data);
  updateQueueInfo();
  processResponseQueue();
}

function processResponseQueue() {
  if (activeResponse || !modelReady || !responseQueue.length) return;
  const data = responseQueue.shift();
  activeResponse = { data, speechDone: false };
  setEmotion(data.e);
  showBubble(data.t);
  planResponseMotions(data);
  updateQueueInfo();
  speak(data).finally(() => {
    if (activeResponse) activeResponse.speechDone = true;
  });
}

function maybeCompleteResponse() {
  if (!activeResponse) return;
  const motionDone = !currentSegment && motionQueue.length === 0;
  if (!activeResponse.speechDone || !motionDone) return;
  activeResponse = null;
  setEmotion('neutral');
  setTimeout(() => { if (!activeResponse) hideBubble(); }, 700);
  updateQueueInfo();
  processResponseQueue();
}

async function requestDeepSeek(text) {
  if (!apiKeySession || !isTauri()) return fallbackOrchestration(text);
  const payload = deepSeekPayload(text);
  const raw = await invoke('deepseek_orchestrate', {
    apiKey: apiKeySession,
    systemPrompt: NIVA_ORCHESTRATION_SYSTEM_PROMPT,
    userText: text,
    payloadJson: JSON.stringify(payload),
  });
  return normalizeOrchestration(raw);
}

function submitText(text) {
  const clean = String(text || '').trim();
  if (!clean) return;
  $('#inputBox').value = '';
  inputPipeline = inputPipeline.then(async () => {
    try {
      enqueueResponse(await requestDeepSeek(clean));
    } catch (error) {
      enqueueResponse({
        t: `这次连接失败：${String(error).slice(0, 120)}。我先切回体验模式。`,
        e: 'sad',
        g: [['tilt', 'l', 0.25]],
        v: ['gentle', 0.35],
      });
    }
  });
}

async function setPanelVisible(show) {
  panelVisible = Boolean(show);
  panel.classList.toggle('hidden', !panelVisible);
  panel.setAttribute('aria-hidden', String(!panelVisible));
  if (!isTauri()) return;
  try {
    const win = getCurrentWindow();
    const monitor = await win.currentMonitor();
    const position = await win.outerPosition();
    if (!monitor) return;
    const scale = monitor.scaleFactor || 1;
    const width = Math.round((panelVisible ? 820 : 430) * scale);
    const height = Math.round(700 * scale);
    const left = monitor.position.x;
    const top = monitor.position.y;
    const maxX = left + monitor.size.width - width;
    const maxY = top + monitor.size.height - height;
    const x = Math.max(left, Math.min(maxX, position.x));
    const y = Math.max(top, Math.min(maxY, position.y));
    await win.setSize(new PhysicalSize(width, height));
    await win.setPosition(new PhysicalPosition(x, y));
  } catch (error) {
    console.warn('window fit failed', error);
  }
}

function installMic() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $('#micBtn');
  if (!SpeechRecognition) {
    btn.addEventListener('click', () => {
      queueInfo.textContent = '当前 WebView 不支持系统语音识别，请直接输入文字。';
    });
    return;
  }
  const rec = new SpeechRecognition();
  rec.lang = 'zh-CN';
  rec.interimResults = false;
  rec.continuous = false;
  rec.onstart = () => btn.classList.add('listening');
  rec.onend = () => btn.classList.remove('listening');
  rec.onerror = () => btn.classList.remove('listening');
  rec.onresult = (event) => {
    const text = event.results?.[0]?.[0]?.transcript || '';
    if (text) submitText(text);
  };
  btn.addEventListener('click', () => {
    try { rec.start(); } catch {}
  });
}

function installUi() {
  $('#closePanel').addEventListener('click', () => setPanelVisible(false));
  canvas.addEventListener('dblclick', () => setPanelVisible(!panelVisible));
  $('#sendBtn').addEventListener('click', () => submitText($('#inputBox').value));
  $('#inputBox').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitText(event.currentTarget.value);
    }
  });
  $('#saveApi').addEventListener('click', () => {
    apiKeySession = $('#apiKey').value.trim();
    modeBadge.textContent = apiKeySession ? 'DeepSeek 已接入' : '体验模式';
    $('#firstRun').classList.add('hidden');
    sessionStorage.setItem('niva_api_seen', '1');
  });
  $('#useDemo').addEventListener('click', () => {
    apiKeySession = '';
    modeBadge.textContent = '体验模式';
    $('#firstRun').classList.add('hidden');
    sessionStorage.setItem('niva_api_seen', '1');
  });
  for (const preset of NIVA_PRESETS) {
    const button = document.createElement('button');
    button.textContent = preset.label;
    button.addEventListener('click', () => enqueueResponse(preset.data));
    $('#presetGrid').appendChild(button);
  }
  installMic();
  canvas.addEventListener('pointerdown', (event) => {
    dragStart = { x: event.clientX, yaw: modelYaw };
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragStart) return;
    modelYaw = dragStart.yaw + (event.clientX - dragStart.x) * 0.008;
    avatarRoot.rotation.y = modelYaw;
  });
  canvas.addEventListener('pointerup', () => { dragStart = null; });
}

function probeVoice() {
  voiceBadge.textContent = kokoroVoiceStatus();
}

function animate(now = performance.now()) {
  requestAnimationFrame(animate);
  if (modelReady) {
    updateMotion(now);
    updateMouth(now);
    maybeCompleteResponse();
    vrm?.update(1 / 60);
  }
  renderer.render(scene, camera);
}

async function bootModel() {
  plannerBadge.textContent = '载入 NIVA.vrm…';
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  loader.load(
    MODEL_URL,
    (gltf) => {
      vrm = gltf.userData.vrm;
      VRMUtils.removeUnnecessaryVertices(vrm.scene);
      VRMUtils.combineSkeletons(vrm.scene);
      vrm.scene.traverse((obj) => { obj.frustumCulled = false; });
      avatarRoot.add(vrm.scene);
      currentPose = neutralPose();
      setImmediatePose(currentPose);
      fitCamera();
      collisionThresholds = calibrateCollisionThresholds(captureWorldPoints(), modelHeight);
      buildSafePoseBank();
      modelReady = true;
      plannerBadge.textContent = `V0.83 就绪 · ${safePoseBank.length} 安全姿态`;
      updateStats();
      processResponseQueue();
      if (!sessionStorage.getItem('niva_api_seen') && isTauri()) {
        setTimeout(() => setPanelVisible(true), 700);
      }
    },
    undefined,
    (error) => {
      console.error(error);
      plannerBadge.textContent = '模型加载失败';
    },
  );
}

installUi();
probeVoice();
bootModel();
animate();

window.NIVA = Object.freeze({
  build: BUILD,
  enqueue: enqueueResponse,
  preset(id) {
    const preset = NIVA_PRESETS.find((x) => x.id === id);
    if (preset) enqueueResponse(preset.data);
  },
  get bankSize() { return safePoseBank.length; },
  get queueLength() { return responseQueue.length; },
});
