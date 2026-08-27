import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OutdoorEnvironment } from './outdoor-environment.mjs';
import { BedroomWorld } from './bedroom-world.mjs';

test('outdoor world exposes walkable grass sky sun moon and stars',()=>{
  const scene=new THREE.Scene();const world=new OutdoorEnvironment({scene,timeOfDay:.25,auto:false});const s=world.state();
  assert.equal(s.grass,true);assert.ok(s.grassInstances>500);assert.equal(s.sky,true);assert.equal(s.sun,true);assert.equal(s.moon,true);assert.equal(s.stars,true);assert.ok(s.walkableSize.x>=40);assert.ok(scene.fog);
});

test('day night update moves directional sun and toggles stars',()=>{
  const scene=new THREE.Scene();const world=new OutdoorEnvironment({scene,timeOfDay:.25,auto:false});world.update(0);const noonY=world.sunLight.position.y;assert.equal(world.stars.visible,false);world.setTimeOfDay(.75);world.update(0);assert.ok(world.sunLight.position.y<noonY);assert.equal(world.stars.visible,true);assert.ok(world.starMaterial.opacity>.8);
});

test('cozy room preserves bed colliders and a physically open doorway to lawn',()=>{
  const scene=new THREE.Scene();const world=new BedroomWorld({scene,autoDayNight:false});assert.ok(world.anchor('bedApproach'));assert.ok(world.anchor('doorOutside'));assert.ok(world.anchor('lawnCenter'));assert.ok(world.colliders.some(c=>c.name==='mattress'));assert.ok(world.colliders.some(c=>c.name==='wallFrontLeft'));assert.ok(world.colliders.some(c=>c.name==='wallFrontRight'));assert.ok(!world.colliders.some(c=>c.name==='wallFront'));
});
