import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CriticallyDampedScalar,
  GaitBalanceController,
  PhysiologyOscillator,
  weightedCenterOfMass,
  supportCenter,
} from './biomechanics-life.mjs';

test('weighted COM follows segment mass instead of simple averaging', () => {
  const com = weightedCenterOfMass([
    { mass: 3, position: { x: 0, y: 1, z: 0 } },
    { mass: 1, position: { x: 1, y: 1, z: 0 } },
  ]);
  assert.ok(com);
  assert.equal(com.x, 0.25);
  assert.equal(com.y, 1);
  assert.equal(com.mass, 4);
});

test('support center moves to the planted foot', () => {
  const feet = { leftFoot: { x: -0.1, y: 0, z: 0 }, rightFoot: { x: 0.1, y: 0, z: 0 } };
  assert.equal(supportCenter({ ...feet, stance: { left: true, right: false } }).support, 'left');
  assert.equal(supportCenter({ ...feet, stance: { left: false, right: true } }).support, 'right');
  assert.equal(supportCenter({ ...feet, stance: { left: true, right: true } }).x, 0);
});

test('critical damping responds without an instantaneous balance jump', () => {
  const f = new CriticallyDampedScalar(0, 10);
  const first = f.step(1, 1 / 60);
  assert.ok(first > 0 && first < 0.1);
  let prev = first;
  for (let i = 0; i < 180; i += 1) {
    const next = f.step(1, 1 / 60);
    assert.ok(next >= prev - 1e-9);
    assert.ok(next <= 1 + 1e-9);
    prev = next;
  }
  assert.ok(Math.abs(prev - 1) < 1e-5);
});

test('walk balance shifts toward stance side and adds forward body pitch', () => {
  const balance = new GaitBalanceController({ modelHeight: 1.6 });
  const input = {
    action: 'walk', phase: 0.1, stance: { left: true, right: false }, grounded: true,
    centerOfMass: { x: 0, y: 0.9, z: 0 },
    leftFoot: { x: -0.12, y: 0, z: 0 }, rightFoot: { x: 0.12, y: 0, z: 0 },
    right: { x: 1, z: 0 }, forward: { x: 0, z: 1 },
  };
  let result;
  for (let i = 0; i < 45; i += 1) result = balance.update(1 / 60, input);
  assert.ok(result.rootShiftRight < 0);
  assert.ok(result.torsoRollDeg < 0);
  assert.ok(result.torsoPitchDeg > 0.5);
  assert.ok(result.verticalOffset <= 0);
});

test('switching support feet stays bounded instead of snapping', () => {
  const balance = new GaitBalanceController({ modelHeight: 1.6 });
  const base = {
    action: 'walk', grounded: true,
    centerOfMass: { x: 0, y: 0.9, z: 0 },
    leftFoot: { x: -0.12, y: 0, z: 0 }, rightFoot: { x: 0.12, y: 0, z: 0 },
    right: { x: 1, z: 0 }, forward: { x: 0, z: 1 },
  };
  for (let i = 0; i < 60; i += 1) balance.update(1 / 60, { ...base, phase: 0.2, stance: { left: true, right: false } });
  const before = balance.last.rootShiftRight;
  const after = balance.update(1 / 60, { ...base, phase: 0.55, stance: { left: false, right: true } });
  assert.ok(Math.abs(after.rootShiftRight - before) < 0.01);
  assert.ok(Math.abs(after.supportBias - balance.supportBias.value) < 1e-12);
});

test('whole-body stability plan controls trunk head arms legs knees and ankles', () => {
  const balance = new GaitBalanceController({ modelHeight: 1.6 });
  const input = {
    action: 'walk', phase: 0.15, stance: { left: true, right: false }, grounded: true,
    centerOfMass: { x: 0.08, y: 0.9, z: -0.03 },
    leftFoot: { x: -0.12, y: 0, z: 0.02 }, rightFoot: { x: 0.12, y: 0, z: -0.02 },
    right: { x: 1, z: 0 }, forward: { x: 0, z: 1 },
  };
  let result;
  for (let i = 0; i < 50; i += 1) result = balance.update(1 / 60, input);
  const required = [
    'hips','spine','chest','upperChest','neck','head',
    'leftShoulder','rightShoulder','leftUpperArm','rightUpperArm',
    'leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg','leftFoot','rightFoot',
  ];
  for (const name of required) {
    assert.ok(result.fullBody[name], `missing whole-body stabilizer: ${name}`);
    for (const axis of ['x','y','z']) assert.ok(Number.isFinite(result.fullBody[name][axis]));
  }
  assert.ok(result.stabilityDemand > 0);
  assert.ok(result.fullBody.leftLowerLeg.x > 0);
  assert.ok(result.fullBody.rightLowerLeg.x > 0);
  assert.ok(Math.abs(result.fullBody.head.z) < Math.abs(result.torsoRollDeg));
});

