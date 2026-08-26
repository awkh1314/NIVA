import test from 'node:test';
import assert from 'node:assert/strict';
import {RootMotionEstimator,capturePoint,RecoveryStepPlanner} from './predictive-stability.mjs';

test('capture point projects COM in velocity direction',()=>{
  const cp=capturePoint({centerOfMass:{x:0,y:1,z:0},velocity:{x:.8,z:.4},groundY:0});
  assert.ok(cp.x>0&&cp.z>0);assert.ok(cp.omega>2);
});

test('root motion estimator filters velocity and acceleration without spikes',()=>{
  const e=new RootMotionEstimator();e.update(1/60,{x:0,z:0});let r;
  for(let i=1;i<=30;i++)r=e.update(1/60,{x:i*.01,z:0});
  assert.ok(r.velocity.x>0&&r.velocity.x<1);assert.ok(Number.isFinite(r.acceleration.x));
});

test('planner stays quiet when capture point is inside support area',()=>{
  const p=new RecoveryStepPlanner({modelHeight:1.6});let r;
  for(let i=0;i<60;i++)r=p.update(1/60,{grounded:true,capturePoint:{x:.01,y:1,z:.01},supportCenter:{x:0,y:0,z:0},leftFoot:{x:-.1,y:.05,z:0},rightFoot:{x:.1,y:.05,z:0},stance:{left:true,right:true},right:{x:1,z:0},forward:{x:0,z:1}});
  assert.ok(r.risk<.2);assert.equal(r.needsStep,false);
});

test('planner starts a bounded step toward predicted fall direction',()=>{
  const p=new RecoveryStepPlanner({modelHeight:1.6});let r;
  const input={action:'walk',grounded:true,capturePoint:{x:.28,y:1,z:.22},supportCenter:{x:-.1,y:0,z:0},leftFoot:{x:-.1,y:.05,z:0},rightFoot:{x:.1,y:.05,z:0},stance:{left:true,right:false},right:{x:1,z:0},forward:{x:0,z:1},velocity:{x:.6,z:.5},acceleration:{x:.2,z:.2}};
  for(let i=0;i<45&&!r?.needsStep;i++)r=p.update(1/60,input);
  assert.equal(r.needsStep,true);assert.equal(r.stepSide,'right');assert.ok(r.stepTarget.x>-.1);assert.ok(Math.abs(r.stepTarget.x+.1)<1.6*.20);assert.ok(r.risk>.3);
});

test('recovery step lifts then lands instead of teleporting',()=>{
  const p=new RecoveryStepPlanner({modelHeight:1.6});const input={action:'walk',grounded:true,capturePoint:{x:.3,y:1,z:.25},supportCenter:{x:-.1,y:0,z:0},leftFoot:{x:-.1,y:.05,z:0},rightFoot:{x:.1,y:.05,z:0},stance:{left:true,right:false},right:{x:1,z:0},forward:{x:0,z:1},velocity:{x:.7,z:.6},acceleration:{x:0,z:0}};
  let r;for(let i=0;i<30&&!r?.needsStep;i++)r=p.update(1/60,input);const start={...r.stepTarget};
  for(let i=0;i<8;i++)r=p.update(1/60,input);assert.ok(r.stepTarget.y>start.y);for(let i=0;i<30;i++)r=p.update(1/60,input);assert.ok(r.stepPhase>=.99);
});
