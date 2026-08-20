import test from 'node:test';
import assert from 'node:assert/strict';
import { expandPerformance } from './director.mjs';

test('tai chi expands into named synchronized cues', () => {
  const cues = expandPerformance('tai_chi_beginner');
  assert.equal(cues.length,5);
  assert.equal(cues[0].t,'起式。');
  assert.equal(cues[2].g[0][0],'taiChiCloud');
  assert.equal(cues.at(-1).hold,false);
});
