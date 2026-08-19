const axis = (min, max, neutral = 0, demo = 0) => Object.freeze({ min, max, neutral, demo });
const bone = (label, group, x, y, z, maxSpeed = 60, maxAccel = 180) => Object.freeze({
  label, group, x, y, z, maxSpeed, maxAccel,
});

const mirrorFinger = (name, label, segment, leftRange, rightRange, demo, speed = 95) => ({
  [`left${name}${segment}`]: bone(`左${label}${segment === 'Proximal' ? '近节' : segment === 'Intermediate' ? '中节' : '远节'}`, '手指', axis(-8, 8, 0, 2), axis(leftRange[0], leftRange[1], 0, -demo), axis(-8, 8, 0, 2), speed, 260),
  [`right${name}${segment}`]: bone(`右${label}${segment === 'Proximal' ? '近节' : segment === 'Intermediate' ? '中节' : '远节'}`, '手指', axis(-8, 8, 0, 2), axis(rightRange[0], rightRange[1], 0, demo), axis(-8, 8, 0, 2), speed, 260),
});

const fingerEntries = {};
for (const [name, label] of [['Index','食指'], ['Middle','中指'], ['Ring','无名指'], ['Little','小指']]) {
  Object.assign(fingerEntries, mirrorFinger(name, label, 'Proximal', [-80, 12], [-12, 80], 16));
  Object.assign(fingerEntries, mirrorFinger(name, label, 'Intermediate', [-100, 5], [-5, 100], 20));
  Object.assign(fingerEntries, mirrorFinger(name, label, 'Distal', [-80, 5], [-5, 80], 16));
}

