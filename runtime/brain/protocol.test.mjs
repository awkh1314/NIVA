import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBrainResponse, fallbackBrainResponse } from './protocol.mjs';

test('brain protocol keeps sparse valid fields', () => {
  const out = normalizeBrainResponse({text:'你好',emotion:'happy',gestures:[['wave','r',3],['bad','l',1]],voice:['bright',.5]});
  assert.equal(out.text,'你好');
  assert.deepEqual(out.gestures,[['wave','r',1]]);
  assert.equal(out.voice.style,'bright');
});

test('tai chi fallback selects local performance', () => {
  const out = fallbackBrainResponse('给我打一套太极');
  assert.equal(out.performance,'tai_chi_beginner');
  assert.equal(out.type,'performance');
});
