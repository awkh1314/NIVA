import test from 'node:test';
import assert from 'node:assert/strict';
import {
  directBrainPerformance,
  expandPerformance,
  idleDirectorCue,
  inferPerformanceIntent,
} from './director.mjs';

test('tai chi expands into named synchronized cues', () => {
  const cues = expandPerformance('tai_chi_beginner');
  assert.equal(cues.length,5);
  assert.equal(cues[0].t,'起式。');
  assert.equal(cues[2].g[0][0],'taiChiCloud');
  assert.equal(cues.at(-1).hold,false);
});

test('director infers greeting and adds gestures when brain omitted them', () => {
  const brain = { type:'conversation', text:'你好 NIVA', emotion:'happy', voice:{style:'neutral',intensity:.5} };
  assert.equal(inferPerformanceIntent(brain),'greeting');
  const directed = directBrainPerformance(brain);
  assert.equal(directed.directorIntent,'greeting');
  assert.equal(directed.gestures[0][0],'wave');
  assert.equal(directed.voice.style,'bright');
});

test('director preserves explicit gestures from brain', () => {
  const brain = { type:'conversation', text:'测试', emotion:'neutral', gestures:[['point','r',.4]], voice:{style:'serious',intensity:.4} };
  assert.equal(directBrainPerformance(brain),brain);
});

test('idle director always returns a valid gesture tuple', () => {
  const cue = idleDirectorCue('thinking',3);
  assert.equal(cue.length,3);
  assert.equal(typeof cue[0],'string');
  assert.ok(cue[2] >= .15 && cue[2] <= 1);
});