test('larger COM error increases stability demand while remaining bounded', () => {
  const centered = new GaitBalanceController({ modelHeight: 1.6 });
  const displaced = new GaitBalanceController({ modelHeight: 1.6 });
  const common = {
    action: 'walk', phase: 0.2, stance: { left: true, right: false }, grounded: true,
    leftFoot: { x: -0.12, y: 0, z: 0 }, rightFoot: { x: 0.12, y: 0, z: 0 },
    right: { x: 1, z: 0 }, forward: { x: 0, z: 1 },
  };
  let a;
  let b;
  for (let i = 0; i < 90; i += 1) {
    a = centered.update(1 / 60, { ...common, centerOfMass: { x: -0.10, y: 0.9, z: 0 } });
    b = displaced.update(1 / 60, { ...common, centerOfMass: { x: 0.12, y: 0.9, z: -0.08 } });
  }
  assert.ok(b.stabilityDemand > a.stabilityDemand);
  assert.ok(b.stabilityDemand <= 1);
  assert.ok(Math.abs(b.fullBody.leftFoot.z) <= 0.9);
  assert.ok(Math.abs(b.fullBody.rightFoot.z) <= 0.9);
  assert.ok(b.fullBody.leftLowerLeg.x <= 6.5);
  assert.ok(b.fullBody.rightLowerLeg.x <= 6.5);
});

test('whole-body support transfer is damped across limbs', () => {
  const balance = new GaitBalanceController({ modelHeight: 1.6 });
  const base = {
    action: 'walk', grounded: true,
    centerOfMass: { x: 0, y: 0.9, z: 0 },
    leftFoot: { x: -0.12, y: 0, z: 0 }, rightFoot: { x: 0.12, y: 0, z: 0 },
    right: { x: 1, z: 0 }, forward: { x: 0, z: 1 },
  };
  for (let i = 0; i < 60; i += 1) balance.update(1 / 60, { ...base, phase: 0.2, stance: { left: true, right: false } });
  const before = balance.last;
  const after = balance.update(1 / 60, { ...base, phase: 0.55, stance: { left: false, right: true } });
  assert.ok(Math.abs(after.fullBody.leftUpperArm.z - before.fullBody.leftUpperArm.z) < 0.6);
  assert.ok(Math.abs(after.fullBody.leftLowerLeg.x - before.fullBody.leftLowerLeg.x) < 0.6);
  assert.ok(Math.abs(after.supportBias - before.supportBias) < 0.2);
});

test('physiology produces smooth asymmetric breathing and tiny heartbeat impulses', () => {
  const physiology = new PhysiologyOscillator();
  let maxHeart = 0;
  let minChest = Infinity;
  let maxChest = -Infinity;
  let prevChest = 0;
  let maxFrameDelta = 0;
  for (let i = 0; i < 600; i += 1) {
    const v = physiology.update(1 / 60, { breathsPerMinute: 12, heartRate: 72, breathAmplitude: 0.35 });
    maxHeart = Math.max(maxHeart, v.heartbeatDeg);
    minChest = Math.min(minChest, v.chestPitchDeg);
    maxChest = Math.max(maxChest, v.chestPitchDeg);
    maxFrameDelta = Math.max(maxFrameDelta, Math.abs(v.chestPitchDeg - prevChest));
    prevChest = v.chestPitchDeg;
  }
  assert.ok(maxHeart > 0 && maxHeart < 0.08);
  assert.ok(minChest < 0 && maxChest > 0);
  assert.ok(maxFrameDelta < 0.03);
});
