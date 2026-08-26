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
