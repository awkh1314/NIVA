import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { CharacterFrame } from '../../src/runtime/core/character-frame.mjs';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('CharacterFrame uses +Z forward at yaw zero', () => {
  const root = new THREE.Object3D();
  const frame = new CharacterFrame(root);
  const f = frame.forward();
  const r = frame.right();
  assert.ok(near(f.x, 0) && near(f.y, 0) && near(f.z, 1));
  assert.ok(near(r.x, 1) && near(r.y, 0) && near(r.z, 0));
});

test('CharacterFrame yaw +90 rotates +Z forward to +X', () => {
  const root = new THREE.Object3D();
  root.rotation.y = Math.PI / 2;
  const frame = new CharacterFrame(root);
  const f = frame.forward();
  assert.ok(near(f.x, 1));
  assert.ok(near(f.z, 0));
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
