const EPS = 1e-9;

const v = (x = 0, y = 0, z = 0) => ({ x, y, z });
const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const add = (a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z);
const mul = (a, s) => v(a.x * s, a.y * s, a.z * s);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len2 = (a) => dot(a, a);
const dist = (a, b) => Math.sqrt(len2(sub(a, b)));
const lerp = (a, b, t) => add(a, mul(sub(b, a), t));
const clamp01 = (n) => Math.max(0, Math.min(1, n));

export function pointSegmentDistance(point, a, b) {
  const ab = sub(b, a);
  const denom = len2(ab);
  if (denom < EPS) return dist(point, a);
  const t = clamp01(dot(sub(point, a), ab) / denom);
  return dist(point, add(a, mul(ab, t)));
}

export function segmentSegmentDistance(p1, q1, p2, q2) {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s;
  let t;

  if (a <= EPS && e <= EPS) return dist(p1, p2);
  if (a <= EPS) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = dot(d1, r);
    if (e <= EPS) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }

  const c1 = add(p1, mul(d1, s));
  const c2 = add(p2, mul(d2, t));
  return dist(c1, c2);
}

function required(points, names) {
  return names.every((name) => points[name]);
}

function segment(points, from, to, t0 = 0, t1 = 1, radius = 0) {
  if (!required(points, [from, to])) return null;
  return {
    type: 'segment',
    a: lerp(points[from], points[to], t0),
    b: lerp(points[from], points[to], t1),
    radius,
  };
}

function sphere(points, bone, radius = 0) {
  if (!points[bone]) return null;
  return { type: 'sphere', center: points[bone], radius };
}

function primitiveDistance(a, b) {
  if (!a || !b) return Infinity;
  let centerDistance;
  if (a.type === 'sphere' && b.type === 'sphere') centerDistance = dist(a.center, b.center);
  else if (a.type === 'sphere' && b.type === 'segment') centerDistance = pointSegmentDistance(a.center, b.a, b.b);
  else if (a.type === 'segment' && b.type === 'sphere') centerDistance = pointSegmentDistance(b.center, a.a, a.b);
  else centerDistance = segmentSegmentDistance(a.a, a.b, b.a, b.b);
  return centerDistance - a.radius - b.radius;
}

export function buildAnatomyProxies(points, height = 1) {
  const h = Math.max(0.1, Number(height) || 1);
  return {
    torso: segment(points, 'hips', 'upperChest', 0.12, 0.96, h * 0.09),
    head: sphere(points, 'head', h * 0.075),

    leftUpperArm: segment(points, 'leftUpperArm', 'leftLowerArm', 0.08, 0.96, h * 0.028),
    rightUpperArm: segment(points, 'rightUpperArm', 'rightLowerArm', 0.08, 0.96, h * 0.028),
    leftForearm: segment(points, 'leftLowerArm', 'leftHand', 0.05, 0.96, h * 0.024),
    rightForearm: segment(points, 'rightLowerArm', 'rightHand', 0.05, 0.96, h * 0.024),
    leftHand: sphere(points, 'leftHand', h * 0.028),
    rightHand: sphere(points, 'rightHand', h * 0.028),

    leftThigh: segment(points, 'leftUpperLeg', 'leftLowerLeg', 0.16, 0.97, h * 0.036),
    rightThigh: segment(points, 'rightUpperLeg', 'rightLowerLeg', 0.16, 0.97, h * 0.036),
    leftShin: segment(points, 'leftLowerLeg', 'leftFoot', 0.05, 0.96, h * 0.03),
    rightShin: segment(points, 'rightLowerLeg', 'rightFoot', 0.05, 0.96, h * 0.03),
  };
}

const L_ARM = Object.freeze(['leftUpperArm', 'leftLowerArm', 'leftHand']);
const R_ARM = Object.freeze(['rightUpperArm', 'rightLowerArm', 'rightHand']);
const BOTH_ARMS = Object.freeze([...L_ARM, ...R_ARM]);
const BOTH_LEGS = Object.freeze(['leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot']);

