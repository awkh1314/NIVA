import fs from 'node:fs';

const path = 'src/main.js';
let src = fs.readFileSync(path, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (src.includes(newText)) return;
  if (!src.includes(oldText)) throw new Error(`V0.85.1 migration target missing: ${label}`);
  src = src.replace(oldText, newText);
}

replaceOnce(
  "import { kokoroVoiceStatus, speakWithKokoro } from './kokoro-voice.mjs';",
  "import { kokoroVoiceStatus, preloadKokoro, speakWithKokoro, unlockKokoroAudio } from './kokoro-voice.mjs';",
  'kokoro imports',
);

replaceOnce(
`function buildSafePoseBank() {
  const base = neutralPose();
  safePoseBank = [];
  plannerBadge.textContent = '预计算安全姿态…';
  const intensities = [0.28,0.46,0.64,0.82];
  for (const name of NIVA_GESTURES) {
    for (const side of bankSides(name)) {
      for (const intensity of intensities) {
        for (let variant = 0; variant < 2; variant += 1) {
          const patch = gesturePatch(name, side, intensity, NIVA_VRM_BONE_LIMITS, variant);
          const candidate = applyCoupledJointConstraints(applyPosePatch(base, patch, NIVA_VRM_BONE_LIMITS), NIVA_VRM_BONE_LIMITS);
          const end = validatePose(candidate);
          if (!end.safe) { plannerRejectCount += 1; continue; }
          const path = validatePath(base, candidate, 12);
          if (!path.safe) continue;
          safePoseBank.push({ name, side, intensity, variant, patch });
        }
      }
    }
  }
  plannerBadge.textContent = \`V0.85 就绪 · \${safePoseBank.length} 安全姿态\`;
  updateStats();
}`,
`async function buildSafePoseBank() {
  const base = neutralPose();
  safePoseBank = [];
  const intensities = [0.28,0.46,0.64,0.82];
  const total = NIVA_GESTURES.reduce((sum,name)=>sum+bankSides(name).length*intensities.length*2,0);
  let checked = 0;
  plannerBadge.textContent = \`安全姿态预计算 0/\${total}\`;
  for (const name of NIVA_GESTURES) {
    for (const side of bankSides(name)) {
      for (const intensity of intensities) {
        for (let variant = 0; variant < 2; variant += 1) {
          const patch = gesturePatch(name, side, intensity, NIVA_VRM_BONE_LIMITS, variant);
          const candidate = applyCoupledJointConstraints(applyPosePatch(base, patch, NIVA_VRM_BONE_LIMITS), NIVA_VRM_BONE_LIMITS);
          const end = validatePose(candidate);
          if (!end.safe) plannerRejectCount += 1;
          else {
            const pathCheck = validatePath(base, candidate, 12);
            if (pathCheck.safe) safePoseBank.push({ name, side, intensity, variant, patch });
          }
          checked += 1;
          if (checked % 6 === 0) {
            plannerBadge.textContent = \`安全姿态预计算 \${checked}/\${total}\`;
            updateStats();
            await new Promise((resolve)=>requestAnimationFrame(resolve));
          }
        }
      }
    }
  }
  plannerBadge.textContent = \`V0.85.1 就绪 · \${safePoseBank.length} 安全姿态\`;
  updateStats();
}`,
  'async safe pose bank',
);

replaceOnce(
`function processResponseQueue(){
  if(activeResponse||!modelReady||!responseQueue.length)return;
  const data=responseQueue.shift(); activeResponse={data,speechDone:false,motionStarted:false};
  setEmotion(data.e); showBubble(data.t); updateQueueInfo();
  const startMotion=()=>{
    if(!activeResponse||activeResponse.data!==data||activeResponse.motionStarted)return;
    activeResponse.motionStarted=true;
    planResponseMotions(data);
  };
  if(data.t){
    speak(data,startMotion).finally(()=>{
      startMotion();
      if(activeResponse&&activeResponse.data===data)activeResponse.speechDone=true;
    });
  }else{
    startMotion();
    activeResponse.speechDone=true;
  }
}`,
`function processResponseQueue(){
  if(activeResponse||!modelReady||!responseQueue.length)return;
  const data=responseQueue.shift(); activeResponse={data,speechDone:false,motionStarted:false};
  setEmotion(data.e); showBubble(data.t); updateQueueInfo();
  const startMotion=()=>{
    if(!activeResponse||activeResponse.data!==data||activeResponse.motionStarted)return;
    activeResponse.motionStarted=true;
    planResponseMotions(data);
  };
  if(data.t){
    const motionFallbackTimer=setTimeout(()=>{
      if(activeResponse&&activeResponse.data===data&&!activeResponse.motionStarted){
        voiceBadge.textContent='Kokoro 正在准备 · 动作不阻塞';
        startMotion();
      }
    },1800);
    speak(data,startMotion).finally(()=>{
      clearTimeout(motionFallbackTimer);
      startMotion();
      if(activeResponse&&activeResponse.data===data)activeResponse.speechDone=true;
    });
  }else{
    startMotion();
    activeResponse.speechDone=true;
  }
}`,
  'nonblocking cue start',
);

