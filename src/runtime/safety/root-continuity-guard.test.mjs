import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RootContinuityGuard } from './root-continuity-guard.mjs';

const almost=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);

test('walking root can only advance by approved physics delta',()=>{
  const g=new RootContinuityGuard({modelHeight:1.6});const p=new THREE.Vector3(0,0,0);g.reset(p);p.set(1,0,1);const r=g.apply(1/60,p,{active:true,approvedDelta:new THREE.Vector3(.01,0,.02)});assert.equal(r.corrected,true);almost(p.x,.01);almost(p.z,.02);assert.ok(r.rejectedDistance>1);
});

test('zero approved motion rejects any horizontal teleport while walking',()=>{
  const g=new RootContinuityGuard({modelHeight:1.6});const p=new THREE.Vector3(.4,0,.3);g.reset(p);p.set(-2,0,4);g.apply(1/60,p,{active:true,approvedDelta:new THREE.Vector3()});almost(p.x,.4);almost(p.z,.3);
});

test('approved delta is itself speed and frame-distance bounded',()=>{
  const g=new RootContinuityGuard({modelHeight:1.6});const p=new THREE.Vector3();g.reset(p);p.set(2,0,0);const r=g.apply(1/60,p,{active:true,approvedDelta:new THREE.Vector3(2,0,0)});assert.ok(r.approvedDistance<=g.maxWalkSpeed/60+1e-8);assert.ok(r.approvedDistance<=g.maxFrameDistance+1e-8);
});

test('non-locomotion mode permits intentional bed or editor repositioning',()=>{
  const g=new RootContinuityGuard({modelHeight:1.6});const p=new THREE.Vector3();g.reset(p);p.set(1.4,.7,-.8);const r=g.apply(1/60,p,{active:false,approvedDelta:new THREE.Vector3()});assert.equal(r.corrected,false);almost(p.x,1.4);almost(p.z,-.8);
});
