import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceProsody } from './voice-prosody.mjs';

test('neutral prosody stays unchanged', () => {
  assert.deepEqual(voiceProsody('neutral', 1), { speed: 1, gain: 1 });
});

test('emotion intensity interpolates instead of jumping', () => {
  const half = voiceProsody('excited', 0.5);
  assert.ok(Math.abs(half.speed - 1.05) < 1e-12);
  assert.ok(Math.abs(half.gain - 1.035) < 1e-12);
});

test('unknown styles fail closed to neutral', () => {
  assert.deepEqual(voiceProsody('unknown', 1), { speed: 1, gain: 1 });
});
