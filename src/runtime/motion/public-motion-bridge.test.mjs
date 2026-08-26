import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createPublicMotionBridge, normalizePublicCue } from './public-motion-bridge.mjs';
test('normalizes object and legacy gesture tuple cues',()=>{
  assert.deepEqual(normalizePublicCue({text:' 你好 ',emotion:' happy ',gestures:[['wave','r',.65]]}),{text:'你好',emotion:'happy',motion:'wave'});
  assert.deepEqual(normalizePublicCue('nod'),{text:'',emotion:'',motion:'nod'});
});
test('public play starts motion before emotion and voice',()=>{
  const events=[]; const play=createPublicMotionBridge({
    runMotion:(name,allow)=>{events.push(['motion',name,allow]);return true;},
    setEmotion:name=>events.push(['emotion',name]), speakText:(text,allow)=>events.push(['speak',text,allow])});
  const result=play({text:'你好',emotion:'happy',motion:'wave'});
  assert.deepEqual(events,[['motion','wave',true],['emotion','happy'],['speak','你好',true]]); assert.equal(result.motionStarted,true);
});
test('idle stops and active runtime exposes object Motion Bridge',async()=>{
  let stopped=0; const play=createPublicMotionBridge({stopMotion:()=>stopped++}); assert.equal(play({motion:'idle'}).motionStarted,true); assert.equal(stopped,1);
  const source=await fs.readFile(new URL('../../main.js',import.meta.url),'utf8');
  assert.match(source,/createPublicMotionBridge/); assert.match(source,/play:publicPlay/); assert.match(source,/clips\.set\('wave'[\s\S]{0,2200}rightUpperArm/); assert.match(source,/if\(action==='nod'\)/);
});
