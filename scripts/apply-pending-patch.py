from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]

def read(path): return (ROOT / path).read_text(encoding='utf-8')
def write(path, content):
    p=ROOT/path; p.parent.mkdir(parents=True,exist_ok=True); p.write_text(content,encoding='utf-8')
def replace_once(text, old, new, label):
    if new in text: return text
    n=text.count(old)
    if n!=1: raise RuntimeError(f'{label}: expected one match, found {n}')
    return text.replace(old,new,1)

write('src/runtime/motion/public-motion-bridge.mjs', r'''function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}
function motionFrom(value) {
  if (Array.isArray(value)) {
    const first = value[0];
    if (Array.isArray(first)) return cleanString(first[0]);
    return cleanString(first);
  }
  return cleanString(value);
}
export function normalizePublicCue(input) {
  if (typeof input === 'string') return { text: '', emotion: '', motion: cleanString(input) };
  if (!input || typeof input !== 'object') return { text: '', emotion: '', motion: '' };
  return { text: cleanString(input.text), emotion: cleanString(input.emotion), motion: motionFrom(input.motion || input.action || input.gestures) };
}
export function createPublicMotionBridge({ runMotion=()=>false, stopMotion=()=>{}, setEmotion=()=>{}, speakText=()=>{} }={}) {
  return function play(input={}) {
    const cue=normalizePublicCue(input); let motionStarted=false;
    if(cue.motion==='idle'){ stopMotion(); motionStarted=true; }
    else if(cue.motion) motionStarted=runMotion(cue.motion,true)!==false;
    if(cue.emotion) setEmotion(cue.emotion);
    if(cue.text) speakText(cue.text,Boolean(cue.motion));
    return {...cue,motionStarted};
  };
}
''')

write('src/runtime/motion/public-motion-bridge.test.mjs', r'''import test from 'node:test';
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
''')

main=read('src/main.js')
main=replace_once(main,"import { CharacterFrameDebug } from './runtime/debug/character-frame-debug.mjs';\n","import { CharacterFrameDebug } from './runtime/debug/character-frame-debug.mjs';\nimport { createPublicMotionBridge } from './runtime/motion/public-motion-bridge.mjs';\n",'import')
old="  clips.set('wave', makeClip('wave',2.05,{rightHand:[[0,0,0,0],[.42,-2,0,-4],[.62,-2,0,-4],[.82,-1,0,7],[1.04,-1,0,-7],[1.26,-1,0,7],[1.48,-1,0,-7],[1.70,-2,0,-3],[2.05,0,0,0]]}));"
new=r'''  const waveDownZ=chooseArmDown('right');
  const waveMidZ=-waveDownZ*.34,waveUpZ=-waveDownZ*.56;
  clips.set('wave', makeClip('wave',2.05,{
    rightShoulder:[[0,0,0,0],[.34,0,0,-waveDownZ*.06],[1.72,0,0,-waveDownZ*.06],[2.05,0,0,0]],
    rightUpperArm:[[0,2,0,waveDownZ],[.36,-8,4,waveMidZ],[.58,-16,8,waveUpZ],[1.68,-16,8,waveUpZ],[1.84,-6,3,waveMidZ],[2.05,2,0,waveDownZ]],
    rightLowerArm:[[0,0,10,0],[.44,0,52,0],[.66,0,68,0],[1.62,0,68,0],[1.82,0,44,0],[2.05,0,10,0]],
    rightHand:[[0,0,0,-4],[.58,-4,0,-8],[.78,-4,0,14],[.98,-4,0,-14],[1.18,-4,0,14],[1.38,-4,0,-14],[1.58,-4,0,10],[1.78,-2,0,-4],[2.05,0,0,-4]],
    chest:[[0,0,0,0],[.52,0,-2,0],[1.68,0,-2,0],[2.05,0,0,0]], head:[[0,0,0,0],[.52,0,-4,-2],[1.68,0,-4,-2],[2.05,0,0,0]]
  }));'''
