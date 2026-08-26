from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, content):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")


def replace_once(text, old, new, label):
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


bridge = r'''function cleanString(value) {
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
  return {
    text: cleanString(input.text),
    emotion: cleanString(input.emotion),
    motion: motionFrom(input.motion || input.action || input.gestures),
  };
}

export function createPublicMotionBridge({
  runMotion = () => false,
  stopMotion = () => {},
  setEmotion = () => {},
  speakText = () => {},
} = {}) {
  return function play(input = {}) {
    const cue = normalizePublicCue(input);
    let motionStarted = false;
    if (cue.motion === 'idle') {
      stopMotion();
      motionStarted = true;
    } else if (cue.motion) {
      motionStarted = runMotion(cue.motion, true) !== false;
    }
    if (cue.emotion) setEmotion(cue.emotion);
    if (cue.text) speakText(cue.text, Boolean(cue.motion));
    return { ...cue, motionStarted };
  };
}
'''
write("src/runtime/motion/public-motion-bridge.mjs", bridge)

bridge_test = r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createPublicMotionBridge, normalizePublicCue } from './public-motion-bridge.mjs';

test('normalizes object and legacy gesture tuple cues', () => {
  assert.deepEqual(
    normalizePublicCue({ text: ' 你好 ', emotion: ' happy ', gestures: [['wave', 'r', 0.65]] }),
    { text: '你好', emotion: 'happy', motion: 'wave' },
  );
  assert.deepEqual(normalizePublicCue('nod'), { text: '', emotion: '', motion: 'nod' });
});

test('public play starts motion before emotion and voice', () => {
  const events = [];
  const play = createPublicMotionBridge({
    runMotion: (name, allowWhileSpeaking) => { events.push(['motion', name, allowWhileSpeaking]); return true; },
    setEmotion: (name) => events.push(['emotion', name]),
    speakText: (text, allowAction) => events.push(['speak', text, allowAction]),
  });
  const result = play({ text: '你好', emotion: 'happy', motion: 'wave' });
  assert.deepEqual(events, [
    ['motion', 'wave', true],
    ['emotion', 'happy'],
    ['speak', '你好', true],
  ]);
  assert.equal(result.motionStarted, true);
});

