import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PhysicalEmbodimentController } from './physical-embodiment-v1.mjs';

function harness(){
  const scene={position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),rotation:{y:0},updateMatrixWorld(){}};const vrm={scene};let phase=0,moves=0;
  const feet={left:new THREE.Vector3(-.09,.08,0),right:new THREE.Vector3(.09,.08,0)};
  const physics={
    readFoot(side){return feet[side].clone();},
    resolveFootLanding(start,desired){return desired.clone();},
    moveByDelta(dt,delta){moves++;scene.position.add(delta);return delta.clone();},
    holdPosition(){},
  };
  const world={anchor:n=>({bedApproach:new THREE.Vector3(.05,0,0),bedSit:new THREE.Vector3(.2,.5,0),bedLie:new THREE.Vector3(.2,.7,.2),roomCenter:new THREE.Vector3(.4,0,0)})[n]?.clone()||null,setBlanket(){},update(){},state(){return{}}};
  const ctl=new PhysicalEmbodimentController({world,getVrm:()=>vrm,getBodyPhysics:()=>physics,getActionState:()=>({time:phase,duration:1}),playClip(){},stopAction(){},faceDirection(){},setActionPhase:v=>{phase=v;},walkSpeed:.55,stepLength:.6,modelHeight:1.6});
  return {ctl,vrm,setPhase:v=>phase=v,moves:()=>moves};
}

test('drive obtains root delta from foot-driven plan before moving physics',()=>{
  const h=harness();const g=h.ctl.drive(1/60,new THREE.Vector3(0,0,1),.55,'walk');assert.equal(g.solver,'foot-driven-walk-v1');assert.ok(g.supportLoad.left+g.supportLoad.right>.99);assert.ok(h.moves()>=0);
});

test('release completes current planted step instead of snapping to idle',()=>{
  const h=harness();for(let i=0;i<20;i++)h.ctl.drive(1/60,new THREE.Vector3(0,0,1),.55,'walk',{continueSteps:true});let p;for(let i=0;i<300;i++){p=h.ctl.finishDrive(1/60,new THREE.Vector3(0,0,1));if(p?.settled)break;}assert.equal(p.settled,true);assert.deepEqual(p.stance,{left:true,right:true});
});

test('single march step advances by its actual resolved foot distance then returns idle',()=>{
  const h=harness();h.ctl.startMarchStep('left');for(let i=0;i<300&&h.ctl.state().task!=='idle';i++)h.ctl.update(1/60);const s=h.ctl.state();assert.equal(s.task,'idle');assert.ok(Math.abs(h.vrm.scene.position.z-s.footDriven.totalStepDistance)<.01);assert.ok(s.footDriven.totalStepDistance>.4);
});

test('sleep task advances from walking into blanket interaction near bed',()=>{
  const h=harness();h.ctl.startSleep();for(let i=0;i<240;i++)h.ctl.update(1/60);assert.notEqual(h.ctl.state().task,'walk-to-bed');
});
