import test from 'node:test';
import assert from 'node:assert/strict';
import { lifePresetAllowsBone, isRootAffectingBone } from './life-preset-policy.mjs';

test('breathing is restricted to torso and shoulders',()=>{
  for(const bone of ['spine','chest','upperChest','leftShoulder','rightShoulder'])assert.equal(lifePresetAllowsBone('breath',bone),true);
  for(const bone of ['hips','leftUpperLeg','rightLowerLeg','leftFoot','rightToes'])assert.equal(lifePresetAllowsBone('breath',bone),false);
});

test('heartbeat cannot affect hips or limbs',()=>{
  assert.equal(lifePresetAllowsBone('heartbeat','chest'),true);assert.equal(lifePresetAllowsBone('heartbeat','upperChest'),true);assert.equal(lifePresetAllowsBone('heartbeat','hips'),false);assert.equal(lifePresetAllowsBone('heartbeat','leftFoot'),false);
});

test('root-affecting classifier catches pelvis and lower limbs',()=>{
  assert.equal(isRootAffectingBone('hips'),true);assert.equal(isRootAffectingBone('leftUpperLeg'),true);assert.equal(isRootAffectingBone('rightFoot'),true);assert.equal(isRootAffectingBone('chest'),false);
});
