const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const gaussian = (x, center, width) => Math.exp(-Math.pow((x - center) / width, 2));

export class CriticallyDampedScalar {
  constructor(value = 0, omega = 10) {
    this.value = value;
    this.velocity = 0;
    this.omega = Math.max(0.01, omega);
  }

  reset(value = 0) {
    this.value = value;
    this.velocity = 0;
  }

  step(target, dt) {
    const h = clamp(Number(dt) || 0, 0, 0.05);
    if (h <= 0) return this.value;
    const w = this.omega;
    const y = this.value - target;
    const j = this.velocity + w * y;
    const e = Math.exp(-w * h);
    this.value = target + (y + j * h) * e;
    this.velocity = (this.velocity - w * j * h) * e;
    return this.value;
  }
}

export function weightedCenterOfMass(samples = []) {
  let total = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const sample of samples) {
    const mass = Math.max(0, Number(sample?.mass) || 0);
    const p = sample?.position;
    if (!mass || !p) continue;
    total += mass;
    x += (Number(p.x) || 0) * mass;
    y += (Number(p.y) || 0) * mass;
    z += (Number(p.z) || 0) * mass;
  }
  if (!total) return null;
  return { x: x / total, y: y / total, z: z / total, mass: total };
}

export const HUMANOID_MASS_WEIGHTS = Object.freeze({
  hips: 0.14,
  spine: 0.12,
  chest: 0.20,
  head: 0.08,
  leftUpperArm: 0.03,
  rightUpperArm: 0.03,
  leftLowerArm: 0.02,
  rightLowerArm: 0.02,
  leftHand: 0.01,
  rightHand: 0.01,
  leftUpperLeg: 0.10,
  rightUpperLeg: 0.10,
  leftLowerLeg: 0.0465,
  rightLowerLeg: 0.0465,
  leftFoot: 0.0145,
  rightFoot: 0.0145,
});

export function supportCenter({ leftFoot = null, rightFoot = null, stance = {} } = {}) {
  const left = Boolean(stance.left && leftFoot);
  const right = Boolean(stance.right && rightFoot);
  if (left && !right) return { x: leftFoot.x, y: leftFoot.y, z: leftFoot.z, support: 'left' };
  if (right && !left) return { x: rightFoot.x, y: rightFoot.y, z: rightFoot.z, support: 'right' };
  if (leftFoot && rightFoot) {
    return {
      x: (leftFoot.x + rightFoot.x) * 0.5,
      y: (leftFoot.y + rightFoot.y) * 0.5,
      z: (leftFoot.z + rightFoot.z) * 0.5,
      support: left && right ? 'double' : 'feet-center',
    };
  }
  const p = leftFoot || rightFoot;
  return p ? { x: p.x, y: p.y, z: p.z, support: leftFoot ? 'left' : 'right' } : null;
}

function dotXZ(a, b) {
  return (a?.x || 0) * (b?.x || 0) + (a?.z || 0) * (b?.z || 0);
}

