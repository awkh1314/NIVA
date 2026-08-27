import test from 'node:test';
import assert from 'node:assert/strict';
import { SINGLE_STEP_DURATION, sampleSingleStepMarch } from './single-step-march.mjs';

test('single step begins and ends in balanced double support',()=>{
  const a=sampleSingleStepMarch(0,{side:'left'}),b=sampleSingleStepMarch(SINGLE_STEP_DURATION,{side:'left'});
  assert.equal(a.stance.left,true);assert.equal(a.stance.right,true);
  assert.ok(Math.abs(a.supportLoad.left+a.supportLoad.right-1)<1e-9);
  assert.equal(b.phase,'attention-settle');assert.equal(b.stance.left,true);assert.equal(b.stance.right,true);
  assert.ok(Math.abs(b.supportLoad.left-.5)<1e-9);assert.ok(Math.abs(b.supportLoad.right-.5)<1e-9);
});

test('lead foot unloads while rear foot carries the body',()=>{
  const s=sampleSingleStepMarch(SINGLE_STEP_DURATION*.20,{side:'left'});
  assert.equal(s.phase,'lead-swing');assert.equal(s.left.contact,false);assert.equal(s.right.contact,true);
  assert.equal(s.supportLoad.left,0);assert.equal(s.supportLoad.right,1);assert.equal(s.freeFoot,'left');
});

test('heel strike transfers load continuously onto the lead foot',()=>{
  const a=sampleSingleStepMarch(SINGLE_STEP_DURATION*.31,{side:'left'}),b=sampleSingleStepMarch(SINGLE_STEP_DURATION*.40,{side:'left'});
  assert.equal(a.left.heelContact,1);assert.equal(b.left.heelContact,1);assert.ok(b.supportLoad.left>a.supportLoad.left);
  assert.ok(b.left.toeContact>a.left.toeContact);
});

test('rear leg becomes the free recovery leg after toe-off',()=>{
  const s=sampleSingleStepMarch(SINGLE_STEP_DURATION*.69,{side:'left'});
  assert.equal(s.phase,'trail-recovery');assert.equal(s.right.contact,false);assert.equal(s.left.contact,true);
  assert.equal(s.freeFoot,'right');assert.equal(s.supportLoad.left,1);
});

test('root progress is monotonic and completes exactly one stride',()=>{
  let prev=-1;
  for(let i=0;i<=100;i++){
    const s=sampleSingleStepMarch(SINGLE_STEP_DURATION*i/100,{side:'right'});
    assert.ok(s.rootProgress>=prev-1e-9);prev=s.rootProgress;
    assert.ok(Math.abs(s.supportLoad.left+s.supportLoad.right-1)<1e-9);
  }
  assert.equal(sampleSingleStepMarch(SINGLE_STEP_DURATION,{side:'right'}).rootProgress,1);
});
