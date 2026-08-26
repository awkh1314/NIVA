function cleanString(value) {
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
