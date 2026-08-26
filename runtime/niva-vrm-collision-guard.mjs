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

function sphereAt(center, radius = 0) {
  return center ? { type: 'sphere', center, radius } : null;
}

function compound(parts) {
  return { type: 'compound', parts: parts.filter(Boolean) };
}

function limbOrSphere(points, from, to, radius, t0 = 0.05, t1 = 0.96) {
  return segment(points, from, to, t0, t1, radius) || sphere(points, from, radius);
}

function primitiveDistance(a, b) {
  if (!a || !b) return Infinity;
  if (a.type === 'compound') {
    if (!a.parts.length) return Infinity;
    return Math.min(...a.parts.map((part) => primitiveDistance(part, b)));
  }
  if (b.type === 'compound') {
    if (!b.parts.length) return Infinity;
    return Math.min(...b.parts.map((part) => primitiveDistance(a, part)));
  }

  let centerDistance;
  if (a.type === 'sphere' && b.type === 'sphere') centerDistance = dist(a.center, b.center);
  else if (a.type === 'sphere' && b.type === 'segment') centerDistance = pointSegmentDistance(a.center, b.a, b.b);
  else if (a.type === 'segment' && b.type === 'sphere') centerDistance = pointSegmentDistance(b.center, a.a, a.b);
  else centerDistance = segmentSegmentDistance(a.a, a.b, b.a, b.b);
  return centerDistance - a.radius - b.radius;
}

export function buildAnatomyProxies(points, height = 1) {
  const h = Math.max(0.1, Number(height) || 1);
  const torsoAxisReady = required(points, ['hips', 'upperChest']);
  const torsoPoint = (t) => torsoAxisReady ? lerp(points.hips, points.upperChest, t) : null;

  // V0.82 uses a compound garment/body shell instead of one narrow torso capsule.
  // These radii are intentionally conservative for the current NIVA model's
  // loose upper garment and hips. Neutral-pose calibration below prevents the
  // larger shells from classifying the authored rest pose as a collision.
  const chest = torsoAxisReady
    ? { type: 'segment', a: torsoPoint(0.56), b: torsoPoint(0.97), radius: h * 0.128 }
    : null;
  const abdomen = torsoAxisReady
    ? { type: 'segment', a: torsoPoint(0.25), b: torsoPoint(0.66), radius: h * 0.120 }
    : null;
  const pelvis = compound([
    sphereAt(torsoPoint(0.08), h * 0.116),
    sphere(points, 'hips', h * 0.112),
  ]);
  const torso = compound([chest, abdomen, pelvis]);

  return {
    torso,
    chest,
    abdomen,
    pelvis,
    head: sphere(points, 'head', h * 0.088),

    // Start upper-arm capsules away from the shoulder joint so normal shoulder
    // attachment is not treated as torso penetration.
    leftUpperArm: segment(points, 'leftUpperArm', 'leftLowerArm', 0.24, 0.96, h * 0.038),
    rightUpperArm: segment(points, 'rightUpperArm', 'rightLowerArm', 0.24, 0.96, h * 0.038),
    leftForearm: segment(points, 'leftLowerArm', 'leftHand', 0.06, 0.96, h * 0.034),
    rightForearm: segment(points, 'rightLowerArm', 'rightHand', 0.06, 0.96, h * 0.034),
    leftHand: sphere(points, 'leftHand', h * 0.039),
    rightHand: sphere(points, 'rightHand', h * 0.039),

    leftThigh: segment(points, 'leftUpperLeg', 'leftLowerLeg', 0.14, 0.97, h * 0.047),
    rightThigh: segment(points, 'rightUpperLeg', 'rightLowerLeg', 0.14, 0.97, h * 0.047),
    leftShin: segment(points, 'leftLowerLeg', 'leftFoot', 0.05, 0.96, h * 0.038),
    rightShin: segment(points, 'rightLowerLeg', 'rightFoot', 0.05, 0.96, h * 0.038),
    leftFoot: limbOrSphere(points, 'leftFoot', 'leftToes', h * 0.041, 0, 1),
    rightFoot: limbOrSphere(points, 'rightFoot', 'rightToes', h * 0.041, 0, 1),
  };
}

