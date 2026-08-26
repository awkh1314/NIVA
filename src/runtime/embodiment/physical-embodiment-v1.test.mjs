import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PhysicalEmbodimentController } from './physical-embodiment-v1.mjs';

function harness(){
  const scene={position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),rotation:{y:0},updateMatrixWorld(){}};const vrm={scene};
  let phase=0,moves=0;const physics={move(){moves++;}};
  const world={anchor:n=>({bedApproach:new THREE.Vector3(.05,0,0),bedSit:new THREE.Vector3(.2,.5,0),bedLie:new THREE.Vector3(.2,.7,.2),roomCenter:new THREE.Vector3(.4,0,0)})[n]?.clone()||null,setBlanket(){},update(){},state(){return{}}};
  const ctl=new PhysicalEmbodimentController({world,getVrm:()=>vrm,getBodyPhysics:()=>physics,getActionState:()=>({time:phase,duration:1}),playClip(){},stopAction(){},faceDirection(){}});
  return {ctl,vrm,setPhase:v=>phase=v,moves:()=>moves};
}

test('drive uses planted contact gait before moving root',()=>{
  const h=harness();h.setPhase(.2);const g=h.ctl.drive(1/60,new THREE.Vector3(1,0,0),.5,'walk');
  assert.ok(g.supportLoad.left+g.supportLoad.right>.99);assert.equal(h.moves(),1);
});

test('sleep task advances from walking into blanket interaction near bed',()=>{
  const h=harness();h.ctl.startSleep();h.ctl.update(1/60);h.ctl.update(1/60);
  assert.ok(['walk-to-bed','open-blanket'].includes(h.ctl.state().task));
  for(let i=0;i<140;i++)h.ctl.update(1/60);
  assert.notEqual(h.ctl.state().task,'walk-to-bed');
});
