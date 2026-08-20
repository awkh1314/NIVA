import fs from 'node:fs';

function replaceOnce(file, before, after) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(after)) return false;
  if (!source.includes(before)) throw new Error(`Expected runtime-fix block not found in ${file}`);
  fs.writeFileSync(file, source.replace(before, after), 'utf8');
  return true;
}

const importBefore = `import { kokoroVoiceStatus, speakWithKokoro } from './kokoro-voice.mjs';`;
const importAfter = `import { kokoroVoiceStatus, primeKokoroAudio, speakWithKokoro, warmKokoro } from './kokoro-voice.mjs';`;

const bankStateBefore = `let safePoseBank = [];\nlet currentPose = neutralPose();`;
const bankStateAfter = `let safePoseBank = [];\nlet safeBankReady = false;\nlet currentPose = neutralPose();`;

const bankBefore = `function buildSafePoseBank() {\n  const base = neutralPose();\n  safePoseBank = [];\n  plannerBadge.textContent = '预计算安全姿态…';\n  const intensities = [0.28,0.46,0.64,0.82];\n  for (const name of NIVA_GESTURES) {\n    for (const side of bankSides(name)) {\n      for (const intensity of intensities) {\n        for (let variant = 0; variant < 2; variant += 1) {\n          const patch = gesturePatch(name, side, intensity, NIVA_VRM_BONE_LIMITS, variant);\n          const candidate = applyCoupledJointConstraints(applyPosePatch(base, patch, NIVA_VRM_BONE_LIMITS), NIVA_VRM_BONE_LIMITS);\n          const end = validatePose(candidate);\n          if (!end.safe) { plannerRejectCount += 1; continue; }\n          const path = validatePath(base, candidate, 12);\n          if (!path.safe) continue;\n          safePoseBank.push({ name, side, intensity, variant, patch });\n        }\n      }\n    }\n  }\n  plannerBadge.textContent = \`V0.85 就绪 · \${safePoseBank.length} 安全姿态\`;\n  updateStats();\n}`;
const bankAfter = `async function buildSafePoseBank() {\n  const base = neutralPose();\n  safePoseBank = [];\n  safeBankReady = false;\n  plannerBadge.textContent = '安全姿态库 0%';\n  const intensities = [0.28,0.46,0.64,0.82];\n  const tasks = [];\n  for (const name of NIVA_GESTURES) for (const side of bankSides(name)) for (const intensity of intensities) for (let variant=0; variant<2; variant+=1) tasks.push({name,side,intensity,variant});\n  for (let index=0; index<tasks.length; index+=1) {\n    const {name,side,intensity,variant}=tasks[index];\n    const patch = gesturePatch(name, side, intensity, NIVA_VRM_BONE_LIMITS, variant);\n    const candidate = applyCoupledJointConstraints(applyPosePatch(base, patch, NIVA_VRM_BONE_LIMITS), NIVA_VRM_BONE_LIMITS);\n    const end = validatePose(candidate);\n    if (!end.safe) plannerRejectCount += 1;\n    else {\n      const path = validatePath(base, candidate, 12);\n      if (path.safe) safePoseBank.push({ name, side, intensity, variant, patch });\n    }\n    if (index % 4 === 3 || index === tasks.length - 1) {\n      const percent = Math.round(((index + 1) / tasks.length) * 100);\n      plannerBadge.textContent = \`安全姿态库 \${percent}% · \${safePoseBank.length}\`;\n      updateStats();\n      await new Promise((resolve)=>requestAnimationFrame(resolve));\n    }\n  }\n  safeBankReady = true;\n  plannerBadge.textContent = \`V0.85.1 就绪 · \${safePoseBank.length} 安全姿态\`;\n  updateStats();\n  processResponseQueue();\n}`;

const idleBefore = `if(!modelReady||activeResponse||responseQueue.length||speaking||currentSegment||motionQueue.length||now<nextIdleAt)return;`;
const idleAfter = `if(!modelReady||!safeBankReady||activeResponse||responseQueue.length||speaking||currentSegment||motionQueue.length||now<nextIdleAt)return;`;

