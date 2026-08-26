import test from 'node:test';
import assert from 'node:assert/strict';
import { ANATOMICAL_CONTROLLED_BONES, ANATOMICAL_ROM_EVIDENCE, anatomicalLimitForBone, anatomicalRomState, projectAnatomicalPose } from './anatomical-rom-v2.mjs';
import { NIVA_VRM_EXPECTED_BONES } from '../../../runtime/niva-vrm-limits.mjs';

const pose=(entries={})=>Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,{x:v.x||0,y:v.y||0,z:v.z||0}]));

test('Anatomical ROM V2 covers every controllable NIVA humanoid bone',()=>{
  const missing=NIVA_VRM_EXPECTED_BONES.filter((name)=>!ANATOMICAL_CONTROLLED_BONES.includes(name));
  assert.deepEqual(missing,[]);
  assert.equal(anatomicalRomState().controlledBones,NIVA_VRM_EXPECTED_BONES.length);
});

test('clinical evidence table contains the major normal-adult joint families',()=>{
  for(const key of ['shoulderComplex','elbow','wrist','hip','knee','ankle','lumbar','cervical','eye','thumb','fingers','toes']) assert.ok(ANATOMICAL_ROM_EVIDENCE[key]);
  assert.equal(ANATOMICAL_ROM_EVIDENCE.shoulderComplex.flexion,180);
  assert.equal(ANATOMICAL_ROM_EVIDENCE.knee.flexion,135);
  assert.equal(ANATOMICAL_ROM_EVIDENCE.toes.dorsiflexion,75);
});

test('serial spine bones share one total ROM envelope instead of stacking maxima',()=>{
  const out=projectAnatomicalPose(pose({spine:{x:25,y:10,z:15},chest:{x:25,y:18,z:20},upperChest:{x:20,y:18,z:18}}));
  const sum=(a)=>out.spine[a]+out.chest[a]+out.upperChest[a];
  assert.ok(sum('x')<=60.001);
  assert.ok(sum('y')<=25.001);
  assert.ok(sum('z')<=30.001);
});

test('neck and head cannot stack independent maxima into a pathological total turn',()=>{
  const out=projectAnatomicalPose(pose({neck:{y:45},head:{y:45}}));
  assert.ok(out.neck.y+out.head.y<=75.001);
});

test('high arm elevation recruits shoulder complex and narrows free axial rotation',()=>{
  const out=projectAnatomicalPose(pose({leftShoulder:{},leftUpperArm:{z:-130,y:90},upperChest:{}}));
  assert.ok(Math.abs(out.leftShoulder.z)>20);
  assert.ok(Math.abs(out.leftUpperArm.y)<70);
  assert.ok(out.upperChest.x<0);
});

test('bilateral overhead reach recruits both shoulders without lateral chest bias',()=>{
  const out=projectAnatomicalPose(pose({leftShoulder:{},rightShoulder:{},leftUpperArm:{z:-130},rightUpperArm:{z:130},upperChest:{}}));
  assert.ok(out.leftShoulder.z<0);
  assert.ok(out.rightShoulder.z>0);
  assert.ok(Math.abs(out.upperChest.z)<1e-6);
  assert.ok(out.upperChest.x<0);
});

test('deep hip flexion reduces remaining rotation and abduction room',()=>{
  const out=projectAnatomicalPose(pose({leftUpperLeg:{x:120,y:45,z:45}}));
  assert.ok(Math.abs(out.leftUpperLeg.y)<=28.01);
  assert.ok(Math.abs(out.leftUpperLeg.z)<=30.01);
});

test('knee axial rotation grows with flexion but is nearly locked in extension',()=>{
  const straight=projectAnatomicalPose(pose({leftLowerLeg:{x:0,y:40}}));
  const bent=projectAnatomicalPose(pose({leftLowerLeg:{x:100,y:40}}));
  assert.ok(Math.abs(straight.leftLowerLeg.y)<=8.01);
  assert.ok(Math.abs(bent.leftLowerLeg.y)>Math.abs(straight.leftLowerLeg.y));
  assert.ok(Math.abs(bent.leftLowerLeg.y)<=32.01);
});

test('finger side spread collapses during a fist and interphalangeal twist stays tiny',()=>{
  const open=projectAnatomicalPose(pose({leftIndexProximal:{x:30,y:0,z:30},leftIndexIntermediate:{x:20,y:0,z:20},leftIndexDistal:{x:20,y:0,z:20}}));
  const fist=projectAnatomicalPose(pose({leftIndexProximal:{x:30,y:-90,z:30},leftIndexIntermediate:{x:20,y:-100,z:20},leftIndexDistal:{x:20,y:-90,z:20}}));
  assert.ok(Math.abs(fist.leftIndexProximal.x)<Math.abs(open.leftIndexProximal.x));
  assert.ok(Math.abs(fist.leftIndexIntermediate.x)<=3.001);
  assert.ok(Math.abs(fist.leftIndexDistal.z)<=3.001);
});

test('eyes and toes use human-scale outer envelopes',()=>{
  assert.equal(anatomicalLimitForBone('leftEye').y.max,45);
  assert.equal(anatomicalLimitForBone('rightEye').x.max,47);
  assert.equal(anatomicalLimitForBone('leftToes').x.max,75);
});

test('thumb opposition cannot become arbitrary three-axis twisting',()=>{
  const out=projectAnatomicalPose(pose({leftThumbMetacarpal:{y:-71,z:80},leftThumbProximal:{y:-90},leftThumbDistal:{y:-120}}));
  assert.ok(Math.abs(out.leftThumbMetacarpal.z)<=30.001);
  assert.ok(out.leftThumbProximal.y>=-70.001);
  assert.ok(out.leftThumbDistal.y>=-90.001);
});
