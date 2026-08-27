import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { dampedPoseQuaternion, PoseContinuityGuard } from './pose-continuity.mjs';

const q=(deg)=>new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(deg),0,0));

test('large preset release cannot snap to base in one frame',()=>{
  const current=q(70),target=q(0),next=dampedPoseQuaternion(current,target,1/60,{lambda:14,maxDegreesPerSecond:220});
  const applied=THREE.MathUtils.radToDeg(current.angleTo(next));
  assert.ok(applied>0);assert.ok(applied<=220/60+1e-6);assert.ok(THREE.MathUtils.radToDeg(next.angleTo(target))>50);
});

test('small breathing target follows smoothly without freezing',()=>{
  let current=q(0);const target=q(1.2);for(let i=0;i<90;i++)current=dampedPoseQuaternion(current,target,1/60,{lambda:14,maxDegreesPerSecond:220});
  assert.ok(THREE.MathUtils.radToDeg(current.angleTo(target))<.01);
});

test('guard reports bounded corrections for abrupt preset changes',()=>{
  const node={quaternion:q(-55)};const guard=new PoseContinuityGuard({lambda:14,maxDegreesPerSecond:180});guard.apply(node,q(20),1/60);assert.ok(guard.state().corrections>=1);assert.ok(guard.state().maxObservedStepDeg<=3.0001);
});
