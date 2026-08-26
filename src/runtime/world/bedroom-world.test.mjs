import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BedroomWorld } from './bedroom-world.mjs';

test('bedroom exposes semantic anchors and physical obstacle descriptors',()=>{
  const scene=new THREE.Scene();const room=new BedroomWorld({scene});
  assert.ok(room.anchor('bedApproach'));
  assert.ok(room.anchor('bedLie'));
  assert.ok(room.anchor('blanketGrab'));
  assert.ok(room.colliders.some(c=>c.name==='mattress'));
  assert.ok(room.colliders.some(c=>c.name==='wallBack'));
});

test('bedroom registers obstacles into body physics',()=>{
  const scene=new THREE.Scene();const room=new BedroomWorld({scene});const seen=[];
  room.registerPhysics({rebuildGround:r=>seen.push(['ground',r]),addFixedBoxCollider:c=>seen.push(['box',c.name])});
  assert.ok(seen.some(x=>x[0]==='ground'&&x[1]>=3.5));
  assert.ok(seen.some(x=>x[1]==='bedFrame'));
});

test('blanket verlet solver remains finite while opening and covering',()=>{
  const scene=new THREE.Scene();const room=new BedroomWorld({scene});
  for(const mode of ['open','cover'])for(let i=0;i<30;i++){room.setBlanket(mode,i/29);room.update(1/60);}
  const arr=room.blanket.geometry.attributes.position.array;
  for(const v of arr)assert.ok(Number.isFinite(v));
});
