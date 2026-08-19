import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calibrateCollisionThresholds,
  createAnatomicalCollisionGuard,
  detectAnatomicalCollisions,
  pointSegmentDistance,
  segmentSegmentDistance,
} from './niva-vrm-collision-guard.mjs';

const p = (x, y, z) => ({ x, y, z });

test('point-to-segment distance is stable', () => {
  assert.equal(pointSegmentDistance(p(1, 1, 0), p(0, 0, 0), p(2, 0, 0)), 1);
});

test('crossing segments have zero centerline distance', () => {
  const d = segmentSegmentDistance(p(-1, 0, 0), p(1, 0, 0), p(0, -1, 0), p(0, 1, 0));
  assert.ok(Math.abs(d) < 1e-9);
});

function neutralPoints() {
  return {
    hips: p(0, 0.92, 0),
    upperChest: p(0, 1.42, 0),
    head: p(0, 1.62, 0),
    leftUpperArm: p(-0.23, 1.40, 0),
    leftLowerArm: p(-0.46, 1.18, 0),
    leftHand: p(-0.48, 0.96, 0),
    rightUpperArm: p(0.23, 1.40, 0),
    rightLowerArm: p(0.46, 1.18, 0),
    rightHand: p(0.48, 0.96, 0),
    leftUpperLeg: p(-0.09, 0.90, 0),
    leftLowerLeg: p(-0.10, 0.48, 0),
    leftFoot: p(-0.10, 0.08, 0.08),
    rightUpperLeg: p(0.09, 0.90, 0),
    rightLowerLeg: p(0.10, 0.48, 0),
    rightFoot: p(0.10, 0.08, 0.08),
  };
}

test('neutral-pose calibration never reports the calibration pose itself', () => {
  const points = neutralPoints();
  const thresholds = calibrateCollisionThresholds(points, 1.7);
  const collisions = detectAnatomicalCollisions(points, 1.7, thresholds);
  assert.deepEqual(collisions, []);
});

test('hand entering torso is detected after neutral calibration', () => {
  const neutral = neutralPoints();
  const thresholds = calibrateCollisionThresholds(neutral, 1.7);
  const penetrated = { ...neutral, leftHand: p(0, 1.12, 0) };
  const collisions = detectAnatomicalCollisions(penetrated, 1.7, thresholds);
  assert.ok(collisions.some((item) => item.id === 'left-hand-torso'));
});

test('guard rolls offending chain back to last safe pose', () => {
  let points = neutralPoints();
  const pose = { leftUpperArm: { x: 0, y: 0, z: 0 } };
  let rollback = null;
  let event = null;
  const guard = createAnatomicalCollisionGuard({
    getPoints: () => points,
    getHeight: () => 1.7,
    capturePose: () => structuredClone(pose),
    rollbackPose: (snapshot, bones) => { rollback = { snapshot, bones }; },
    onCollision: (detail) => { event = detail; },
    cooldownMs: 0,
  });

  guard.calibrate();
  assert.equal(guard.inspect(1).safe, true);
  points = { ...points, leftHand: p(0, 1.12, 0) };
  const result = guard.inspect(2);

  assert.equal(result.safe, false);
  assert.ok(rollback);
  assert.ok(rollback.bones.includes('leftUpperArm'));
  assert.ok(event.collisions.some((item) => item.id === 'left-hand-torso'));
  assert.equal(guard.blocked, 1);
});
