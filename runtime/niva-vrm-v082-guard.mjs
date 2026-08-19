import {
  NIVA_COLLISION_PAIRS,
  createAnatomicalCollisionGuard,
} from './niva-vrm-collision-guard.mjs?v=20260819-1952';

const BUILD = '2026.08.19-1952';
let guard = null;
let timer = null;
let lastResult = { safe: true, collisions: [], blocked: 0 };
let eventCount = 0;

const shellStatusEl = document.querySelector('#collisionShellStatus');

function boneNames() {
  return Object.keys(window.NIVA3D?.limits || {});
}

function getPoints() {
  const points = {};
  for (const name of boneNames()) {
    const point = window.NIVA3D?.getBoneWorldPosition(name);
    if (point) points[name] = { x: point.x, y: point.y, z: point.z };
  }
  return points;
}

function estimateHeight() {
  const points = getPoints();
  const head = points.head;
  const feet = [points.leftFoot, points.rightFoot].filter(Boolean);
  if (head && feet.length) {
    const minFootY = Math.min(...feet.map((p) => p.y));
    const skeletalHeight = Math.abs(head.y - minFootY);
    if (skeletalHeight > 0.4) return skeletalHeight * 1.08;
  }
  const hips = points.hips;
  if (head && hips) {
    const upper = Math.abs(head.y - hips.y);
    if (upper > 0.2) return upper * 2.05;
  }
  return 1.65;
}

function capturePose() {
  return Object.fromEntries(boneNames().map((name) => [name, window.NIVA3D.getBoneRotation(name)]));
}

function rollbackPose(snapshot, bones) {
  if (!snapshot) return;
  for (const name of bones) {
    if (!snapshot[name]) continue;
    window.NIVA3D.setBoneRotation(name, snapshot[name]);
  }
}

function setStatus(text, bad = false) {
  if (!shellStatusEl) return;
  shellStatusEl.textContent = text;
  shellStatusEl.classList.toggle('bad', bad);
  shellStatusEl.classList.toggle('ok', !bad);
}

function install() {
  if (!window.NIVA3D) return false;
  const jointText = document.querySelector('#jointCount')?.textContent || '';
  if (!jointText || jointText.startsWith('0/')) return false;

  // V0.82 is authoritative. Disable the older inner V0.81 detector so only
  // one guard owns rollback/retarget decisions.
  window.NIVA3D.setCollisionGuard?.(false);

  guard = createAnatomicalCollisionGuard({
    getPoints,
    getHeight: estimateHeight,
    capturePose,
    rollbackPose,
    cooldownMs: 150,
    onCollision: (detail) => {
      eventCount += 1;
      setStatus(`V0.82 已提前拦截 ${eventCount} 次 · ${detail.collisions.length} 处`, true);
      window.dispatchEvent(new CustomEvent('niva:collision', {
        detail: { ...detail, source: 'v0.82-outer-shell', build: BUILD },
      }));
    },
  });

  const calibration = guard.calibrate();
  setStatus(`V0.82 外部安全壳 ON · ${calibration.pairCount} 对`);

  timer = setInterval(() => {
    if (!guard) return;
    lastResult = guard.inspect(performance.now());
    if (lastResult.safe) {
      setStatus(`V0.82 外部安全壳 ON · 已拦截 ${eventCount} 次`);
    }
  }, 24);

  return true;
}

function waitForModel() {
  if (install()) return;
  setTimeout(waitForModel, 60);
}

waitForModel();

window.NIVA3DCollisionV082 = Object.freeze({
  build: BUILD,
  get enabled() { return Boolean(guard?.enabled); },
  get pairCount() { return NIVA_COLLISION_PAIRS.length; },
  get blockedFrames() { return guard?.blocked || 0; },
  get eventCount() { return eventCount; },
  get lastResult() { return lastResult; },
  recalibrate() { return guard?.calibrate() || null; },
  disable() { guard?.disable(); setStatus('V0.82 外部安全壳 OFF', true); },
  enable() { guard?.enable(); setStatus('V0.82 外部安全壳 ON'); },
  stop() {
    if (timer) clearInterval(timer);
    timer = null;
    guard?.disable();
  },
});
