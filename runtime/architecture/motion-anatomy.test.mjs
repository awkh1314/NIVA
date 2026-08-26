import test from 'node:test';
import assert from 'node:assert/strict';
import { BODY_REGIONS, bonesForRegions, regionForBone } from '../../src/runtime/motion/body-map.mjs';
import { MOTION_SPECS } from '../../src/runtime/motion/motion-specs.mjs';
import { FullBodyMotionCoordinator } from '../../src/runtime/motion/full-body-motion-coordinator.mjs';

test('body map partitions normalized humanoid limbs and fingers', () => {
  assert.ok(BODY_REGIONS.leftHand.includes('leftIndexDistal'));
  assert.ok(BODY_REGIONS.rightLeg.includes('rightFoot'));
  assert.equal(regionForBone('leftUpperArm'), 'leftArm');
  assert.equal(regionForBone('rightLittleDistal'), 'rightHand');
  assert.ok(bonesForRegions(['leftArm', 'leftHand']).includes('leftHand'));
});

test('continuous locomotion owns the whole body but not gaze/face/voice', () => {
  const c = new FullBodyMotionCoordinator();
  c.setContinuous('run');
  const s = c.resolve(0);
  assert.equal(s.ownership.leftLeg, 'continuous:run');
  assert.equal(s.ownership.rightArm, 'continuous:run');
  assert.equal(s.ownership.gaze, 'life/additive');
  assert.equal(s.ownership.face, 'life/additive');
  assert.equal(s.rootOwner.translation, 'physics');
  assert.equal(s.rootOwner.yaw, 'facing');
});

test('overlay gesture only replaces claimed regions', () => {
  const c = new FullBodyMotionCoordinator();
  c.setContinuous('walk');
  c.triggerOverlay('wave', 100, 1000);
  const s = c.resolve(500);
  assert.equal(s.ownership.rightArm, 'overlay:wave');
  assert.equal(s.ownership.rightHand, 'overlay:wave');
  assert.equal(s.ownership.leftArm, 'continuous:walk');
  assert.equal(s.ownership.leftLeg, 'continuous:walk');
});

test('manual control has highest regional priority', () => {
  const c = new FullBodyMotionCoordinator();
  c.setContinuous('crouch');
  c.triggerOverlay('wave', 100, 1000);
  c.setManualRegions(['rightArm']);
  const s = c.resolve(500);
  assert.equal(s.ownership.rightArm, 'manual');
  assert.equal(s.ownership.rightHand, 'overlay:wave');
});

test('crouch specification preserves the biomechanics contract', () => {
  const spec = MOTION_SPECS.crouch;
  for (const invariant of ['knees-forward','hips-back','torso-forward','heels-down','feet-grounded','hands-on-head','no-root-spin']) {
    assert.ok(spec.invariants.includes(invariant), invariant);
  }
  assert.equal(spec.root.yaw, 'locked');
});
