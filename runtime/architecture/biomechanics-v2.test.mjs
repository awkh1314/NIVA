import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { solveTwoBoneIK, createTwoBoneIKScratch } from '../../src/runtime/ik/two-bone-ik.mjs';

test('analytical two-bone IK converges strongly without changing segment lengths',()=>{
  const root=new THREE.Object3D();
  const mid=new THREE.Object3D();mid.position.set(0,-1,0);root.add(mid);
  const end=new THREE.Object3D();end.position.set(0,-1,0);mid.add(end);
  root.updateMatrixWorld(true);
  const chain={root,mid,end,lastPole:new THREE.Vector3()};
  const beforeA=root.getWorldPosition(new THREE.Vector3()).distanceTo(mid.getWorldPosition(new THREE.Vector3()));
  const beforeB=mid.getWorldPosition(new THREE.Vector3()).distanceTo(end.getWorldPosition(new THREE.Vector3()));
  const target=new THREE.Vector3(0,-1.55,.65);
  const initialError=end.getWorldPosition(new THREE.Vector3()).distanceTo(target);
  solveTwoBoneIK(chain,target,1,{scratch:createTwoBoneIKScratch(),poleDirection:new THREE.Vector3(0,0,1),preferredForward:new THREE.Vector3(0,0,1),minBend:THREE.MathUtils.degToRad(2),maxBend:THREE.MathUtils.degToRad(145)});
  root.updateMatrixWorld(true);
  const afterA=root.getWorldPosition(new THREE.Vector3()).distanceTo(mid.getWorldPosition(new THREE.Vector3()));
  const afterB=mid.getWorldPosition(new THREE.Vector3()).distanceTo(end.getWorldPosition(new THREE.Vector3()));
  const error=end.getWorldPosition(new THREE.Vector3()).distanceTo(target);
  assert.ok(error<0.20,`end effector error ${error}`);
  assert.ok(error<initialError*.30,`IK did not converge enough: ${initialError} -> ${error}`);
  assert.ok(Math.abs(afterA-beforeA)<1e-6);
  assert.ok(Math.abs(afterB-beforeB)<1e-6);
});

test('runtime IK no longer contains the old iterative CCD solver',()=>{
  const src=fs.readFileSync(new URL('../../src/runtime/ik/niva-ik-system.mjs',import.meta.url),'utf8');
  for(const forbidden of ['solveChain(','rotateBoneTowardEnd(','isolated-ccd-v1']) assert.equal(src.includes(forbidden),false,forbidden);
  assert.equal(src.includes('solveTwoBoneIK'),true);
  assert.equal(src.includes('SelfCollisionConstraint'),true);
});

test('self collision guard includes torso/head and left-right leg proxy pairs',()=>{
  const src=fs.readFileSync(new URL('../../src/runtime/ik/self-collision-constraint.mjs',import.meta.url),'utf8');
  for(const required of ["['rightHand','torso']","['rightHand','head']","['leftThigh','rightThigh']","['leftShin','rightShin']"]) assert.equal(src.includes(required),true,required);
});

test('foot IK has explicit bend limits and ground-normal sole alignment',()=>{
  const src=fs.readFileSync(new URL('../../src/runtime/ik/foot-ik-system.mjs',import.meta.url),'utf8');
  assert.equal(src.includes('maxBend'),true);
  assert.equal(src.includes('alignSole'),true);
  assert.equal(src.includes('preferredForward:forward'),true);
});
