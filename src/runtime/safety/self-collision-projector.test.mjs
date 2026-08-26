import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SelfCollisionProjector } from './self-collision-projector.mjs';

function makeFlatRig(){
  const root=new THREE.Object3D();
  const nodes=new Map();
  const points={
    hips:[0,.92,0],upperChest:[0,1.42,0],head:[0,1.62,0],
    leftUpperArm:[-.23,1.40,0],leftLowerArm:[-.46,1.18,0],leftHand:[-.48,.96,0],
    rightUpperArm:[.23,1.40,0],rightLowerArm:[.46,1.18,0],rightHand:[.48,.96,0],
    leftUpperLeg:[-.09,.90,0],leftLowerLeg:[-.10,.48,0],leftFoot:[-.10,.08,.08],leftToes:[-.10,.04,.25],
    rightUpperLeg:[.09,.90,0],rightLowerLeg:[.10,.48,0],rightFoot:[.10,.08,.08],rightToes:[.10,.04,.25],
  };
  for(const [name,pos] of Object.entries(points)){
    const n=new THREE.Object3D();n.position.set(...pos);root.add(n);nodes.set(name,n);
  }
  root.updateMatrixWorld(true);
  const baseQuats=new Map([...nodes].map(([n,node])=>[n,node.quaternion.clone()]));
  return {vrm:{scene:root},nodes,baseQuats,getBone:(n)=>nodes.get(n)||null};
}

test('projector identifies itself as continuous projection rather than rollback',()=>{
  const rig=makeFlatRig();
  const p=new SelfCollisionProjector({...rig,getHeight:()=>1.7});
  p.calibrate();
  const state=p.state();
  assert.equal(state.active,true);
  assert.equal(state.mode,'continuous-pose-projection-no-rollback');
  assert.match(state.solver,/predictive-self-collision-projector/);
});

test('swept sample count grows with angular travel and is bounded',()=>{
  const rig=makeFlatRig();
  const p=new SelfCollisionProjector({...rig,getHeight:()=>1.7});
  const a=p.capturePose();
  const b=p.capturePose();
  b.get('leftUpperArm').setFromAxisAngle(new THREE.Vector3(0,0,1),THREE.MathUtils.degToRad(100));
  const small=p.dynamicSampleCount(a,a);
  const large=p.dynamicSampleCount(a,b);
  assert.equal(small,1);
  assert.ok(large>small);
  assert.ok(large<=24);
});

test('ordinary collision-free target is accepted at full fraction',()=>{
  const rig=makeFlatRig();
  const p=new SelfCollisionProjector({...rig,getHeight:()=>1.7});
  p.calibrate();
  rig.nodes.get('head').quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(4));
  const result=p.project();
  assert.equal(result.safe,true);
  assert.equal(result.fraction,1);
  assert.equal(p.state().constrainedFrames,0);
});

test('projector never exposes rollback API',()=>{
  const rig=makeFlatRig();
  const p=new SelfCollisionProjector({...rig,getHeight:()=>1.7});
  assert.equal('rollback' in p,false);
  assert.equal('rollbackPose' in p,false);
});