replaceOnce(
`function installUi(){
  $('#closePanel').addEventListener('click',()=>setPanelVisible(false));`,
`function installUi(){
  const unlockVoice=()=>{unlockKokoroAudio((status)=>{voiceBadge.textContent=status;});};
  document.addEventListener('pointerdown',unlockVoice,{capture:true});
  document.addEventListener('keydown',unlockVoice,{capture:true});
  $('#closePanel').addEventListener('click',()=>setPanelVisible(false));`,
  'user activation audio unlock',
);

replaceOnce(
`function probeVoice(){voiceBadge.textContent=kokoroVoiceStatus();}`,
`function probeVoice(){
  voiceBadge.textContent=kokoroVoiceStatus();
  preloadKokoro((status)=>{voiceBadge.textContent=status;});
}`,
  'background voice prewarm',
);

replaceOnce(
`function animate(now=performance.now()){
  requestAnimationFrame(animate);
  if(modelReady){scheduleSafeIdle(now);updateMotion(now);updateBlink(now);updateMouth(now);maybeCompleteResponse();vrm?.update(1/60);}
  renderer.render(scene,camera);
}`,
`function animate(now=performance.now()){
  requestAnimationFrame(animate);
  if(vrm){updateBlink(now);updateMouth(now);}
  if(modelReady){scheduleSafeIdle(now);updateMotion(now);maybeCompleteResponse();}
  vrm?.update(1/60);
  renderer.render(scene,camera);
}`,
  'render while bank warms',
);

replaceOnce(
`  loader.load(MODEL_URL,(gltf)=>{
    vrm=gltf.userData.vrm; VRMUtils.removeUnnecessaryVertices(vrm.scene); VRMUtils.combineSkeletons(vrm.scene); vrm.scene.traverse((obj)=>{obj.frustumCulled=false;});
    avatarRoot.add(vrm.scene); currentPose=neutralPose(); setImmediatePose(currentPose); fitCamera();
    collisionThresholds=calibrateCollisionThresholds(captureWorldPoints(),modelHeight); buildSafePoseBank(); modelReady=true;
    nextIdleAt=performance.now()+1800; nextBlinkAt=performance.now()+900+Math.random()*900;
    plannerBadge.textContent=\`V0.85 就绪 · \${safePoseBank.length} 安全姿态\`; updateStats(); processResponseQueue();`,
`  loader.load(MODEL_URL,async(gltf)=>{
    vrm=gltf.userData.vrm; VRMUtils.removeUnnecessaryVertices(vrm.scene); VRMUtils.combineSkeletons(vrm.scene); vrm.scene.traverse((obj)=>{obj.frustumCulled=false;});
    avatarRoot.add(vrm.scene); currentPose=neutralPose(); setImmediatePose(currentPose); fitCamera();
    collisionThresholds=calibrateCollisionThresholds(captureWorldPoints(),modelHeight);
    nextIdleAt=performance.now()+1800; nextBlinkAt=performance.now()+500+Math.random()*700;
    await buildSafePoseBank(); modelReady=true;
    plannerBadge.textContent=\`V0.85.1 就绪 · \${safePoseBank.length} 安全姿态\`; updateStats(); processResponseQueue();`,
  'async model boot',
);

replaceOnce("const BUILD = '0.85.0';", "const BUILD = '0.85.1';", 'build version');

fs.writeFileSync(path, src);
console.log('V0.85.1 runtime fixes applied');
