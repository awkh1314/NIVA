import { NIVA_VRM_BONE_LIMITS, NIVA_VRM_EXPECTED_BONES, clamp } from './niva-vrm-limits.mjs';

const AXES = ['x', 'y', 'z'];
const schedules = new Map();
const axisCursor = new Map();
let active = true;
let timer = null;
let targetCount = 0;

const currentEl = document.querySelector('#currentMotion');
const progressEl = document.querySelector('#progress');
const intensityEl = document.querySelector('#intensity');
const speedEl = document.querySelector('#speed');

// V0.8.1 default: use the complete configured human-safe envelope.
if (intensityEl) intensityEl.value = '1';
if (speedEl) speedEl.value = '0.85';

function scaledBounds(axis, factor) {
  return {
    min: axis.neutral + (axis.min - axis.neutral) * factor,
    max: axis.neutral + (axis.max - axis.neutral) * factor,
  };
}

function randomInside(axis, factor, preferBoundary = false) {
  const { min, max } = scaledBounds(axis, factor);
  if (min === max) return min;
  const r = Math.random();
  // On the primary axis, deliberately visit real configured endpoints often.
  if (preferBoundary && r < 0.28) return min;
  if (preferBoundary && r < 0.56) return max;
  return min + Math.random() * (max - min);
}

function nextBoneTarget(name) {
  const limit = NIVA_VRM_BONE_LIMITS[name];
  const factor = clamp(Number(intensityEl?.value ?? 1), 0, 1);
  const cursor = axisCursor.has(name) ? axisCursor.get(name) : Math.floor(Math.random() * 3);
  const primary = AXES[cursor % 3];
  axisCursor.set(name, (cursor + 1) % 3);

  const target = {};
  for (const axisName of AXES) {
    // Explore one axis through the full human-safe envelope at a time.
    // The other two axes still move, but at 40% of their envelope to avoid
    // combining three simultaneous anatomical extremes on the same joint.
    const axisFactor = axisName === primary ? factor : factor * 0.4;
    target[axisName] = randomInside(limit[axisName], axisFactor, axisName === primary);
  }
  return target;
}

function nextDelayMs() {
  const speed = clamp(Number(speedEl?.value ?? 0.85), 0.25, 1.5);
  return (4200 + Math.random() * 5200) / speed;
}

function retargetBone(name, now) {
  window.NIVA3D.setBoneRotation(name, nextBoneTarget(name));
  schedules.set(name, now + nextDelayMs());
  targetCount += 1;
}

function updateUi() {
  if (currentEl) currentEl.textContent = active ? '全范围随机安全活动' : '保持当前姿态';
  if (progressEl && active) progressEl.textContent = `全人体范围随机目标 · ${targetCount} 次 · HARD CLAMP`;
}

function tick() {
  if (!window.NIVA3D) return;
  const now = performance.now();
  if (active) {
    window.NIVA3D.setAutoDemo(false);
    for (const name of NIVA_VRM_EXPECTED_BONES) {
      if (!schedules.has(name) || now >= schedules.get(name)) retargetBone(name, now);
    }
  }
  updateUi();
}

function replaceButton(id) {
  const oldButton = document.querySelector(`#${id}`);
  if (!oldButton) return null;
  const button = oldButton.cloneNode(true);
  oldButton.replaceWith(button);
  return button;
}

function installControls() {
  const pauseBtn = replaceButton('pauseBtn');
  const resetBtn = replaceButton('resetBtn');

  pauseBtn?.addEventListener('click', () => {
    active = !active;
    window.NIVA3D?.setAutoDemo(false);
    pauseBtn.textContent = active ? '暂停随机活动' : '继续随机活动';
    if (active) {
      const now = performance.now();
      for (const name of NIVA_VRM_EXPECTED_BONES) schedules.set(name, now + Math.random() * 900);
    }
    updateUi();
  });

  resetBtn?.addEventListener('click', () => {
    active = false;
    schedules.clear();
    window.NIVA3D?.reset();
    if (pauseBtn) pauseBtn.textContent = '继续随机活动';
    if (currentEl) currentEl.textContent = '安全中立姿态';
    if (progressEl) progressEl.textContent = '已回到安全中立姿态';
  });
}

function waitForModel() {
  if (!window.NIVA3D) return setTimeout(waitForModel, 80);
  const jointText = document.querySelector('#jointCount')?.textContent || '';
  if (jointText.startsWith('0/')) return setTimeout(waitForModel, 120);

  window.NIVA3D.setAutoDemo(false);
  installControls();
  const now = performance.now();
  // Stagger the first targets so the body does not snap into one synchronized pose.
  for (const name of NIVA_VRM_EXPECTED_BONES) schedules.set(name, now + Math.random() * 2200);
  if (currentEl) currentEl.textContent = '全范围随机安全活动';
  timer = setInterval(tick, 90);
  tick();
}

waitForModel();

window.NIVA3DRandom = Object.freeze({
  get active() { return active; },
  pause() { active = false; updateUi(); },
  resume() {
    active = true;
    const now = performance.now();
    for (const name of NIVA_VRM_EXPECTED_BONES) schedules.set(name, now + Math.random() * 900);
    updateUi();
  },
  retargetAll() {
    const now = performance.now();
    for (const name of NIVA_VRM_EXPECTED_BONES) retargetBone(name, now);
    updateUi();
  },
  stop() {
    active = false;
    if (timer) clearInterval(timer);
    timer = null;
  },
});
