import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JointRotationGuard, NIVA_RUNTIME_JOINT_LIMITS, limitEulerStep, softClampAxis } from './joint-rotation-guard.mjs';

const rad=THREE.MathUtils.degToRad;
const deg=THREE.MathUtils.radToDeg;

test('soft clamp never exceeds hard anatomical bounds',()=>{
  assert.ok(softClampAxis(999,-20,30)<=30);
  assert.ok(softClampAxis(-999,-20,30)>=-20);
  assert.equal(softClampAxis(0,-20,30),0);
});

test('per-frame limiter caps angular speed as well as final angle',()=>{
  const limit={x:{min:-30,max:30},y:{min:-30,max:30},z:{min:-30,max:30},speed:120};
  const out=limitEulerStep({x:30,y:-30,z:0},{x:0,y:0,z:0},limit,1/60);
  assert.ok(out.x<=2.01&&out.x>0);
  assert.ok(out.y>=-2.01&&out.y<0);
});

test('runtime envelopes prohibit pathological limb twists while preserving human ROM',()=>{
  assert.ok(NIVA_RUNTIME_JOINT_LIMITS.leftUpperArm.z.max<=130);
  assert.ok(NIVA_RUNTIME_JOINT_LIMITS.rightUpperArm.y.max<=90);
  assert.ok(NIVA_RUNTIME_JOINT_LIMITS.leftLowerLeg.x.max<=135);
  assert.ok(NIVA_RUNTIME_JOINT_LIMITS.rightFoot.z.max<=25);
  assert.equal(NIVA_RUNTIME_JOINT_LIMITS.leftToes.x.max,75);
});

test('final guard clamps a post-IK quaternion relative to calibrated base pose',()=>{
  const base=new THREE.Quaternion();
  const bone=new THREE.Object3D();
  bone.quaternion.setFromEuler(new THREE.Euler(rad(0),rad(0),rad(179),'XYZ'));
  const bases=new Map([['leftUpperArm',base.clone()]]);
  const guard=new JointRotationGuard({getBone:(name)=>name==='leftUpperArm'?bone:null,baseQuats:bases});
  const corrected=guard.apply(1/60);
  assert.deepEqual(corrected,['leftUpperArm']);
  const rel=base.clone().invert().multiply(bone.quaternion);
  const e=new THREE.Euler().setFromQuaternion(rel,'XYZ');
  assert.ok(Math.abs(deg(e.z))<=130.01);
  assert.equal(guard.state().active,true);
  assert.equal(guard.state().anatomy.solver,'anatomical-rom-v2');
});

test('guard projects neck and head as one anatomical chain',()=>{
  const base=new THREE.Quaternion();
  const neck=new THREE.Object3D(),head=new THREE.Object3D();
  neck.quaternion.setFromEuler(new THREE.Euler(0,rad(45),0,'XYZ'));
  head.quaternion.setFromEuler(new THREE.Euler(0,rad(45),0,'XYZ'));
  const map={neck,head};
  const guard=new JointRotationGuard({getBone:(name)=>map[name],baseQuats:new Map([['neck',base.clone()],['head',base.clone()]])});
  guard.apply(1/60);
  const ny=deg(new THREE.Euler().setFromQuaternion(neck.quaternion,'XYZ').y);
  const hy=deg(new THREE.Euler().setFromQuaternion(head.quaternion,'XYZ').y);
  assert.ok(ny+hy<=75.1);
});

test('guard leaves ordinary small body motion untouched',()=>{
  const base=new THREE.Quaternion();
  const bone=new THREE.Object3D();
  bone.quaternion.setFromEuler(new THREE.Euler(rad(4),rad(3),rad(2),'XYZ'));
  const guard=new JointRotationGuard({getBone:()=>bone,baseQuats:new Map([['chest',base]])});
  const before=bone.quaternion.clone();
  const corrected=guard.apply(1/60);
  assert.deepEqual(corrected,[]);
  assert.ok(before.angleTo(bone.quaternion)<1e-8);
});
