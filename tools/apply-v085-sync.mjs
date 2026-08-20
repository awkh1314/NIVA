import fs from 'node:fs';

function replaceOnce(file, before, after) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(after)) return false;
  if (!source.includes(before)) throw new Error(`Expected migration block not found in ${file}`);
  fs.writeFileSync(file, source.replace(before, after), 'utf8');
  return true;
}

const kokoroBefore = `  onStatus = () => {},\n  onMouth = () => {},\n) {\n  const clean = String(text || '').trim();\n  if (!clean) return;\n  const engine = await loadEngine(onStatus);\n  const prosody = voiceProsody(style, intensity);\n  const audio = await engine.generate(clean, { voice: VOICE, speed: prosody.speed });\n  await playRawAudio(audio, prosody.gain, onMouth);`;
const kokoroAfter = `  onStatus = () => {},\n  onMouth = () => {},\n  onReady = () => {},\n) {\n  const clean = String(text || '').trim();\n  if (!clean) return;\n  const engine = await loadEngine(onStatus);\n  const prosody = voiceProsody(style, intensity);\n  const audio = await engine.generate(clean, { voice: VOICE, speed: prosody.speed });\n  onReady();\n  await playRawAudio(audio, prosody.gain, onMouth);`;

const speakBefore = `async function speak(data){\n  const[style,intensity]=data.v||['neutral',.5];\n  if(!String(data.t||'').trim()){mouthLevel=0;return;}\n  speaking=true; mouthLevel=0;\n  try{\n    await speakWithKokoro(\n      data.t,style,intensity,\n      (status)=>{voiceBadge.textContent=status;},\n      (level)=>{mouthLevel=level;},\n    );`;
const speakAfter = `async function speak(data,onReady=()=>{}){\n  const[style,intensity]=data.v||['neutral',.5];\n  if(!String(data.t||'').trim()){mouthLevel=0;return;}\n  speaking=true; mouthLevel=0;\n  try{\n    await speakWithKokoro(\n      data.t,style,intensity,\n      (status)=>{voiceBadge.textContent=status;},\n      (level)=>{mouthLevel=level;},\n      onReady,\n    );`;

const queueBefore = `function processResponseQueue(){\n  if(activeResponse||!modelReady||!responseQueue.length)return;\n  const data=responseQueue.shift(); activeResponse={data,speechDone:false};\n  setEmotion(data.e); showBubble(data.t); planResponseMotions(data); updateQueueInfo();\n  if(data.t){speak(data).finally(()=>{if(activeResponse)activeResponse.speechDone=true;});}\n  else activeResponse.speechDone=true;\n}`;
const queueAfter = `function processResponseQueue(){\n  if(activeResponse||!modelReady||!responseQueue.length)return;\n  const data=responseQueue.shift(); activeResponse={data,speechDone:false,motionStarted:false};\n  setEmotion(data.e); showBubble(data.t); updateQueueInfo();\n  const startMotion=()=>{\n    if(!activeResponse||activeResponse.data!==data||activeResponse.motionStarted)return;\n    activeResponse.motionStarted=true;\n    planResponseMotions(data);\n  };\n  if(data.t){\n    speak(data,startMotion).finally(()=>{\n      startMotion();\n      if(activeResponse&&activeResponse.data===data)activeResponse.speechDone=true;\n    });\n  }else{\n    startMotion();\n    activeResponse.speechDone=true;\n  }\n}`;

const changed = [
  replaceOnce('src/kokoro-voice.mjs', kokoroBefore, kokoroAfter),
  replaceOnce('src/main.js', speakBefore, speakAfter),
  replaceOnce('src/main.js', queueBefore, queueAfter),
].some(Boolean);
console.log(changed ? 'Applied V0.85 audio-motion sync migration.' : 'V0.85 audio-motion sync already applied.');
