import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NIVA_VRM_BONE_LIMITS,
  NIVA_VRM_EXPECTED_BONES,
  clampBoneRotation,
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

test('automatic showcase pose never leaves the safety envelope', () => {
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