export const NIVA_COLLISION_PAIRS = Object.freeze([
  { id: 'left-hand-torso', a: 'leftHand', b: 'torso', drivers: L_ARM },
  { id: 'right-hand-torso', a: 'rightHand', b: 'torso', drivers: R_ARM },
  { id: 'left-forearm-torso', a: 'leftForearm', b: 'torso', drivers: L_ARM },
  { id: 'right-forearm-torso', a: 'rightForearm', b: 'torso', drivers: R_ARM },
  { id: 'left-hand-head', a: 'leftHand', b: 'head', drivers: L_ARM },
  { id: 'right-hand-head', a: 'rightHand', b: 'head', drivers: R_ARM },
  { id: 'left-forearm-head', a: 'leftForearm', b: 'head', drivers: L_ARM },
  { id: 'right-forearm-head', a: 'rightForearm', b: 'head', drivers: R_ARM },

  { id: 'forearm-cross', a: 'leftForearm', b: 'rightForearm', drivers: BOTH_ARMS },
  { id: 'left-forearm-right-upperarm', a: 'leftForearm', b: 'rightUpperArm', drivers: BOTH_ARMS },
  { id: 'right-forearm-left-upperarm', a: 'rightForearm', b: 'leftUpperArm', drivers: BOTH_ARMS },

  { id: 'thigh-cross', a: 'leftThigh', b: 'rightThigh', drivers: BOTH_LEGS },
  { id: 'shin-cross', a: 'leftShin', b: 'rightShin', drivers: BOTH_LEGS },
  { id: 'left-thigh-right-shin', a: 'leftThigh', b: 'rightShin', drivers: BOTH_LEGS },
  { id: 'right-thigh-left-shin', a: 'rightThigh', b: 'leftShin', drivers: BOTH_LEGS },

  { id: 'left-hand-left-thigh', a: 'leftHand', b: 'leftThigh', drivers: L_ARM },
  { id: 'left-hand-right-thigh', a: 'leftHand', b: 'rightThigh', drivers: L_ARM },
  { id: 'right-hand-right-thigh', a: 'rightHand', b: 'rightThigh', drivers: R_ARM },
  { id: 'right-hand-left-thigh', a: 'rightHand', b: 'leftThigh', drivers: R_ARM },
]);

export function measureCollisionPairs(points, height = 1) {
  const proxies = buildAnatomyProxies(points, height);
  return NIVA_COLLISION_PAIRS.map((pair) => ({
    ...pair,
    clearance: primitiveDistance(proxies[pair.a], proxies[pair.b]),
  }));
}

export function calibrateCollisionThresholds(points, height = 1) {
  const h = Math.max(0.1, Number(height) || 1);
  const baseline = measureCollisionPairs(points, h);
  const hardFloor = -h * 0.006;
  const warningMargin = h * 0.008;
  return Object.fromEntries(baseline.map((item) => {
    const baselineGuard = Math.max(hardFloor, item.clearance * 0.72);
    return [item.id, Math.min(baselineGuard, warningMargin)];
  }));
}

export function detectAnatomicalCollisions(points, height = 1, thresholds = null) {
  const h = Math.max(0.1, Number(height) || 1);
  const activeThresholds = thresholds || calibrateCollisionThresholds(points, h);
  const measurements = measureCollisionPairs(points, h);
  return measurements
    .filter((item) => Number.isFinite(item.clearance) && item.clearance <= (activeThresholds[item.id] ?? 0))
    .map((item) => ({
      id: item.id,
      clearance: item.clearance,
      threshold: activeThresholds[item.id] ?? 0,
      drivers: [...item.drivers],
    }));
}

export function createAnatomicalCollisionGuard({
  getPoints,
  getHeight,
  capturePose,
  rollbackPose,
  onCollision = () => {},
  cooldownMs = 220,
} = {}) {
  if (typeof getPoints !== 'function') throw new Error('getPoints is required');
  if (typeof capturePose !== 'function') throw new Error('capturePose is required');
  if (typeof rollbackPose !== 'function') throw new Error('rollbackPose is required');

  let thresholds = null;
  let lastSafePose = null;
  let lastEventAt = -Infinity;
  let blocked = 0;
  let lastCollisions = [];
  let enabled = true;

  function calibrate() {
    const points = getPoints();
    const height = Math.max(0.1, Number(getHeight?.()) || 1);
    thresholds = calibrateCollisionThresholds(points, height);
    lastSafePose = capturePose();
    lastCollisions = [];
    return { thresholds: { ...thresholds }, pairCount: NIVA_COLLISION_PAIRS.length };
  }

  function inspect(now = 0) {
    if (!enabled) return { safe: true, collisions: [], blocked };
    if (!thresholds) calibrate();
    const points = getPoints();
    const height = Math.max(0.1, Number(getHeight?.()) || 1);
    const collisions = detectAnatomicalCollisions(points, height, thresholds);
    lastCollisions = collisions;

    if (collisions.length === 0) {
      lastSafePose = capturePose();
      return { safe: true, collisions: [], blocked };
    }

    const driverBones = [...new Set(collisions.flatMap((c) => c.drivers))];
    if (lastSafePose && driverBones.length) rollbackPose(lastSafePose, driverBones);
    blocked += 1;

    if (now - lastEventAt >= cooldownMs) {
      lastEventAt = now;
      onCollision({ collisions, bones: driverBones, blocked });
    }
    return { safe: false, collisions, bones: driverBones, blocked };
  }

  return Object.freeze({
    calibrate,
    inspect,
    enable() { enabled = true; },
    disable() { enabled = false; },
    get enabled() { return enabled; },
    get blocked() { return blocked; },
    get lastCollisions() { return [...lastCollisions]; },
    get thresholds() { return thresholds ? { ...thresholds } : null; },
  });
}