function pose(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export class GaitBalanceController {
  constructor({ modelHeight = 1.6 } = {}) {
    this.modelHeight = Math.max(0.5, modelHeight);
    this.shiftRight = new CriticallyDampedScalar(0, 11);
    this.shiftForward = new CriticallyDampedScalar(0, 10);
    this.roll = new CriticallyDampedScalar(0, 12);
    this.pitch = new CriticallyDampedScalar(0, 10);
    this.vertical = new CriticallyDampedScalar(0, 14);
    this.supportBias = new CriticallyDampedScalar(0, 13);
    this.stabilityDemand = new CriticallyDampedScalar(0, 9);
    this.last = null;
  }

  update(dt, {
    action = 'idle',
    phase = 0,
    stance = {},
    centerOfMass = null,
    leftFoot = null,
    rightFoot = null,
    forward = { x: 0, z: 1 },
    right = { x: 1, z: 0 },
    grounded = true,
  } = {}) {
    const h = this.modelHeight;
    const support = supportCenter({ leftFoot, rightFoot, stance });
    const locomotion = action === 'walk' || action === 'run';
    const running = action === 'run';
    const supportSide = support?.support === 'left' ? -1 : support?.support === 'right' ? 1 : 0;

    let errorRight = 0;
    let errorForward = 0;
    if (support && centerOfMass) {
      const correction = {
        x: support.x - centerOfMass.x,
        z: support.z - centerOfMass.z,
      };
      errorRight = dotXZ(correction, right);
      errorForward = dotXZ(correction, forward);
    }

    const maxSide = h * (running ? 0.026 : 0.020);
    const maxForward = h * (running ? 0.030 : 0.018);
    const feedForwardSide = locomotion ? supportSide * h * (running ? 0.010 : 0.0075) : 0;
    const targetRight = grounded ? clamp(errorRight * 0.62 + feedForwardSide, -maxSide, maxSide) : 0;
    const targetForward = grounded ? clamp(errorForward * 0.42 + (locomotion ? h * (running ? 0.010 : 0.004) : 0), -maxForward, maxForward) : 0;

    const gait = ((Number(phase) % 1) + 1) % 1;
    const doubleStep = Math.cos(gait * Math.PI * 4);
    const targetVertical = locomotion && grounded
      ? -h * (running ? 0.010 : 0.0055) * (0.5 + 0.5 * doubleStep)
      : 0;

    const targetRoll = grounded
      ? clamp((targetRight / h) * 95 + supportSide * (locomotion ? (running ? 1.35 : 0.85) : 0), -4.5, 4.5)
      : 0;
    const targetPitch = grounded
      ? clamp((targetForward / h) * 80 + (locomotion ? (running ? 5.2 : 1.8) : 0), -2.5, 8)
      : 0;

    const rawDemand = grounded
      ? clamp(Math.hypot(errorRight, errorForward) / Math.max(h * (running ? 0.050 : 0.042), 1e-6) + (locomotion ? 0.08 : 0), 0, 1)
      : 0;
    const demand = this.stabilityDemand.step(rawDemand, dt);
    const supportBias = this.supportBias.step(supportSide, dt);
    const roll = this.roll.step(targetRoll, dt);
    const pitch = this.pitch.step(targetPitch, dt);
    const leftLoad = clamp(0.5 - supportBias * 0.5, 0, 1);
    const rightLoad = clamp(0.5 + supportBias * 0.5, 0, 1);

    const kneeBase = locomotion ? (running ? 2.8 : 1.15) : 0;
    const kneeAbsorb = demand * (running ? 3.0 : 1.9);
    const leftKnee = clamp((kneeBase + kneeAbsorb) * (0.72 + leftLoad * 0.38), 0, 6.5);
    const rightKnee = clamp((kneeBase + kneeAbsorb) * (0.72 + rightLoad * 0.38), 0, 6.5);
    const anklePitch = clamp(-pitch * 0.11 - demand * 0.35, -1.8, 1.2);
    const ankleRoll = clamp(roll * 0.12, -0.9, 0.9);
    const armCounter = clamp(-roll * 0.36 - supportBias * (locomotion ? 0.52 : 0), -2.2, 2.2);
    const hipSide = clamp(-roll * 0.12 - supportBias * demand * 0.45, -1.15, 1.15);

    const fullBody = {
      hips: pose(pitch * 0.18, 0, -roll * 0.48),
      spine: pose(pitch * 0.31, 0, -roll * 0.28),
      chest: pose(pitch * 0.25, 0, -roll * 0.16),
      upperChest: pose(pitch * 0.13, 0, -roll * 0.07),
      neck: pose(-pitch * 0.10, 0, roll * 0.10),
      head: pose(-pitch * 0.08, 0, roll * 0.08),
      leftShoulder: pose(0, 0, -armCounter * 0.22),
      rightShoulder: pose(0, 0, armCounter * 0.22),
      leftUpperArm: pose(0, 0, -armCounter * 0.62),
      rightUpperArm: pose(0, 0, armCounter * 0.62),
      leftLowerArm: pose(0, -armCounter * 0.14, 0),
      rightLowerArm: pose(0, armCounter * 0.14, 0),
      leftUpperLeg: pose(-pitch * 0.045, 0, hipSide),
      rightUpperLeg: pose(-pitch * 0.045, 0, hipSide),
      leftLowerLeg: pose(leftKnee, 0, 0),
      rightLowerLeg: pose(rightKnee, 0, 0),
      leftFoot: pose(anklePitch, 0, ankleRoll),
      rightFoot: pose(anklePitch, 0, ankleRoll),
    };

    this.last = {
      support: support?.support || 'none',
      com: centerOfMass ? { ...centerOfMass } : null,
      supportCenter: support ? { x: support.x, y: support.y, z: support.z } : null,
      comErrorRight: errorRight,
      comErrorForward: errorForward,
      stabilityDemand: demand,
      supportBias,
      leftLoad,
      rightLoad,
      rootShiftRight: this.shiftRight.step(targetRight, dt),
      rootShiftForward: this.shiftForward.step(targetForward, dt),
      torsoRollDeg: roll,
      torsoPitchDeg: pitch,
      verticalOffset: this.vertical.step(targetVertical, dt),
      fullBody,
      phase: gait,
      grounded: Boolean(grounded),
    };
    return this.last;
  }
}

export class PhysiologyOscillator {
  constructor() {
    this.breathPhase = 0;
    this.heartPhase = 0;
    this.breathEnvelope = 0;
    this.deepBreathEnvelope = 0;
  }

  reset() {
    this.breathPhase = 0;
    this.heartPhase = 0;
    this.breathEnvelope = 0;
    this.deepBreathEnvelope = 0;
  }

  update(dt, {
    breathsPerMinute = 12,
    heartRate = 68,
    breathAmplitude = 0.35,
    deepBreath = false,
    load = 0,
  } = {}) {
    const h = clamp(Number(dt) || 0, 0, 0.05);
    const br = clamp(Number(breathsPerMinute) || 12, 4, 50);
    const hr = clamp(Number(heartRate) || 68, 35, 220);
    this.breathPhase = (this.breathPhase + h * br / 60) % 1;
    this.heartPhase = (this.heartPhase + h * hr / 60) % 1;
    this.breathEnvelope += (1 - this.breathEnvelope) * (1 - Math.exp(-h * 3.2));

    const deepTarget = deepBreath ? 1 : 0;
    const deepRate = deepTarget > this.deepBreathEnvelope ? 2.8 : 1.65;
    this.deepBreathEnvelope += (deepTarget - this.deepBreathEnvelope) * (1 - Math.exp(-h * deepRate));
    const deepMix = clamp(this.deepBreathEnvelope, 0, 1);
    const inhaleFraction = 0.40 + 0.06 * deepMix;
    const p = this.breathPhase;
    const lungVolume = p < inhaleFraction
      ? smoothstep(p / inhaleFraction)
      : 1 - smoothstep((p - inhaleFraction) / (1 - inhaleFraction));
    const centeredBreath = (lungVolume - 0.45) * (1 + 0.65 * deepMix) * this.breathEnvelope;
    const amp = clamp(Number(breathAmplitude) || 0, 0, 1.2) * (1 + clamp(load, 0, 1) * 0.25);

    const hp = this.heartPhase;
    const heartbeat = gaussian(hp, 0.055, 0.026) * 0.72
      + gaussian(hp, 0.16, 0.038) * 0.28
      + gaussian(hp, 0.31, 0.055) * 0.08;
    const heartDeg = heartbeat * (0.035 + clamp(load, 0, 1) * 0.025);

    return {
      breathPhase: this.breathPhase,
      heartPhase: this.heartPhase,
      lungVolume,
      chestPitchDeg: centeredBreath * amp * 1.05,
      upperChestPitchDeg: centeredBreath * amp * 0.72,
      spinePitchDeg: centeredBreath * amp * 0.22,
      shoulderLiftDeg: Math.max(0, centeredBreath) * amp * (0.07 + 0.09 * deepMix),
      deepBreathEnvelope: deepMix,
      heartbeatDeg: heartDeg,
    };
  }
}