const L_ARM = Object.freeze(['leftUpperArm', 'leftLowerArm', 'leftHand']);
const R_ARM = Object.freeze(['rightUpperArm', 'rightLowerArm', 'rightHand']);
const BOTH_ARMS = Object.freeze([...L_ARM, ...R_ARM]);
const L_LEG = Object.freeze(['leftUpperLeg', 'leftLowerLeg', 'leftFoot']);
const R_LEG = Object.freeze(['rightUpperLeg', 'rightLowerLeg', 'rightFoot']);
const BOTH_LEGS = Object.freeze([...L_LEG, ...R_LEG]);

const pair = (id, a, b, drivers, marginScale = 0.010, neutralSlackScale = 0.0015) => Object.freeze({
  id, a, b, drivers, marginScale, neutralSlackScale,
});

export const NIVA_COLLISION_PAIRS = Object.freeze([
  // Arms vs garment/body shell.
  pair('left-upperarm-torso', 'leftUpperArm', 'torso', L_ARM, 0.010),
  pair('right-upperarm-torso', 'rightUpperArm', 'torso', R_ARM, 0.010),
  pair('left-forearm-torso', 'leftForearm', 'torso', L_ARM, 0.012),
  pair('right-forearm-torso', 'rightForearm', 'torso', R_ARM, 0.012),
  pair('left-hand-torso', 'leftHand', 'torso', L_ARM, 0.014),
  pair('right-hand-torso', 'rightHand', 'torso', R_ARM, 0.014),
  pair('left-hand-pelvis', 'leftHand', 'pelvis', L_ARM, 0.012),
  pair('right-hand-pelvis', 'rightHand', 'pelvis', R_ARM, 0.012),

  // Arms vs head.
  pair('left-hand-head', 'leftHand', 'head', L_ARM, 0.010),
  pair('right-hand-head', 'rightHand', 'head', R_ARM, 0.010),
  pair('left-forearm-head', 'leftForearm', 'head', L_ARM, 0.009),
  pair('right-forearm-head', 'rightForearm', 'head', R_ARM, 0.009),

  // Upper-body self collision.
  pair('hand-cross', 'leftHand', 'rightHand', BOTH_ARMS, 0.007),
  pair('forearm-cross', 'leftForearm', 'rightForearm', BOTH_ARMS, 0.007),
  pair('upperarm-cross', 'leftUpperArm', 'rightUpperArm', BOTH_ARMS, 0.006),
  pair('left-forearm-right-upperarm', 'leftForearm', 'rightUpperArm', BOTH_ARMS, 0.006),
  pair('right-forearm-left-upperarm', 'rightForearm', 'leftUpperArm', BOTH_ARMS, 0.006),

  // Legs against each other.
  pair('thigh-cross', 'leftThigh', 'rightThigh', BOTH_LEGS, 0.008),
  pair('shin-cross', 'leftShin', 'rightShin', BOTH_LEGS, 0.007),
  pair('foot-cross', 'leftFoot', 'rightFoot', BOTH_LEGS, 0.006),
  pair('left-thigh-right-shin', 'leftThigh', 'rightShin', BOTH_LEGS, 0.007),
  pair('right-thigh-left-shin', 'rightThigh', 'leftShin', BOTH_LEGS, 0.007),
  pair('left-foot-right-shin', 'leftFoot', 'rightShin', BOTH_LEGS, 0.006),
  pair('right-foot-left-shin', 'rightFoot', 'leftShin', BOTH_LEGS, 0.006),

  // Hands/forearms vs legs and hips.
  pair('left-hand-left-thigh', 'leftHand', 'leftThigh', L_ARM, 0.009),
  pair('left-hand-right-thigh', 'leftHand', 'rightThigh', L_ARM, 0.009),
  pair('right-hand-right-thigh', 'rightHand', 'rightThigh', R_ARM, 0.009),
  pair('right-hand-left-thigh', 'rightHand', 'leftThigh', R_ARM, 0.009),
  pair('left-forearm-left-thigh', 'leftForearm', 'leftThigh', L_ARM, 0.007),
  pair('left-forearm-right-thigh', 'leftForearm', 'rightThigh', L_ARM, 0.007),
  pair('right-forearm-right-thigh', 'rightForearm', 'rightThigh', R_ARM, 0.007),
  pair('right-forearm-left-thigh', 'rightForearm', 'leftThigh', R_ARM, 0.007),

  // V0.90 predictive full-body coverage: no chain may tunnel through another.
  pair('left-upperarm-head', 'leftUpperArm', 'head', L_ARM, 0.012),
  pair('right-upperarm-head', 'rightUpperArm', 'head', R_ARM, 0.012),
  pair('left-upperarm-pelvis', 'leftUpperArm', 'pelvis', L_ARM, 0.012),
  pair('right-upperarm-pelvis', 'rightUpperArm', 'pelvis', R_ARM, 0.012),
  pair('left-forearm-pelvis', 'leftForearm', 'pelvis', L_ARM, 0.014),
  pair('right-forearm-pelvis', 'rightForearm', 'pelvis', R_ARM, 0.014),

  pair('left-hand-left-shin', 'leftHand', 'leftShin', L_ARM, 0.011),
  pair('left-hand-right-shin', 'leftHand', 'rightShin', L_ARM, 0.011),
  pair('right-hand-left-shin', 'rightHand', 'leftShin', R_ARM, 0.011),
  pair('right-hand-right-shin', 'rightHand', 'rightShin', R_ARM, 0.011),
  pair('left-hand-left-foot', 'leftHand', 'leftFoot', L_ARM, 0.010),
  pair('left-hand-right-foot', 'leftHand', 'rightFoot', L_ARM, 0.010),
  pair('right-hand-left-foot', 'rightHand', 'leftFoot', R_ARM, 0.010),
  pair('right-hand-right-foot', 'rightHand', 'rightFoot', R_ARM, 0.010),
  pair('left-forearm-left-shin', 'leftForearm', 'leftShin', L_ARM, 0.009),
  pair('left-forearm-right-shin', 'leftForearm', 'rightShin', L_ARM, 0.009),
  pair('right-forearm-left-shin', 'rightForearm', 'leftShin', R_ARM, 0.009),
  pair('right-forearm-right-shin', 'rightForearm', 'rightShin', R_ARM, 0.009),

  pair('left-thigh-torso', 'leftThigh', 'torso', L_LEG, 0.012),
  pair('right-thigh-torso', 'rightThigh', 'torso', R_LEG, 0.012),
  pair('left-shin-torso', 'leftShin', 'torso', L_LEG, 0.012),
  pair('right-shin-torso', 'rightShin', 'torso', R_LEG, 0.012),
  pair('left-foot-torso', 'leftFoot', 'torso', L_LEG, 0.012),
  pair('right-foot-torso', 'rightFoot', 'torso', R_LEG, 0.012),
  pair('left-thigh-head', 'leftThigh', 'head', L_LEG, 0.010),
  pair('right-thigh-head', 'rightThigh', 'head', R_LEG, 0.010),
  pair('left-shin-head', 'leftShin', 'head', L_LEG, 0.010),
  pair('right-shin-head', 'rightShin', 'head', R_LEG, 0.010),
  pair('left-foot-head', 'leftFoot', 'head', L_LEG, 0.010),
  pair('right-foot-head', 'rightFoot', 'head', R_LEG, 0.010),
]);

export function measureCollisionPairs(points, height = 1) {
  const proxies = buildAnatomyProxies(points, height);
  return NIVA_COLLISION_PAIRS.map((entry) => ({
    ...entry,
    clearance: primitiveDistance(proxies[entry.a], proxies[entry.b]),
  }));
}

export function calibrateCollisionThresholds(points, height = 1) {
  const h = Math.max(0.1, Number(height) || 1);
  const baseline = measureCollisionPairs(points, h);

  // V0.81 allowed a moving limb to consume roughly 28% of its neutral
  // clearance before blocking. That is too late for bulky clothing because the
  // bone centerline can still be outside while the rendered mesh already clips.
  // V0.82 instead allows only a tiny model-scale approach beyond the authored
  // neutral pose, and otherwise keeps a positive visual safety shell.
  return Object.fromEntries(baseline.map((item) => {
    const desiredVisualGap = h * item.marginScale;
    const neutralSlack = h * item.neutralSlackScale;
    const threshold = Number.isFinite(item.clearance)
      ? Math.min(desiredVisualGap, item.clearance - neutralSlack)
      : desiredVisualGap;
    return [item.id, threshold];
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