export const NIVA_VRM_BONE_LIMITS = Object.freeze({
  hips: bone('骨盆', '躯干', axis(-8, 10, 0, 2.5), axis(-12, 12, 0, 4), axis(-7, 7, 0, 3), 24, 80),
  spine: bone('腰椎', '躯干', axis(-5, 7, 0, 2.5), axis(-8, 8, 0, 3), axis(-5, 5, 0, 2), 20, 70),
  chest: bone('胸椎', '躯干', axis(-7, 9, 0, 3.5), axis(-10, 10, 0, 4), axis(-6, 6, 0, 2.5), 22, 75),
  upperChest: bone('上胸', '躯干', axis(-5, 7, 0, 2.5), axis(-8, 8, 0, 3), axis(-5, 5, 0, 2), 20, 70),
  neck: bone('颈部', '头颈', axis(-20, 25, 0, 7), axis(-35, 35, 0, 12), axis(-18, 18, 0, 6), 38, 130),
  head: bone('头部', '头颈', axis(-12, 15, 0, 5), axis(-20, 20, 0, 8), axis(-12, 12, 0, 4), 42, 150),
  leftEye: bone('左眼', '眼睛', axis(-10, 10, 0, 4), axis(-15, 15, 0, 8), axis(0, 0, 0, 0), 90, 320),
  rightEye: bone('右眼', '眼睛', axis(-10, 10, 0, 4), axis(-15, 15, 0, 8), axis(0, 0, 0, 0), 90, 320),

  leftShoulder: bone('左肩胛', '上肢', axis(-12, 12, 0, 3), axis(-10, 10, 0, 3), axis(-12, 16, 0, 4), 35, 120),
  rightShoulder: bone('右肩胛', '上肢', axis(-12, 12, 0, 3), axis(-10, 10, 0, 3), axis(-16, 12, 0, -4), 35, 120),
  leftUpperArm: bone('左上臂/肩', '上肢', axis(-45, 90, 0, 10), axis(-55, 55, 0, 7), axis(-165, -10, -75, 12), 62, 190),
  rightUpperArm: bone('右上臂/肩', '上肢', axis(-45, 90, 0, -10), axis(-55, 55, 0, -7), axis(10, 165, 75, -12), 62, 190),
  leftLowerArm: bone('左肘', '上肢', axis(-8, 8, 0, 2), axis(-130, 3, -24, -18), axis(-8, 8, 0, 2), 78, 240),
  rightLowerArm: bone('右肘', '上肢', axis(-8, 8, 0, -2), axis(-3, 130, 24, 18), axis(-8, 8, 0, -2), 78, 240),
  leftHand: bone('左腕', '上肢', axis(-55, 55, 0, 10), axis(-22, 22, 0, 5), axis(-25, 35, 0, 8), 72, 230),
  rightHand: bone('右腕', '上肢', axis(-55, 55, 0, -10), axis(-22, 22, 0, -5), axis(-35, 25, 0, -8), 72, 230),

  leftThumbMetacarpal: bone('左拇指掌骨', '手指', axis(-20, 35, 0, 6), axis(-35, 20, 0, -8), axis(-25, 25, 0, 5), 80, 250),
  leftThumbProximal: bone('左拇指近节', '手指', axis(-12, 12, 0, 2), axis(-55, 10, 0, -12), axis(-15, 15, 0, 3), 90, 260),
  leftThumbDistal: bone('左拇指远节', '手指', axis(-10, 10, 0, 2), axis(-70, 8, 0, -15), axis(-10, 10, 0, 2), 95, 270),
  rightThumbMetacarpal: bone('右拇指掌骨', '手指', axis(-20, 35, 0, -6), axis(-20, 35, 0, 8), axis(-25, 25, 0, -5), 80, 250),
  rightThumbProximal: bone('右拇指近节', '手指', axis(-12, 12, 0, -2), axis(-10, 55, 0, 12), axis(-15, 15, 0, -3), 90, 260),
  rightThumbDistal: bone('右拇指远节', '手指', axis(-10, 10, 0, -2), axis(-8, 70, 0, 15), axis(-10, 10, 0, -2), 95, 270),
  ...fingerEntries,

  leftUpperLeg: bone('左髋', '下肢', axis(-25, 90, 0, 10), axis(-35, 35, 0, 5), axis(-38, 22, 0, 6), 48, 150),
  rightUpperLeg: bone('右髋', '下肢', axis(-25, 90, 0, -10), axis(-35, 35, 0, -5), axis(-22, 38, 0, -6), 48, 150),
  leftLowerLeg: bone('左膝', '下肢', axis(-3, 125, 5, 12), axis(-6, 6, 0, 2), axis(-5, 5, 0, 2), 68, 210),
  rightLowerLeg: bone('右膝', '下肢', axis(-3, 125, 5, 12), axis(-6, 6, 0, -2), axis(-5, 5, 0, -2), 68, 210),
  leftFoot: bone('左踝/足', '下肢', axis(-20, 35, 0, 7), axis(-10, 10, 0, 3), axis(-18, 15, 0, 5), 55, 170),
  rightFoot: bone('右踝/足', '下肢', axis(-20, 35, 0, -7), axis(-10, 10, 0, -3), axis(-15, 18, 0, -5), 55, 170),
  leftToes: bone('左足趾', '下肢', axis(-15, 35, 0, 5), axis(-6, 6, 0, 2), axis(-5, 5, 0, 2), 60, 190),
  rightToes: bone('右足趾', '下肢', axis(-15, 35, 0, -5), axis(-6, 6, 0, -2), axis(-5, 5, 0, -2), 60, 190),
});

export const NIVA_VRM_EXPECTED_BONES = Object.freeze([
  'hips','spine','chest','upperChest','neck','head','leftEye','rightEye',
  'leftShoulder','rightShoulder','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftHand','rightHand',
  'leftThumbMetacarpal','leftThumbProximal','leftThumbDistal','rightThumbMetacarpal','rightThumbProximal','rightThumbDistal',
  'leftIndexProximal','leftIndexIntermediate','leftIndexDistal','rightIndexProximal','rightIndexIntermediate','rightIndexDistal',
  'leftMiddleProximal','leftMiddleIntermediate','leftMiddleDistal','rightMiddleProximal','rightMiddleIntermediate','rightMiddleDistal',
  'leftRingProximal','leftRingIntermediate','leftRingDistal','rightRingProximal','rightRingIntermediate','rightRingDistal',
  'leftLittleProximal','leftLittleIntermediate','leftLittleDistal','rightLittleProximal','rightLittleIntermediate','rightLittleDistal',
  'leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg','leftFoot','rightFoot','leftToes','rightToes',
]);

export const NIVA_VRM_GROUPS = Object.freeze(['躯干','头颈','眼睛','上肢','手指','下肢']);