const queueGuardBefore = `if(activeResponse||!modelReady||!responseQueue.length)return;`;
const queueGuardAfter = `if(activeResponse||!modelReady||!safeBankReady||!responseQueue.length)return;`;

const uiBefore = `function installUi(){\n  $('#closePanel').addEventListener('click',()=>setPanelVisible(false));`;
const uiAfter = `function installUi(){\n  document.addEventListener('pointerdown',()=>{primeKokoroAudio().catch(()=>{});},{capture:true});\n  $('#closePanel').addEventListener('click',()=>setPanelVisible(false));`;

const bootBefore = `loader.load(MODEL_URL,(gltf)=>{\n    vrm=gltf.userData.vrm; VRMUtils.removeUnnecessaryVertices(vrm.scene); VRMUtils.combineSkeletons(vrm.scene); vrm.scene.traverse((obj)=>{obj.frustumCulled=false;});\n    avatarRoot.add(vrm.scene); currentPose=neutralPose(); setImmediatePose(currentPose); fitCamera();\n    collisionThresholds=calibrateCollisionThresholds(captureWorldPoints(),modelHeight); buildSafePoseBank(); modelReady=true;\n    nextIdleAt=performance.now()+1800; nextBlinkAt=performance.now()+900+Math.random()*900;\n    plannerBadge.textContent=\`V0.85 就绪 · \${safePoseBank.length} 安全姿态\`; updateStats(); processResponseQueue();\n    if(!isTauri())setTimeout(()=>setPanelVisible(true),450);\n    else if(!sessionStorage.getItem('niva_api_seen'))setTimeout(()=>setPanelVisible(true),700);\n  },undefined,(error)=>{console.error(error);plannerBadge.textContent='模型加载失败';});`;
const bootAfter = `loader.load(MODEL_URL,async(gltf)=>{\n    vrm=gltf.userData.vrm; VRMUtils.removeUnnecessaryVertices(vrm.scene); VRMUtils.combineSkeletons(vrm.scene); vrm.scene.traverse((obj)=>{obj.frustumCulled=false;});\n    avatarRoot.add(vrm.scene); currentPose=neutralPose(); setImmediatePose(currentPose); fitCamera();\n    collisionThresholds=calibrateCollisionThresholds(captureWorldPoints(),modelHeight); modelReady=true;\n    nextIdleAt=performance.now()+1800; nextBlinkAt=performance.now()+500+Math.random()*700;\n    plannerBadge.textContent='V0.85.1 模型就绪 · 正在构建安全姿态库'; updateStats();\n    warmKokoro((status)=>{voiceBadge.textContent=status;}).catch((error)=>{console.warn('Kokoro warmup failed',error);});\n    buildSafePoseBank().catch((error)=>{console.error(error);plannerBadge.textContent='安全姿态库构建失败';});\n    if(!isTauri())setTimeout(()=>setPanelVisible(true),450);\n    else if(!sessionStorage.getItem('niva_api_seen'))setTimeout(()=>setPanelVisible(true),700);\n  },undefined,(error)=>{console.error(error);plannerBadge.textContent='模型加载失败';});`;

const buildBefore = `const BUILD = '0.85.0';`;
const buildAfter = `const BUILD = '0.85.1';`;

const changed = [
  replaceOnce('src/main.js', importBefore, importAfter),
  replaceOnce('src/main.js', bankStateBefore, bankStateAfter),
  replaceOnce('src/main.js', bankBefore, bankAfter),
  replaceOnce('src/main.js', idleBefore, idleAfter),
  replaceOnce('src/main.js', queueGuardBefore, queueGuardAfter),
  replaceOnce('src/main.js', uiBefore, uiAfter),
  replaceOnce('src/main.js', bootBefore, bootAfter),
  replaceOnce('src/main.js', buildBefore, buildAfter),
].some(Boolean);

console.log(changed ? 'Applied V0.85.1 runtime responsiveness fix.' : 'V0.85.1 runtime responsiveness fix already applied.');