main=replace_once(main,old,new,'wave')
main=replace_once(main,"function playClip(name,{loop=false,duration=null}={}){\n  if(!mixer || !clips.has(name) || speaking || performance.now()<manualOverrideUntil) return false;","function playClip(name,{loop=false,duration=null,allowWhileSpeaking=false}={}){\n  if(!mixer || !clips.has(name) || (!allowWhileSpeaking && speaking) || performance.now()<manualOverrideUntil) return false;",'playClip')
main=replace_once(main,"function performAction(action){\n","function performAction(action,allowWhileSpeaking=false){\n  if(action==='idle'){stopAction();return true;}\n  if(action==='nod')return playClip('nod',{duration:1,allowWhileSpeaking});\n",'performAction')
main=replace_once(main,"if(action==='wave') return playClip('wave',{duration:2.05});","if(action==='wave') return playClip('wave',{duration:2.05,allowWhileSpeaking});",'wave action')
main=replace_once(main,"if(action==='think') return playClip('think',{duration:2.5});","if(action==='think') return playClip('think',{duration:2.5,allowWhileSpeaking});",'think action')
main=replace_once(main,"if(action==='walk'){ if(playClip('walk',{loop:true})){setTimeout(stopAction,3100);} return; }","if(action==='walk'){ if(playClip('walk',{loop:true,allowWhileSpeaking})){setTimeout(stopAction,3100);} return; }",'walk action')
main=replace_once(main,"if(action==='run'){ if(playClip('run',{loop:true})){setTimeout(stopAction,2500);} return; }","if(action==='run'){ if(playClip('run',{loop:true,allowWhileSpeaking})){setTimeout(stopAction,2500);} return; }",'run action')
old_api="window.NIVA={version:'0.970-runtime-boundaries-v1',speak,act:(name)=>performAction(name),play:(name)=>playClip(name,{duration:clips.get(name)?.duration||2}),stop:stopAction,"
new_api=r'''const publicPlay=createPublicMotionBridge({
  runMotion:(name,allowWhileSpeaking=false)=>['idle','wave','nod','think','walk','run','smile'].includes(name)?performAction(name,allowWhileSpeaking):playClip(name,{duration:clips.get(name)?.duration||2,allowWhileSpeaking}),
  stopMotion:stopAction,
  setEmotion:(name)=>{const intensity=name==='happy'?.28:name==='excited'?.30:.18;setExpression(name,intensity);setTimeout(()=>setExpression('neutral',0),2600);},
  speakText:speak,
});
window.NIVA={version:'0.99.0',speak,act:(name)=>performAction(name),play:publicPlay,stop:stopAction,'''
main=replace_once(main,old_api,new_api,'public API')
write('src/main.js',main)

p=ROOT/'package.json'; package=json.loads(p.read_text(encoding='utf-8')); package['version']='0.99.0'; t='src/runtime/motion/public-motion-bridge.test.mjs'
if t not in package['scripts']['test']: package['scripts']['test']+=' '+t
p.write_text(json.dumps(package,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

p=ROOT/'src-tauri/tauri.conf.json'; conf=json.loads(p.read_text(encoding='utf-8')); conf['version']='0.99.0'; p.write_text(json.dumps(conf,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
cargo=read('src-tauri/Cargo.toml'); cargo=re.sub(r'(?m)^version = "0\.83\.0"$','version = "0.99.0"',cargo,count=1); write('src-tauri/Cargo.toml',cargo)
readme=read('README.md').replace('Current baseline: **NIVA 0.90 Free Life**.','Current baseline: **NIVA 0.99.0 Free Life**.')
needle='- Local authored walk / run / wave / think / reach motion clips\n'; add='- Stable public control contract: `NIVA.play({ text, emotion, motion })`\n- Motion Bridge drives visible full-arm `wave`, `nod`, `idle` and keeps string `play(name)` compatibility\n'
if add not in readme: readme=readme.replace(needle,needle+add,1)
write('README.md',readme)
Path(__file__).unlink()
print('NIVA v0.99 source completion patch applied')
