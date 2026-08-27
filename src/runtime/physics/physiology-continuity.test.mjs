import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysiologyOscillator } from './biomechanics-life.mjs';

test('deep breath preset enters and exits without a one-frame chest jump',()=>{
  const p=new PhysiologyOscillator();let prev=0,maxDelta=0,v;
  for(let i=0;i<180;i++){v=p.update(1/60,{breathsPerMinute:12,heartRate:68,breathAmplitude:.35,deepBreath:false});prev=v.chestPitchDeg;}
  for(let i=0;i<180;i++){v=p.update(1/60,{breathsPerMinute:12,heartRate:68,breathAmplitude:.35,deepBreath:true});maxDelta=Math.max(maxDelta,Math.abs(v.chestPitchDeg-prev));prev=v.chestPitchDeg;}
  for(let i=0;i<240;i++){v=p.update(1/60,{breathsPerMinute:12,heartRate:68,breathAmplitude:.35,deepBreath:false});maxDelta=Math.max(maxDelta,Math.abs(v.chestPitchDeg-prev));prev=v.chestPitchDeg;}
  assert.ok(maxDelta<.045,`deep-breath transition jumped ${maxDelta} deg/frame`);
  assert.ok(v.deepBreathEnvelope<.03);
});

test('deep-breath envelope ramps rather than toggles',()=>{
  const p=new PhysiologyOscillator();const first=p.update(1/60,{deepBreath:true});assert.ok(first.deepBreathEnvelope>0&&first.deepBreathEnvelope<.2);let v=first;for(let i=0;i<120;i++)v=p.update(1/60,{deepBreath:true});assert.ok(v.deepBreathEnvelope>.9);const after=v.deepBreathEnvelope;v=p.update(1/60,{deepBreath:false});assert.ok(v.deepBreathEnvelope<after&&v.deepBreathEnvelope>.7);
});
