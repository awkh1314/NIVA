import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FootDrivenWalkPlanner } from './foot-driven-walk.mjs';

const left=new THREE.Vector3(-.09,.08,0),right=new THREE.Vector3(.09,.08,0),forward=new THREE.Vector3(0,0,1);
const almost=(a,b,eps=.01)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b} ±${eps}`);

function runSingle({distance=.5,resolver=null,duration=.9,dt=1/60}={}){
  const p=new FootDrivenWalkPlanner({modelHeight:1.6,nominalSpeed:.55});let plan=null,maxDelta=0,frames=0;
  while(frames++<600){plan=p.update(dt,{direction:forward,desiredSpeed:.55,leftFoot:left,rightFoot:right,resolveLanding:resolver,mode:'single',forcedSide:'left',forcedStepLength:distance,forcedDuration:duration,continueSteps:false});maxDelta=Math.max(maxDelta,plan.rootDelta.length());if(plan.settled&&plan.stepCount===1)break;}
  return {p,plan,maxDelta,frames};
}

test('actual 0.5m foot landing produces exactly 0.5m root advance',()=>{
  const {p,plan}=runSingle({distance:.5});almost(plan.actualStepDistance,.5,.002);almost(p.totalRootAdvance,.5,.002);almost(p.totalStepDistance,.5,.002);
});

test('obstacle-limited 0.31m landing limits root to the same 0.31m',()=>{
  const resolver=(start,desired)=>desired.clone().setZ(.31);const {p}=runSingle({distance:.5,resolver});almost(p.totalRootAdvance,.31,.003);almost(p.totalStepDistance,.31,.003);
});

test('swing foot cannot complete the stride before heel strike',()=>{
  const p=new FootDrivenWalkPlanner({modelHeight:1.6});let plan;for(let i=0;i<20;i++)plan=p.update(1/60,{direction:forward,desiredSpeed:.55,leftFoot:left,rightFoot:right,mode:'single',forcedStepLength:.5,continueSteps:false});
  assert.equal(plan.phase,'SWING');assert.ok(plan.rootProgress<.13);assert.ok(plan.rootDelta.length()<=plan.maxRootDeltaPerFrame+1e-8);
});

test('every frame respects maxRootDeltaPerFrame',()=>{
  const {p,maxDelta}=runSingle({distance:.6,dt:1/30});assert.ok(maxDelta<=p.maxRootDeltaPerFrame+1e-8);
});

test('large dt is clamped and cannot teleport the root',()=>{
  const p=new FootDrivenWalkPlanner({modelHeight:1.6});const a=p.update(.5,{direction:forward,desiredSpeed:.55,leftFoot:left,rightFoot:right,mode:'single',forcedStepLength:.5,continueSteps:false});assert.ok(a.rootDelta.length()<=p.maxRootDeltaPerFrame+1e-8);assert.ok(a.rootProgress<.2);
});

test('release finishes current step and settles in normalized double support',()=>{
  const p=new FootDrivenWalkPlanner({modelHeight:1.6});let plan;for(let i=0;i<18;i++)plan=p.update(1/60,{direction:forward,desiredSpeed:.55,leftFoot:left,rightFoot:right,continueSteps:true});
  for(let i=0;i<300;i++){plan=p.update(1/60,{direction:forward,desiredSpeed:0,continueSteps:false});if(plan.settled&&plan.stepCount>=1)break;}
  assert.equal(plan.settled,true);assert.deepEqual(plan.stance,{left:true,right:true});almost(plan.supportLoad.left+plan.supportLoad.right,1,1e-8);
});

test('support pressure remains normalized through the complete step',()=>{
  const p=new FootDrivenWalkPlanner({modelHeight:1.6});for(let i=0;i<300;i++){const plan=p.update(1/60,{direction:forward,desiredSpeed:.55,leftFoot:left,rightFoot:right,mode:'single',forcedStepLength:.5,continueSteps:false});almost(plan.supportLoad.left+plan.supportLoad.right,1,1e-8);if(plan.settled&&plan.stepCount===1)break;}
});

test('step-turn bounds a 90 degree direction request instead of snapping root yaw',()=>{
  const p=new FootDrivenWalkPlanner({modelHeight:1.6});let plan;while(p.stepCount<1){plan=p.update(1/60,{direction:forward,desiredSpeed:.55,leftFoot:left,rightFoot:right,continueSteps:true});}
  const before=plan.direction.clone();let next;for(let i=0;i<3;i++){next=p.update(1/60,{direction:new THREE.Vector3(1,0,0),desiredSpeed:.55,continueSteps:true});if(next.active)break;}
  const angle=before.angleTo(next.direction);assert.ok(angle<=THREE.MathUtils.degToRad(42)+1e-6);assert.ok(angle>0);
});

test('single-step march mode is also foot-distance coupled',()=>{
  const {p,plan}=runSingle({distance:.6,duration:1.65});almost(p.totalRootAdvance,.6,.003);almost(p.totalStepDistance,.6,.003);assert.equal(plan.settled,true);
});

test('twenty continuous steps accumulate root distance equal to actual foot distances within 2%',()=>{
  const p=new FootDrivenWalkPlanner({modelHeight:1.6});let plan,guard=0;while(p.stepCount<20&&guard++<5000){plan=p.update(1/60,{direction:forward,desiredSpeed:.55,leftFoot:left,rightFoot:right,continueSteps:true});}
  assert.equal(p.stepCount,20);const err=Math.abs(p.totalRootAdvance-p.totalStepDistance)/Math.max(.001,p.totalStepDistance);assert.ok(err<.02,`distance error ${err}`);
});