test('idle stops current action and object contract is wired into main runtime', async () => {
  let stopped = 0;
  const play = createPublicMotionBridge({ stopMotion: () => { stopped += 1; } });
  assert.equal(play({ motion: 'idle' }).motionStarted, true);
  assert.equal(stopped, 1);
  const source = await fs.readFile(new URL('../../main.js', import.meta.url), 'utf8');
  assert.match(source, /createPublicMotionBridge/);
  assert.match(source, /play:publicPlay/);
  assert.match(source, /clips\.set\('wave'[\s\S]{0,2200}rightUpperArm/);
  assert.match(source, /if\(action==='nod'\)/);
});
'''
write("src/runtime/motion/public-motion-bridge.test.mjs", bridge_test)

main = read("src/main.js")
main = replace_once(
    main,
    "import { CharacterFrameDebug } from './runtime/debug/character-frame-debug.mjs';\n",
    "import { CharacterFrameDebug } from './runtime/debug/character-frame-debug.mjs';\nimport { createPublicMotionBridge } from './runtime/motion/public-motion-bridge.mjs';\n",
    "main import",
)

old_wave = "  clips.set('wave', makeClip('wave',2.05,{rightHand:[[0,0,0,0],[.42,-2,0,-4],[.62,-2,0,-4],[.82,-1,0,7],[1.04,-1,0,-7],[1.26,-1,0,7],[1.48,-1,0,-7],[1.70,-2,0,-3],[2.05,0,0,0]]}));"
new_wave = r'''  const waveDownZ=chooseArmDown('right');
  const waveMidZ=-waveDownZ*.34;
  const waveUpZ=-waveDownZ*.56;
  clips.set('wave', makeClip('wave',2.05,{
    rightShoulder:[[0,0,0,0],[.34,0,0,-waveDownZ*.06],[1.72,0,0,-waveDownZ*.06],[2.05,0,0,0]],
    rightUpperArm:[[0,2,0,waveDownZ],[.36,-8,4,waveMidZ],[.58,-16,8,waveUpZ],[1.68,-16,8,waveUpZ],[1.84,-6,3,waveMidZ],[2.05,2,0,waveDownZ]],
    rightLowerArm:[[0,0,10,0],[.44,0,52,0],[.66,0,68,0],[1.62,0,68,0],[1.82,0,44,0],[2.05,0,10,0]],
    rightHand:[[0,0,0,-4],[.58,-4,0,-8],[.78,-4,0,14],[.98,-4,0,-14],[1.18,-4,0,14],[1.38,-4,0,-14],[1.58,-4,0,10],[1.78,-2,0,-4],[2.05,0,0,-4]],
    chest:[[0,0,0,0],[.52,0,-2,0],[1.68,0,-2,0],[2.05,0,0,0]],
    head:[[0,0,0,0],[.52,0,-4,-2],[1.68,0,-4,-2],[2.05,0,0,0]],
  }));'''
main = replace_once(main, old_wave, new_wave, "full-body wave")

main = replace_once(
    main,
    "function playClip(name,{loop=false,duration=null}={}){\n  if(!mixer || !clips.has(name) || speaking || performance.now()<manualOverrideUntil) return false;",
    "function playClip(name,{loop=false,duration=null,allowWhileSpeaking=false}={}){\n  if(!mixer || !clips.has(name) || (!allowWhileSpeaking && speaking) || performance.now()<manualOverrideUntil) return false;",
    "playClip speech guard",
)

main = replace_once(
    main,
    "function performAction(action){\n",
    "function performAction(action,allowWhileSpeaking=false){\n  if(action==='idle'){stopAction();return true;}\n  if(action==='nod')return playClip('nod',{duration:1,allowWhileSpeaking});\n",
    "performAction signature",
)
main = replace_once(
    main,
    "if(action==='wave') return playClip('wave',{duration:2.05});",
    "if(action==='wave') return playClip('wave',{duration:2.05,allowWhileSpeaking});",
    "performAction wave",
)
main = replace_once(
    main,
    "if(action==='think') return playClip('think',{duration:2.5});",
    "if(action==='think') return playClip('think',{duration:2.5,allowWhileSpeaking});",
    "performAction think",
)
main = replace_once(
    main,
    "if(action==='walk'){ if(playClip('walk',{loop:true})){setTimeout(stopAction,3100);} return; }",
    "if(action==='walk'){ if(playClip('walk',{loop:true,allowWhileSpeaking})){setTimeout(stopAction,3100);} return; }",
    "performAction walk",
)
main = replace_once(
    main,
    "if(action==='run'){ if(playClip('run',{loop:true})){setTimeout(stopAction,2500);} return; }",
    "if(action==='run'){ if(playClip('run',{loop:true,allowWhileSpeaking})){setTimeout(stopAction,2500);} return; }",
    "performAction run",
)

old_api = "window.NIVA={version:'0.970-runtime-boundaries-v1',speak,act:(name)=>performAction(name),play:(name)=>playClip(name,{duration:clips.get(name)?.duration||2}),stop:stopAction,"
new_api = r'''const publicPlay=createPublicMotionBridge({
  runMotion:(name,allowWhileSpeaking=false)=>{
    if(['idle','wave','nod','think','walk','run','smile'].includes(name)) return performAction(name,allowWhileSpeaking);
    return playClip(name,{duration:clips.get(name)?.duration||2,allowWhileSpeaking});
  },
  stopMotion:stopAction,
  setEmotion:(name)=>{
    const intensity=name==='happy'?.28:name==='excited'?.30:.18;
    setExpression(name,intensity);
    setTimeout(()=>setExpression('neutral',0),2600);
  },
  speakText:speak,
});
window.NIVA={version:'0.99.0',speak,act:(name)=>performAction(name),play:publicPlay,stop:stopAction,'''
main = replace_once(main, old_api, new_api, "public API")
write("src/main.js", main)

package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
package["version"] = "0.99.0"
test_cmd = package["scripts"]["test"]
bridge_test_path = "src/runtime/motion/public-motion-bridge.test.mjs"
if bridge_test_path not in test_cmd:
    package["scripts"]["test"] = test_cmd + " " + bridge_test_path
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

desktop = read(".github/workflows/desktop.yml")
desktop = desktop.replace(
    '$Base = "https://huggingface.co/onnx-community/Kokoro-82M-v1.1-zh-ONNX/resolve/main"',
    '$Revision = "8b6f9672edefb3e00d1a946d79bb702c02519389"\n          $Base = "https://huggingface.co/onnx-community/Kokoro-82M-v1.1-zh-ONNX/resolve/$Revision"',
)
desktop = desktop.replace(
    'if ($hash -ne "5dc461e2a932be290d1deb86bd7f507ef6dcff2358e618338fe77fd810b11714") { throw "Kokoro model SHA256 mismatch: $hash" }',
    'if ($hash -ne "a39469be791eeaa3089c1ed5e58b8731d1f2462ea0e7dae2bc44388e58f973d8") { throw "Kokoro model SHA256 mismatch: $hash" }\n          $voiceHash=(Get-FileHash "$Voices\\zf_001.bin" -Algorithm SHA256).Hash.ToLower()\n          if ($voiceHash -ne "0a89ec12bb93fb9c74077924daf02568baad64e1f869389f5aaee01a386035f8") { throw "Kokoro voice SHA256 mismatch: $voiceHash" }',
)
desktop = desktop.replace("NIVA V0.85.1 Portable", "NIVA V0.99.0 Portable")
desktop = desktop.replace("gh release view v0.85-latest", "gh release view v0.99-latest")
desktop = desktop.replace("gh release delete v0.85-latest", "gh release delete v0.99-latest")
desktop = desktop.replace(
    'gh release create v0.85-latest NIVA-Windows-x64.zip --title "NIVA V0.85.1 Latest" --notes "Brain Interface + Performance Director + responsive Safe Pose warmup + browser/desktop Kokoro audio repair."',
    'gh release create v0.99-latest NIVA-Windows-x64.zip --title "NIVA V0.99.0 Latest" --notes "Free Life runtime + public Motion Bridge + Runtime Boundaries + Biomechanics V2 + pinned offline Kokoro zf_001."',
)
write(".github/workflows/desktop.yml", desktop)

tauri_path = ROOT / "src-tauri/tauri.conf.json"
tauri = json.loads(tauri_path.read_text(encoding="utf-8"))
tauri["version"] = "0.99.0"
tauri_path.write_text(json.dumps(tauri, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

cargo = read("src-tauri/Cargo.toml")
cargo, n = re.subn(r'(?m)^version = "0\.83\.0"$', 'version = "0.99.0"', cargo, count=1)
if n != 1 and 'version = "0.99.0"' not in cargo:
    raise RuntimeError("Cargo.toml version patch failed")
write("src-tauri/Cargo.toml", cargo)

readme = read("README.md")
readme = readme.replace("Current baseline: **NIVA 0.90 Free Life**.", "Current baseline: **NIVA 0.99.0 Free Life**.")
needle = "- Local authored walk / run / wave / think / reach motion clips\n"
addition = "- Stable public control contract: `NIVA.play({ text, emotion, motion })`\n- Motion Bridge drives visible full-arm `wave`, `nod`, `idle` and keeps string `play(name)` compatibility\n"
if addition not in readme:
    if needle not in readme:
        raise RuntimeError("README motion insertion point missing")
    readme = readme.replace(needle, needle + addition, 1)
write("README.md", readme)

Path(__file__).unlink()
print("NIVA v0.99 completion patch applied")
