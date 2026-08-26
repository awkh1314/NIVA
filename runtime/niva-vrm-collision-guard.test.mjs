import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calibrateCollisionThresholds,
  detectAnatomicalCollisions,
  measureCollisionPairs,
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
    leftToes: p(-0.10, 0.04, 0.25),
    rightUpperLeg: p(0.09, 0.90, 0),
    rightLowerLeg: p(0.10, 0.48, 0),
    rightFoot: p(0.10, 0.08, 0.08),
    rightToes: p(0.10, 0.04, 0.25),
  };
}

test('neutral-pose calibration never reports the calibration pose itself', () => {
  const points = neutralPoints();
  const thresholds = calibrateCollisionThresholds(points, 1.7);
  const collisions = detectAnatomicalCollisions(points, 1.7, thresholds);
  assert.deepEqual(collisions, []);
});

test('v0.82 thresholds follow visual-gap and neutral-slack calibration', () => {
  const points = neutralPoints();
  const height = 1.7;
  const measurements = measureCollisionPairs(points, height);
  const thresholds = calibrateCollisionThresholds(points, height);
  const handTorso = measurements.find((item) => item.id === 'left-hand-torso');
  assert.ok(handTorso);

  const expected = Math.min(
    height * handTorso.marginScale,
    handTorso.clearance - height * handTorso.neutralSlackScale,
  );

  assert.ok(thresholds['left-hand-torso'] < handTorso.clearance);
  assert.ok(Math.abs(thresholds['left-hand-torso'] - expected) < 1e-12);
});

test('hand entering torso is detected after neutral calibration', () => {
  const neutral = neutralPoints();
  const thresholds = calibrateCollisionThresholds(neutral, 1.7);
  const penetrated = { ...neutral, leftHand: p(0, 1.12, 0) };
  const collisions = detectAnatomicalCollisions(penetrated, 1.7, thresholds);
  assert.ok(collisions.some((item) => item.id === 'left-hand-torso'));
});

test('upper arm entering the garment shell is detected', () => {
  const neutral = neutralPoints();
  const thresholds = calibrateCollisionThresholds(neutral, 1.7);
  const clipped = {
    ...neutral,
    leftLowerArm: p(-0.14, 1.25, 0),
  };
  const collisions = detectAnatomicalCollisions(clipped, 1.7, thresholds);
  assert.ok(collisions.some((item) => item.id === 'left-upperarm-torso' || item.id === 'left-forearm-torso'));
});
