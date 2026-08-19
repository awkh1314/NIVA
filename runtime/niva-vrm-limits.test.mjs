import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NIVA_VRM_BONE_LIMITS,
  NIVA_VRM_EXPECTED_BONES,
  clampBoneRotation,
  randomSafePose,
  safeDemoPose,
  validateLimitTable,
} from './niva-vrm-limits.mjs';

test('covers every humanoid bone present in the NIVA VRM', () => {
  assert.equal(NIVA_VRM_EXPECTED_BONES.length, 54);
  assert.deepEqual(Object.keys(NIVA_VRM_BONE_LIMITS).sort(), [...NIVA_VRM_EXPECTED_BONES].sort());
  assert.deepEqual(validateLimitTable(), { ok: true, missing: [], extra: [], invalid: [] });
});

test('hard clamps manual rotations to the configured envelope', () => {
  const head = clampBoneRotation('head', { x: 999, y: -999, z: 999 });
  assert.equal(head.x, NIVA_VRM_BONE_LIMITS.head.x.max);
  assert.equal(head.y, NIVA_VRM_BONE_LIMITS.head.y.min);
  assert.equal(head.z, NIVA_VRM_BONE_LIMITS.head.z.max);
});

test('legacy small-motion showcase pose never leaves the safety envelope', () => {
  for (let t = 0; t <= 120; t += 0.25) {
    const pose = safeDemoPose(t, 1);
    for (const [name, r] of Object.entries(pose)) {
      const l = NIVA_VRM_BONE_LIMITS[name];
      assert.ok(r.x >= l.x.min && r.x <= l.x.max, `${name}.x @ ${t}`);
      assert.ok(r.y >= l.y.min && r.y <= l.y.max, `${name}.y @ ${t}`);
      assert.ok(r.z >= l.z.min && r.z <= l.z.max, `${name}.z @ ${t}`);
    }
  }
});

test('full-ROM random pose can reach min/max edges and never exceeds them', () => {
  const minPose = randomSafePose(1, () => 0, 0.36);
  const maxPose = randomSafePose(1, () => 0.2, 0.36);
  for (const name of NIVA_VRM_EXPECTED_BONES) {
    const l = NIVA_VRM_BONE_LIMITS[name];
    for (const axis of ['x', 'y', 'z']) {
      assert.equal(minPose[name][axis], l[axis].min, `${name}.${axis} min edge`);
      assert.equal(maxPose[name][axis], l[axis].max, `${name}.${axis} max edge`);
    }
  }

  let seed = 123456789;
  const seeded = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let i = 0; i < 500; i += 1) {
    const pose = randomSafePose(1, seeded, 0.36);
    for (const [name, r] of Object.entries(pose)) {
      const l = NIVA_VRM_BONE_LIMITS[name];
      assert.ok(r.x >= l.x.min && r.x <= l.x.max, `${name}.x random ${i}`);
      assert.ok(r.y >= l.y.min && r.y <= l.y.max, `${name}.y random ${i}`);
      assert.ok(r.z >= l.z.min && r.z <= l.z.max, `${name}.z random ${i}`);
    }
  }
});

test('zero intensity collapses random motion to each joint neutral', () => {
  const pose = randomSafePose(0, Math.random, 0.36);
  for (const name of NIVA_VRM_EXPECTED_BONES) {
    const l = NIVA_VRM_BONE_LIMITS[name];
    assert.deepEqual(pose[name], { x: l.x.neutral, y: l.y.neutral, z: l.z.neutral });
  }
});