export function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.min(max, Math.max(min, 0));
  return Math.min(max, Math.max(min, n));
}

export function clampBoneRotation(boneName, rotation = {}) {
  const limit = NIVA_VRM_BONE_LIMITS[boneName];
  if (!limit) throw new Error(`Unsupported NIVA VRM bone: ${boneName}`);
  return {
    x: clamp(rotation.x ?? limit.x.neutral, limit.x.min, limit.x.max),
    y: clamp(rotation.y ?? limit.y.neutral, limit.y.min, limit.y.max),
    z: clamp(rotation.z ?? limit.z.neutral, limit.z.min, limit.z.max),
  };
}

export function neutralPose() {
  return Object.fromEntries(Object.entries(NIVA_VRM_BONE_LIMITS).map(([name, l]) => [name, {
    x: l.x.neutral, y: l.y.neutral, z: l.z.neutral,
  }]));
}

function randomAxisTarget(a, intensity, random, edgeChance) {
  if (a.min === a.max) return a.min;
  const safeIntensity = clamp(intensity, 0, 1);
  const lo = a.neutral + (a.min - a.neutral) * safeIntensity;
  const hi = a.neutral + (a.max - a.neutral) * safeIntensity;
  const r = clamp(random(), 0, 1);
  const edge = clamp(edgeChance, 0, 0.8);
  if (r < edge / 2) return lo;
  if (r < edge) return hi;
  const u = edge >= 1 ? 0.5 : (r - edge) / (1 - edge);
  return lo + (hi - lo) * u;
}

export function randomSafePose(intensity = 1, random = Math.random, edgeChance = 0.36) {
  const safeIntensity = clamp(intensity, 0, 1);
  const pose = {};
  for (const [name, l] of Object.entries(NIVA_VRM_BONE_LIMITS)) {
    pose[name] = clampBoneRotation(name, {
      x: randomAxisTarget(l.x, safeIntensity, random, edgeChance),
      y: randomAxisTarget(l.y, safeIntensity, random, edgeChance),
      z: randomAxisTarget(l.z, safeIntensity, random, edgeChance),
    });
  }
  return pose;
}

export function safeDemoPose(timeSeconds, intensity = 1) {
  const safeIntensity = clamp(intensity, 0, 1);
  const pose = {};
  let i = 0;
  for (const [name, l] of Object.entries(NIVA_VRM_BONE_LIMITS)) {
    const phase = i * 0.731;
    const period = 4.8 + (i % 7) * 0.56;
    const w = (Math.PI * 2) / period;
    const wave = Math.sin(timeSeconds * w + phase);
    const wave2 = Math.sin(timeSeconds * w * 0.61 + phase * 1.7);
    pose[name] = clampBoneRotation(name, {
      x: l.x.neutral + l.x.demo * safeIntensity * wave,
      y: l.y.neutral + l.y.demo * safeIntensity * wave2,
      z: l.z.neutral + l.z.demo * safeIntensity * (0.72 * wave + 0.28 * wave2),
    });
    i += 1;
  }
  return pose;
}

export function validateLimitTable() {
  const missing = NIVA_VRM_EXPECTED_BONES.filter((name) => !NIVA_VRM_BONE_LIMITS[name]);
  const extra = Object.keys(NIVA_VRM_BONE_LIMITS).filter((name) => !NIVA_VRM_EXPECTED_BONES.includes(name));
  const invalid = [];
  for (const [name, l] of Object.entries(NIVA_VRM_BONE_LIMITS)) {
    for (const key of ['x','y','z']) {
      const a = l[key];
      if (!(a.min <= a.neutral && a.neutral <= a.max)) invalid.push(`${name}.${key}: neutral out of range`);
      if (!(Math.abs(a.demo) <= Math.max(Math.abs(a.min - a.neutral), Math.abs(a.max - a.neutral)))) invalid.push(`${name}.${key}: demo amplitude invalid`);
    }
    if (!(l.maxSpeed > 0) || !(l.maxAccel > 0)) invalid.push(`${name}: speed/accel invalid`);
  }
  return { ok: missing.length === 0 && extra.length === 0 && invalid.length === 0, missing, extra, invalid };
}
