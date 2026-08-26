import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { CharacterFrame } from '../../src/runtime/core/character-frame.mjs';

test('CharacterFrame uses +Z forward at yaw zero', () => {
  const root = new THREE.Object3D();
  const frame = new CharacterFrame(root);
  assert.deepEqual(frame.forward().toArray().map(v=>Math.round(v)), [0,0,1]);
  assert.deepEqual(frame.right().toArray().map(v=>Math.round(v)), [1,0,0]);
});

test('CharacterFrame yaw +90 rotates +Z forward to +X', () => {
  const root = new THREE.Object3D();
  root.rotation.y = Math.PI / 2;
  const frame = new CharacterFrame(root);
  const f = frame.forward();
  assert.ok(Math.abs(f.x - 1) < 1e-6);
  assert.ok(Math.abs(f.z) < 1e-6);
});

test('Physics module cannot own gesture or humanoid quaternion mutation', () => {
  const src = fs.readFileSync(new URL('../../src/runtime/physics/niva-body-physics.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['solveWavePose', 'solveCrouchHandsToHead', 'solveLocomotionArms', '.quaternion', 'rotation.y =']) {
    assert.equal(src.includes(forbidden), false, `physics contains forbidden ownership: ${forbidden}`);
  }
});

test('IK module cannot own root transform', () => {
  const src = fs.readFileSync(new URL('../../src/runtime/ik/niva-ik-system.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['scene.position.x =', 'scene.position.y =', 'scene.position.z =', 'scene.rotation.y =']) {
    assert.equal(src.includes(forbidden), false, `IK contains forbidden root ownership: ${forbidden}`);
  }
});
