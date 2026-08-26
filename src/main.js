import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { NivaPhysicsBodySystem } from './runtime/physics/niva-body-physics.mjs';

const MODEL_URL = new URL('../NIVA.vrm', import.meta.url).href;
const $ = (q) => document.querySelector(q);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rad = (d) => THREE.MathUtils.degToRad(d);
const stage = $('#stage');
const canvas = $('#nivaCanvas');
const panel = $('#controlPanel');
const upgradePanel = $('#upgradePanel');
const controlTabs = $('#controlTabs');
const controlPage = $('#controlPage');
const composerInput = $('#composerInput');
const sendBtn = $('#sendBtn');
const nivaBubbles = $('#nivaBubbles');
const userBubbles = $('#userBubbles');
const toast = $('#toast');
const runtimeSummary = $('#runtimeSummary');
const lifeGuide = $('#lifeGuide');
const lifeGuideToggle = $('#lifeGuideToggle');
const closeLifeGuide = $('#closeLifeGuide');
const lifeVitalsEl = $('#lifeVitals');

let composerMode = 'chat';
let vrm = null;
let modelReady = false;
let modelHeight = 1.6;
let mixer = null;
let currentAction = null;
let currentActionName = 'idle';
let bodyPhysics = null;
let physicsReady = false;
let physicsError = '';
let persistentPreview = '';
let speaking = false;
let mouthLevel = 0;
let pointerInside = false;
let pointerMovedAt = 0;
let pointerNdc = new THREE.Vector2(0, 0);
let manualOverrideUntil = 0;
let bubbleId = 0;
let activeExpression = 'neutral';
let expressionValue = 0;
let expressionTarget = 0;
let expressionBlendFrom = 0;
let expressionBlendStarted = 0;
let expressionBlendDuration = 220;
let expressionNameFrom = 'neutral';
let lookOverride = null;
let lookOverrideUntil = 0;

const settings = Object.assign({
  panelVisible:false,
  lifeEnabled:true,
  blinkEnabled:true,
  gazeEnabled:true,
  mouseGaze:true,
  breathingEnabled:true,
  heartbeatEnabled:true,
  soundEnabled:true,
  bubblesEnabled:true,
  bpm:68,
  breaths:12,
  breathAmp:0.35,
  microFreq:0.6,
  majorFreq:0.25,
  allowReach:true,
  allowWalk:true,
  allowRun:true,
  lifeSimulation:true,
  lifeTimeScale:1,
  autoFatigueRecovery:true,
  physicsEnabled:true,
  footIKEnabled:true,
  physicsGroundContact:true,
  footIKStrength:0.9,
  crouchDepth:0.19,
  walkWorldSpeed:0.55,
  runWorldSpeed:1.25,
  exposure:0.9,
  ambient:0.32,
  key:1.15,
  fill:0.42,
  rim:0.55,
  stageLight:0,
  voiceRate:1,
  voicePitch:1,
  voiceVolume:1,
  motionSpeed:1,
  modelVisible:true,
  modelScale:1,
  modelX:0, modelY:0, modelZ:0, modelRotY:0,
  skinBrightness:1,
  stageVisible:true,
  keyColor:'#fff4eb', fillColor:'#bfdcff', rimColor:'#a9d8ff', stageColor:'#69e4e8',
  keyX:2.4,keyY:4.2,keyZ:3.2, fillX:-2.8,fillY:2.3,fillZ:2.2, rimX:-2.3,rimY:3,rimZ:-2.7,
  spotX:0,spotY:4,spotZ:2, spotTargetX:0,spotTargetY:1,spotTargetZ:0, spotAngle:.45,spotPenumbra:.7,spotDistance:8,
}, JSON.parse(localStorage.getItem('niva.free.settings') || '{}'));
function saveSettings(){ localStorage.setItem('niva.free.settings', JSON.stringify(settings)); }

const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = settings.exposure;
renderer.shadowMap.enabled = true;
renderer.setClearColor(0x0b0d0e, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d0e);
const camera = new THREE.PerspectiveCamera(27, 1, 0.01, 100);
camera.position.set(0, 1.25, 4.4);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 1.2;
controls.maxDistance = 8;
controls.target.set(0, 0.95, 0);

const ambient = new THREE.AmbientLight(0xffffff, settings.ambient); scene.add(ambient);
const key = new THREE.DirectionalLight(0xfff4eb, settings.key); key.position.set(2.4, 4.2, 3.2); key.castShadow = true; scene.add(key);
const fill = new THREE.DirectionalLight(0xbfdcff, settings.fill); fill.position.set(-2.8, 2.3, 2.2); scene.add(fill);
const rim = new THREE.DirectionalLight(0xa9d8ff, settings.rim); rim.position.set(-2.3, 3.0, -2.7); scene.add(rim);
const stageSpot = new THREE.SpotLight(0x69e4e8, settings.stageLight, 8, Math.PI/7, 0.7, 1.2); stageSpot.position.set(0,4,2); stageSpot.target.position.set(0,1,0); scene.add(stageSpot, stageSpot.target);

const floorMat = new THREE.MeshStandardMaterial({ color:0x10161d, roughness:0.78, metalness:0.08, transparent:true, opacity:0.94 });
const floor = new THREE.Mesh(new THREE.CircleGeometry(1.55, 96), floorMat); floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);
const ringMat = new THREE.MeshBasicMaterial({ color:0x59dce0, transparent:true, opacity:0.75, side:THREE.DoubleSide });
const ring = new THREE.Mesh(new THREE.RingGeometry(1.54,1.59,96), ringMat); ring.rotation.x=-Math.PI/2; ring.position.y=0.006; scene.add(ring);
const innerRing = new THREE.Mesh(new THREE.RingGeometry(0.83,0.85,96), new THREE.MeshBasicMaterial({color:0x5665a7,transparent:true,opacity:0.32,side:THREE.DoubleSide})); innerRing.rotation.x=-Math.PI/2; innerRing.position.y=0.008; scene.add(innerRing);

const gazeTarget = new THREE.Object3D(); scene.add(gazeTarget);
const clock = new THREE.Clock();
const baseQuats = new Map();
const manualOffsets = new Map();
const boneCache = new Map();

function getBone(name){
  if (!vrm) return null;
  if (!boneCache.has(name)) boneCache.set(name, vrm.humanoid.getNormalizedBoneNode(name));
  return boneCache.get(name) || null;
}
function rememberBones(){
  const names = ['hips','spine','chest','upperChest','neck','head','leftEye','rightEye','jaw','leftShoulder','rightShoulder','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftHand','rightHand','leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg','leftFoot','rightFoot','leftToes','rightToes','leftThumbMetacarpal','leftThumbProximal','leftThumbDistal','leftIndexProximal','leftIndexIntermediate','leftIndexDistal','leftMiddleProximal','leftMiddleIntermediate','leftMiddleDistal','leftRingProximal','leftRingIntermediate','leftRingDistal','leftLittleProximal','leftLittleIntermediate','leftLittleDistal','rightThumbMetacarpal','rightThumbProximal','rightThumbDistal','rightIndexProximal','rightIndexIntermediate','rightIndexDistal','rightMiddleProximal','rightMiddleIntermediate','rightMiddleDistal','rightRingProximal','rightRingIntermediate','rightRingDistal','rightLittleProximal','rightLittleIntermediate','rightLittleDistal'];
  for (const n of names){ const b=getBone(n); if (b) baseQuats.set(n,b.quaternion.clone()); }
}
function qFor(name, x=0,y=0,z=0){
  const base = baseQuats.get(name) || new THREE.Quaternion();
  return base.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(x),rad(y),rad(z),'XYZ')));
}

function offsetFromBase(name,x=0,y=0,z=0){
  const node=getBone(name),base=baseQuats.get(name); if(!node||!base)return;
  node.quaternion.copy(base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(x),rad(y),rad(z),'XYZ')));
}
function chooseArmDown(side){
  const upper=getBone(`${side}UpperArm`),hand=getBone(`${side}Hand`),shoulder=getBone(`${side}Shoulder`); if(!upper||!hand||!shoulder)return side==='left'?68:-68;
  const base=baseQuats.get(`${side}UpperArm`)?.clone(); if(!base)return side==='left'?68:-68;
  let best={score:Infinity,z:side==='left'?68:-68};
  for(const z of [68,-68]){
    upper.quaternion.copy(base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,rad(z))));
    vrm.scene.updateMatrixWorld(true);
    const hp=hand.getWorldPosition(new THREE.Vector3()),sp=shoulder.getWorldPosition(new THREE.Vector3());
    const score=(hp.y-sp.y)*5+Math.abs(hp.x-sp.x);
    if(score<best.score)best={score,z};
  }
  upper.quaternion.copy(base); return best.z;
}
function applyFingerRelax(side){
  const sign=side==='left'?-1:1;
  const curls={Thumb:[3,5,4],Index:[4,7,5],Middle:[5,8,6],Ring:[6,9,7],Little:[7,10,8]};
  for(const [finger,vals] of Object.entries(curls)){
    const names=finger==='Thumb'?[`${side}ThumbMetacarpal`,`${side}ThumbProximal`,`${side}ThumbDistal`]:[`${side}${finger}Proximal`,`${side}${finger}Intermediate`,`${side}${finger}Distal`];
    names.forEach((n,i)=>offsetFromBase(n,0,0,sign*(vals[i]||0)));
  }
}
function applyRelaxedStandingPose(){
  const lz=chooseArmDown('left'),rz=chooseArmDown('right');
  offsetFromBase('leftUpperArm',2,0,lz); offsetFromBase('rightUpperArm',2,0,rz);
  offsetFromBase('leftLowerArm',0,-10,0); offsetFromBase('rightLowerArm',0,10,0);
  offsetFromBase('leftHand',0,0,4); offsetFromBase('rightHand',0,0,-4);
  applyFingerRelax('left'); applyFingerRelax('right'); vrm.scene.updateMatrixWorld(true);
}
const materialSnapshots=new Map();
function captureMaterials(){materialSnapshots.clear();vrm?.scene.traverse(o=>{if(!o.isMesh)return;const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if(!m||materialSnapshots.has(m.uuid))continue;materialSnapshots.set(m.uuid,{mat:m,name:m.name||o.name||'material',color:m.color?.clone?.(),opacity:m.opacity,roughness:m.roughness,metalness:m.metalness});}});}
function isSkinMaterial(snap){return /(skin|face|head|body|肌|肤|颜)/i.test(snap.name||'');}
function applySkinBrightness(){for(const snap of materialSnapshots.values()){if(!snap.color||!isSkinMaterial(snap))continue;snap.mat.color.copy(snap.color).multiplyScalar(settings.skinBrightness);snap.mat.needsUpdate=true;}}
const modelHome=new THREE.Vector3();
function applyModelSettings(){if(!vrm)return;vrm.scene.visible=settings.modelVisible;vrm.scene.scale.setScalar(settings.modelScale);vrm.scene.position.set(modelHome.x+settings.modelX,modelHome.y+settings.modelY,modelHome.z+settings.modelZ);vrm.scene.rotation.y=rad(settings.modelRotY);bodyPhysics?.syncManualRoot?.(vrm.scene.position.x,vrm.scene.position.z);applySkinBrightness();}

function makeClip(name, duration, tracks){
  const t=[];
  for (const [bone, frames] of Object.entries(tracks)){
    const node=getBone(bone); if(!node) continue;
    const times=[]; const values=[];
    for(const f of frames){ times.push(f[0]); const q=qFor(bone,f[1]||0,f[2]||0,f[3]||0); values.push(q.x,q.y,q.z,q.w); }
    t.push(new THREE.QuaternionKeyframeTrack(`${node.uuid}.quaternion`, times, values));
  }
  return new THREE.AnimationClip(name,duration,t);
}
const clips = new Map();
function buildClips(){
  const n=(d)=>[[0,0,0,0],[d,0,0,0]];
  clips.set('idle', makeClip('idle',2,{head:n(2)}));
  clips.set('nod', makeClip('nod',1,{head:[[0,0,0,0],[.2,10,0,0],[.4,0,0,0],[.6,8,0,0],[.82,0,0,0],[1,0,0,0]],neck:[[0,0,0,0],[.2,3,0,0],[.4,0,0,0],[.6,2,0,0],[1,0,0,0]]}));
  clips.set('think', makeClip('think',2.5,{head:[[0,0,0,0],[.45,-3,6,-7],[1.8,-3,6,-7],[2.5,0,0,0]],rightUpperArm:[[0,0,0,0],[.5,10,4,22],[1.9,10,4,22],[2.5,0,0,0]],rightLowerArm:[[0,0,0,0],[.6,0,52,0],[1.9,0,52,0],[2.5,0,0,0]],rightHand:[[0,0,0,0],[.7,8,0,-8],[1.9,8,0,-8],[2.5,0,0,0]]}));
  clips.set('reach', makeClip('reach',2.0,{spine:[[0,0,0,0],[.65,3,0,0],[1.35,3,0,0],[2,0,0,0]],head:[[0,0,0,0],[.65,5,-5,0],[1.35,5,-5,0],[2,0,0,0]],rightUpperArm:[[0,0,0,0],[.65,18,10,18],[1.35,18,10,18],[2,0,0,0]],rightLowerArm:[[0,0,0,0],[.7,0,34,0],[1.35,0,34,0],[2,0,0,0]],rightHand:[[0,0,0,0],[.75,-7,0,-8],[1.35,-7,0,-8],[2,0,0,0]]}));
  clips.set('weight', makeClip('weight',2.6,{hips:[[0,0,0,0],[.6,0,0,-2],[1.2,0,0,-2],[1.8,0,0,2],[2.6,0,0,0]],spine:[[0,0,0,0],[.6,0,0,1.2],[1.2,0,0,1.2],[1.8,0,0,-1.2],[2.6,0,0,0]],leftUpperLeg:[[0,0,0,0],[.6,0,0,1.5],[1.2,0,0,1.5],[2.6,0,0,0]],rightUpperLeg:[[0,0,0,0],[1.8,0,0,-1.5],[2.2,0,0,-1.5],[2.6,0,0,0]]}));
  clips.set('wave', makeClip('wave',2.05,{rightUpperArm:[[0,0,0,0],[.3,8,0,34],[.55,10,4,45],[1.72,10,4,45],[2.05,0,0,0]],rightLowerArm:[[0,0,0,0],[.35,0,52,0],[.55,0,72,0],[1.72,0,72,0],[2.05,0,0,0]],rightHand:[[0,0,0,0],[.55,0,0,-8],[.78,0,0,14],[1.02,0,0,-14],[1.26,0,0,14],[1.50,0,0,-14],[1.72,0,0,0],[2.05,0,0,0]]}));
  const walkTimes=[0,.125,.25,.375,.5,.625,.75,.875,1];
  const legL=[22,12,1,-11,-20,-11,0,12,22],legR=[-20,-11,0,12,22,12,1,-11,-20];
  const kneeL=[7,18,34,24,8,10,18,11,7],kneeR=[8,10,18,11,7,18,34,24,8];
  const footL=[-4,-1,7,3,-3,-2,4,1,-4],footR=[-3,-2,4,1,-4,-1,7,3,-3];
  const armL=[-14,-8,0,8,14,8,0,-8,-14],armR=[14,8,0,-8,-14,-8,0,8,14];
  const f=(arr)=>walkTimes.map((t,i)=>[t,arr[i],0,0]);
  clips.set('walk',makeClip('walk',1,{leftUpperLeg:f(legL),rightUpperLeg:f(legR),leftLowerLeg:f(kneeL),rightLowerLeg:f(kneeR),leftFoot:f(footL),rightFoot:f(footR),leftUpperArm:f(armL),rightUpperArm:f(armR),leftLowerArm:walkTimes.map(t=>[t,0,-14,0]),rightLowerArm:walkTimes.map(t=>[t,0,14,0]),hips:walkTimes.map((t,i)=>[t,0,(i<4?2:-2),0]),chest:walkTimes.map((t,i)=>[t,0,(i<4?-1.5:1.5),0])}));
  const rt=[0,.09,.18,.26,.35,.44,.53,.61,.70];
  const runL=[38,22,2,-22,-36,-20,2,22,38],runR=[-36,-20,2,22,38,22,2,-22,-36];
  const rkL=[16,42,76,56,18,28,62,42,16],rkR=[18,28,62,42,16,42,76,56,18];
  const rfL=[-7,-2,12,7,-5,-3,9,4,-7],rfR=[-5,-3,9,4,-7,-2,12,7,-5];
  const raL=[-28,-16,0,19,28,16,0,-19,-28],raR=[28,16,0,-19,-28,-16,0,19,28];
  const rf=(arr)=>rt.map((t,i)=>[t,arr[i],0,0]);
  clips.set('run',makeClip('run',.70,{leftUpperLeg:rf(runL),rightUpperLeg:rf(runR),leftLowerLeg:rf(rkL),rightLowerLeg:rf(rkR),leftFoot:rf(rfL),rightFoot:rf(rfR),leftUpperArm:rf(raL),rightUpperArm:rf(raR),leftLowerArm:rt.map(t=>[t,0,-72,0]),rightLowerArm:rt.map(t=>[t,0,72,0]),spine:rt.map(t=>[t,5,0,0]),chest:rt.map((t,i)=>[t,1.5,(i<4?-2:2),0])}));
  clips.set('thinkLoop',makeClip('thinkLoop',4,{head:[[0,-2,5,-7],[1,-3,6,-8],[2,-2,5,-7],[3,-3,7,-6],[4,-2,5,-7]],rightUpperArm:[[0,8,4,20],[4,8,4,20]],rightLowerArm:[[0,0,48,0],[4,0,48,0]],rightHand:[[0,6,0,-6],[2,8,0,-5],[4,6,0,-6]]}));
  clips.set('crouch',makeClip('crouch',2,{spine:[[0,4,0,0],[2,4,0,0]],chest:[[0,2,0,0],[2,2,0,0]],leftUpperLeg:[[0,8,0,0],[2,8,0,0]],rightUpperLeg:[[0,8,0,0],[2,8,0,0]],leftLowerLeg:[[0,18,0,0],[2,18,0,0]],rightLowerLeg:[[0,18,0,0],[2,18,0,0]],leftFoot:[[0,-5,0,0],[2,-5,0,0]],rightFoot:[[0,-5,0,0],[2,-5,0,0]],head:[[0,-2,0,0],[2,-2,0,0]]}));
  clips.set('recovery',makeClip('recovery',3,{spine:[[0,18,0,0],[3,18,0,0]],chest:[[0,7,0,0],[3,7,0,0]],neck:[[0,-5,0,0],[3,-5,0,0]],leftUpperLeg:[[0,8,0,0],[3,8,0,0]],rightUpperLeg:[[0,8,0,0],[3,8,0,0]],leftLowerLeg:[[0,18,0,0],[3,18,0,0]],rightLowerLeg:[[0,18,0,0],[3,18,0,0]],leftFoot:[[0,-5,0,0],[3,-5,0,0]],rightFoot:[[0,-5,0,0],[3,-5,0,0]],leftUpperArm:[[0,10,0,-7],[3,10,0,-7]],rightUpperArm:[[0,10,0,7],[3,10,0,7]],leftLowerArm:[[0,0,-24,0],[3,0,-24,0]],rightLowerArm:[[0,0,24,0],[3,0,24,0]],head:[[0,-6,0,0],[3,-6,0,0]]}));
}
function playClip(name,{loop=false,duration=null}={}){
  if(!mixer || !clips.has(name) || speaking || performance.now()<manualOverrideUntil) return false;
  const clip=clips.get(name);
  const next=mixer.clipAction(clip);
  next.reset(); next.enabled=true; next.setEffectiveWeight(1); next.setEffectiveTimeScale(settings.motionSpeed||1);
  next.setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce, loop?Infinity:1); next.clampWhenFinished=!loop;
  if(currentAction && currentAction!==next){ currentAction.fadeOut(.22); }
  next.fadeIn(.22).play(); currentAction=next; currentActionName=name;
  if(!loop){ setTimeout(()=>{ if(currentAction===next){ next.fadeOut(.22); setTimeout(()=>{if(currentAction===next){currentAction=null;currentActionName='idle';}},240); } }, (duration || clip.duration)*1000+80); }
  return true;
}
function stopAction(){ persistentPreview=''; if(currentAction){ const old=currentAction; old.fadeOut(.18); setTimeout(()=>{ if(currentAction===old){ currentAction=null; currentActionName='idle'; } },210); } }

function centerModel(){
  if(!vrm) return;
  vrm.scene.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(vrm.scene); const c=box.getCenter(new THREE.Vector3());
  vrm.scene.position.x-=c.x; vrm.scene.position.z-=c.z; vrm.scene.position.y-=box.min.y;
  vrm.scene.updateMatrixWorld(true);
  const b=new THREE.Box3().setFromObject(vrm.scene); modelHeight=b.getSize(new THREE.Vector3()).y;
  controls.target.set(0,modelHeight*.52,0); camera.position.set(0,modelHeight*.55,modelHeight*2.35); controls.update();
  floor.position.y=0; ring.position.y=.006; innerRing.position.y=.008;
}

const loader=new GLTFLoader(); loader.register(p=>new VRMLoaderPlugin(p));
loader.load(MODEL_URL,(gltf)=>{
  vrm=gltf.userData.vrm; if(!vrm) throw new Error('VRM missing');
  VRMUtils.removeUnnecessaryVertices(gltf.scene); VRMUtils.removeUnnecessaryJoints(gltf.scene);
  vrm.scene.traverse(o=>{ if(o.isMesh){o.castShadow=true;o.receiveShadow=true;} });
  scene.add(vrm.scene); rememberBones(); applyRelaxedStandingPose(); rememberBones(); centerModel(); modelHome.copy(vrm.scene.position); captureMaterials(); applyModelSettings();
  gazeTarget.position.copy(camera.position); if(vrm.lookAt) vrm.lookAt.target=gazeTarget;
  mixer=new THREE.AnimationMixer(vrm.humanoid.normalizedHumanBonesRoot || vrm.scene); buildClips();
  modelReady=true; runtimeSummary.textContent='Free Life Runtime · Ready';
  showToast('NIVA 已就绪');
  NivaPhysicsBodySystem.create({vrm,getBone,modelHeight,rootHome:modelHome,stageRadius:1.55*Math.max(.4,floor.scale.x||1)}).then((system)=>{bodyPhysics=system;physicsReady=true;physicsError='';runtimeSummary.textContent='Free Life Runtime · Physics Ready';showToast('NIVA 物理身体已就绪');}).catch((err)=>{physicsReady=false;physicsError=String(err?.message||err);console.error('NIVA physics init failed',err);runtimeSummary.textContent='Free Life Runtime · Physics fallback';});
},undefined,(e)=>{ console.error(e); runtimeSummary.textContent='模型加载失败'; showToast('NIVA.vrm 加载失败'); });

function resize(){ const r=stage.getBoundingClientRect(); renderer.setSize(r.width,r.height,false); camera.aspect=r.width/r.height; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(stage); resize();

function addBubble(who,text){
  if(!settings.bubblesEnabled) return null;
  const container=who==='niva'?nivaBubbles:userBubbles; const el=document.createElement('div'); el.className=`bubble ${who}`; el.dataset.id=String(++bubbleId); el.textContent=text; container.appendChild(el);
  while(container.children.length>3) container.firstElementChild.remove();
  [...container.children].forEach((n,i,a)=>n.classList.toggle('old',i<a.length-1));
  return el;
}
function showToast(msg){ toast.textContent=msg; toast.classList.remove('hidden'); clearTimeout(showToast.t); showToast.t=setTimeout(()=>toast.classList.add('hidden'),1800); }

const DEMO={
  '你好':{reply:'你好，我是 NIVA。很高兴见到你。',emotion:'happy',action:'wave'},
  '你是谁':{reply:'我是 NIVA，一个正在学习如何真正活起来的数字生命。',emotion:'gentle'},
  '介绍一下自己':{reply:'我是妮瓦。现在的免费基础体验可以让我说话、眨眼、呼吸、注视你，也可以让你直接操控我的身体、表情、舞台和灯光。',emotion:'happy'},
  '你会什么':{reply:'我现在可以陪你对话、发声、做表情、注视你，也在学习更自然地走路、挥手和表现生命感。',emotion:'neutral'},
  '笑一个':{reply:'好呀。',emotion:'happy',action:'smile'},
  '微笑':{reply:'嗯。',emotion:'happy',action:'smile'},
  '挥挥手':{reply:'你好。',emotion:'happy',action:'wave'},
  '挥手':{reply:'你好。',emotion:'happy',action:'wave'},
  '深呼吸':{reply:'好，我们一起慢慢呼吸。',emotion:'gentle',action:'breath'},
  '思考一下':{reply:'嗯……让我想一下。',emotion:'thinking',action:'think'},
  '走一下':{reply:'好，我走给你看看。',emotion:'happy',action:'walk'},
  '走路':{reply:'好，我走给你看看。',emotion:'happy',action:'walk'},
  '跑一下':{reply:'好，我跑一下。',emotion:'excited',action:'run'},
  '跑步':{reply:'好，我跑一下。',emotion:'excited',action:'run'},
  '再见':{reply:'好，下次见。',emotion:'gentle',action:'wave'},
};
function demoReply(text){
  const key=Object.keys(DEMO).find(k=>text.includes(k));
  return key?DEMO[key]:{reply:'现在是免费的基础体验模式。你可以试试“挥手”“微笑”“深呼吸”“思考一下”“走路”或“跑步”。',emotion:'neutral'};
}
function setExpression(name,value=.25,duration=220){
  if(!vrm?.expressionManager) return;
  const aliases={gentle:'relaxed',thinking:'relaxed',excited:'happy',neutral:'neutral',smile:'happy'};
  const target=aliases[name]||name;
  expressionNameFrom=activeExpression; expressionBlendFrom=expressionValue; activeExpression=target; expressionTarget=value; expressionBlendStarted=performance.now(); expressionBlendDuration=duration;
}
function expressionTick(now){
  if(!vrm?.expressionManager) return;
  const t=clamp((now-expressionBlendStarted)/expressionBlendDuration,0,1);
  const e=t*t*(3-2*t);
  if(expressionNameFrom && expressionNameFrom!==activeExpression) vrm.expressionManager.setValue(expressionNameFrom, expressionBlendFrom*(1-e));
  const v=expressionBlendFrom+(expressionTarget-expressionBlendFrom)*e; expressionValue=v; vrm.expressionManager.setValue(activeExpression,v);
}
function performAction(action){
  if(action==='wave') return playClip('wave',{duration:2.05});
  if(action==='think') return playClip('think',{duration:2.5});
  if(action==='walk'){ if(playClip('walk',{loop:true})){setTimeout(stopAction,3100);} return; }
  if(action==='run'){ if(playClip('run',{loop:true})){setTimeout(stopAction,2500);} return; }
  if(action==='smile'){ setExpression('happy',.3); setTimeout(()=>setExpression('neutral',0),2200); return; }
  if(action==='breath'){ life.deepBreathUntil=performance.now()+5000; return; }
}

const TABS=['基础','人物','表情','生命','动作','舞台','灯光','相机','声音']; let activeTab='基础';
let voices=[];
function refreshVoices(){ voices=speechSynthesis?.getVoices?.()||[]; renderVoicePageIfOpen(); }
if('speechSynthesis' in window){ refreshVoices(); speechSynthesis.addEventListener?.('voiceschanged',refreshVoices); }
function pickVoice(){ const id=settings.systemVoice; if(id){const v=voices.find(x=>x.name===id); if(v)return v;} return voices.find(v=>/^zh(-|_)/i.test(v.lang))||voices[0]||null; }
function speak(text,allowAction=false){
  addBubble('niva',text); if(!settings.soundEnabled || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel(); if(!allowAction) stopAction(); speaking=true; director.state='speaking';
  const u=new SpeechSynthesisUtterance(text.replaceAll('NIVA','妮瓦')); const v=pickVoice(); if(v)u.voice=v; u.lang=v?.lang||'zh-CN'; u.rate=settings.voiceRate;u.pitch=settings.voicePitch;u.volume=settings.voiceVolume;
  u.onstart=()=>{speaking=true;}; u.onend=()=>{speaking=false;mouthLevel=0;director.resumeAt=performance.now()+2000+Math.random()*2000;director.state='idle';}; u.onerror=()=>{speaking=false;mouthLevel=0;director.state='idle';}; speechSynthesis.speak(u);
}
function submit(){
  const text=composerInput.value.trim(); if(!text)return; composerInput.value='';
  if(composerMode==='speak'){ speak(text); return; }
  addBubble('user',text); const r=demoReply(text); setExpression(r.emotion,r.emotion==='happy'?.28:.16); setTimeout(()=>setExpression('neutral',0),2600); if(r.action) setTimeout(()=>performAction(r.action),150); setTimeout(()=>speak(r.reply,Boolean(r.action)),250);
}
sendBtn.addEventListener('click',submit); composerInput.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit();}});
document.querySelectorAll('.mode-btn').forEach(b=>b.addEventListener('click',()=>{composerMode=b.dataset.mode;document.querySelectorAll('.mode-btn').forEach(x=>x.classList.toggle('active',x===b)); composerInput.placeholder=composerMode==='chat'?'和 NIVA 说点什么……':'输入想让 NIVA 说的话……';}));

const experienceBar=$('#experienceBar');
experienceBar.innerHTML='<div class="experience-row"><span class="experience-label">动作预览</span></div><div class="experience-row"><span class="experience-label">语音演出</span></div>';
const previewRow=experienceBar.children[0],voiceRow=experienceBar.children[1];
const previewActions=[['停止','stop'],['思考','thinkLoop'],['走路','walk'],['跑步','run'],['蹲下','crouch']];
function startPreviewMotion(name){
  if(name==='stop'){stopAction();lifeSim.recovering=false;setExpression('neutral',0);return;}
  if(name==='crouch') lifeSim.captureFootAnchor();
  stopAction();persistentPreview=name;lifeSim.onPreviewChanged(name);
  setTimeout(()=>{if(persistentPreview===name)playClip(name,{loop:true});},190);
}
for(const [label,name] of previewActions){const b=document.createElement('button');b.className='chip';b.textContent=label;b.onclick=()=>startPreviewMotion(name);previewRow.appendChild(b);}
const voiceScenes=[
  ['打招呼',()=>{stopAction();setExpression('happy',.28);setTimeout(()=>playClip('wave',{duration:2.05}),120);setTimeout(()=>speak('你好，我是 NIVA。很高兴见到你。',true),220);}],
  ['自我介绍',()=>{stopAction();setExpression('happy',.22);setTimeout(()=>playClip('nod',{duration:1}),120);setTimeout(()=>speak('我是妮瓦。你可以体验我的动作、表情、生命状态、舞台、灯光和完整模型控制。',true),220);}],
  ['微笑说话',()=>{stopAction();setExpression('happy',.30);speak('嗯，我在这里。',true);}],
  ['说明',()=>{stopAction();setExpression('neutral',.08);speak('免费基础体验不需要连接任何接口，你可以直接操控和观察我。',true);}]
];
for(const [label,fn] of voiceScenes){const b=document.createElement('button');b.className='chip';b.textContent=label;b.onclick=fn;voiceRow.appendChild(b);}


const lifeSim={
  fatigue:0,energy:100,heartRate:68,breathRate:12,load:0,recovering:false,recoveryUntil:0,
  paceNoise:1,nextPaceNoise:0,lastUi:0,lastPreview:'',stageTarget:new THREE.Vector3(),footAnchor:null,groundMode:'',
  activity(){if(this.recovering)return'recovery';if(persistentPreview)return persistentPreview;if(currentActionName&&currentActionName!=='idle')return currentActionName;return'idle';},
  loadFor(a){return ({run:1,walk:.42,crouch:.24,thinkLoop:.16,think:.16,wave:.2,recovery:.55}[a]||.05);},
  onPreviewChanged(name){this.lastPreview='';if(name==='walk'||name==='run')this.chooseStageTarget();},
  chooseStageTarget(){const a=Math.random()*Math.PI*2,scale=Math.max(.4,floor.scale.x||1),r=(.32+Math.random()*.82)*scale;this.stageTarget.set(Math.cos(a)*r,0,Math.sin(a)*r);},
  captureFootAnchor(){
    if(!vrm)return;vrm.scene.updateMatrixWorld(true);const ps=['leftFoot','rightFoot'].map(getBone).filter(Boolean).map(b=>b.getWorldPosition(new THREE.Vector3()));if(!ps.length)return;
    this.footAnchor=ps.reduce((s,p)=>s.add(p),new THREE.Vector3()).multiplyScalar(1/ps.length);
  },
  updateLocomotion(dt,a){
    if(!vrm||this.recovering||!['walk','run'].includes(a)||persistentPreview!==a)return;
    const baseX=modelHome.x+settings.modelX,baseZ=modelHome.z+settings.modelZ;
    const pos=new THREE.Vector3(vrm.scene.position.x-baseX,0,vrm.scene.position.z-baseZ),to=this.stageTarget.clone().sub(pos);to.y=0;
    if(to.length()<.14){this.chooseStageTarget();return;}
    const dir=to.normalize(),fatigueSlow=1-clamp((this.fatigue-35)/170,0,.28);
    const speed=(a==='run'?settings.runWorldSpeed:settings.walkWorldSpeed)*fatigueSlow;
    if(settings.physicsEnabled){
      if(!physicsReady||!bodyPhysics)return;
      bodyPhysics.configure({enabled:true,ikEnabled:settings.footIKEnabled,ikStrength:settings.footIKStrength});
      bodyPhysics.move(dt,dir,speed);
    }else{
      pos.addScaledVector(dir,speed*dt);const maxR=1.18*Math.max(.4,floor.scale.x||1);if(pos.length()>maxR)pos.setLength(maxR);
      vrm.scene.position.x=baseX+pos.x;vrm.scene.position.z=baseZ+pos.z;
    }
    const targetYaw=rad(settings.modelRotY)+Math.atan2(dir.x,dir.z),cur=vrm.scene.rotation.y,diff=Math.atan2(Math.sin(targetYaw-cur),Math.cos(targetYaw-cur));vrm.scene.rotation.y=cur+diff*(1-Math.exp(-dt*7));
  },
  forceRecovery(now){
    if(this.recovering||persistentPreview!=='run')return;this.recovering=true;this.recoveryUntil=now+14000;this.captureFootAnchor();life.deepBreathUntil=now+15000;
    if(currentAction)currentAction.fadeOut(.28);setTimeout(()=>{if(this.recovering&&persistentPreview==='run')playClip('recovery',{loop:true});},80);
  },
  applyGroundContact(dt){
    if(!vrm)return;
    if(settings.physicsEnabled&&settings.physicsGroundContact&&bodyPhysics&&physicsReady){
      bodyPhysics.configure({enabled:true,ikEnabled:settings.footIKEnabled,ikStrength:settings.footIKStrength});
      if(!['walk','run'].includes(this.activity()))bodyPhysics.holdPosition(dt);
      return;
    }
    const baseY=modelHome.y+settings.modelY;
    vrm.scene.position.y+=((baseY-vrm.scene.position.y)*(1-Math.exp(-dt*8)));
  },
  applyFatigueFace(){
    if(!vrm?.expressionManager||speaking||activeExpression!=='neutral')return;const tired=clamp((this.fatigue-32)/115,0,.42);
    try{vrm.expressionManager.setValue('relaxed',tired);}catch{}
  },
  update(dt,now){
    if(!settings.lifeEnabled||!settings.lifeSimulation||!modelReady)return;dt*=settings.lifeTimeScale||1;const a=this.activity(),load=this.loadFor(a);this.load+=(load-this.load)*(1-Math.exp(-dt*2.3));
    const gain=({run:1.62,walk:.30,crouch:.08,thinkLoop:.06,think:.06,recovery:-1.35,idle:-.38}[a]??-.16);this.fatigue=clamp(this.fatigue+gain*dt,0,100);this.energy=clamp(100-this.fatigue*.88,0,100);
    const hrTarget=68+this.load*72+this.fatigue*.12,brTarget=12+this.load*23+this.fatigue*.045;this.heartRate+=(hrTarget-this.heartRate)*(1-Math.exp(-dt/5));this.breathRate+=(brTarget-this.breathRate)*(1-Math.exp(-dt/4));
    if(this.fatigue>55&&now>=this.nextPaceNoise){this.paceNoise=.90+Math.random()*.12;this.nextPaceNoise=now+1500+Math.random()*2400;}else this.paceNoise+=(1-this.paceNoise)*(1-Math.exp(-dt*2));
    if(currentAction){const fatigueSlow=1-clamp((this.fatigue-28)/150,0,.30);currentAction.setEffectiveTimeScale((settings.motionSpeed||1)*fatigueSlow*this.paceNoise);}
    if(this.fatigue>34&&!['crouch','recovery'].includes(currentActionName)){const f=clamp((this.fatigue-34)/66,0,1);applyAdditive('spine',f*4.2,0,0,'fatigue');applyAdditive('chest',f*2.4,0,0,'fatigue');applyAdditive('neck',-f*1.8,0,0,'fatigue');}
    if(settings.autoFatigueRecovery&&a==='run'&&this.fatigue>=88)this.forceRecovery(now);
    if(this.recovering&&now>=this.recoveryUntil){this.recovering=false;this.footAnchor=null;if(persistentPreview==='run')setTimeout(()=>{if(persistentPreview==='run'&&!this.recovering)playClip('run',{loop:true});},120);}
    this.updateLocomotion(dt,a);
    if(lifeVitalsEl&&now-this.lastUi>220){this.lastUi=now;const label=this.recovering?'恢复中':({run:'跑步',walk:'走路',crouch:'蹲下',thinkLoop:'思考'}[a]||'平静');lifeVitalsEl.textContent=`心率 ${Math.round(this.heartRate)} · 呼吸 ${Math.round(this.breathRate)} · 疲劳 ${Math.round(this.fatigue)}% · ${label}`;}
  }
};

const life={
  nextBlink:performance.now()+2500,
  blinkStart:0,
  blinkDouble:false,
  nextDouble:0,
  deepBreathUntil:0,
  update(now){
    if(!vrm||!settings.lifeEnabled)return;
    if(settings.blinkEnabled&&vrm.expressionManager){
      if(!this.blinkStart&&now>=this.nextBlink){this.blinkStart=now;this.blinkDouble=Math.random()<.12;}
      if(this.blinkStart){const t=now-this.blinkStart;let v=t<90?t/90:t<145?1:(t<275?1-(t-145)/130:0);vrm.expressionManager.setValue('blink',clamp(v,0,1));if(t>300){this.blinkStart=0;const fatigueBlink=settings.lifeSimulation?clamp(3200-lifeSim.fatigue*18,1300,3200):3200;this.nextBlink=now+fatigueBlink+Math.random()*2200;if(this.blinkDouble)this.nextBlink=now+180;}}
    }
    if(settings.breathingEnabled){ const breathHz=(settings.lifeSimulation?lifeSim.breathRate:settings.breaths)/60; const baseAmp=settings.breathAmp*(settings.lifeSimulation?(1+lifeSim.fatigue/115):1); const amp=(now<this.deepBreathUntil?.valueOf()?baseAmp*1.8:baseAmp); const breath=Math.sin((now/1000)*Math.PI*2*breathHz)*amp; applyAdditive('chest',breath*1.1,0,0); applyAdditive('upperChest',breath*.75,0,0); applyAdditive('spine',breath*.28,0,0); }
    if(settings.heartbeatEnabled){ const beatPhase=((now/1000)*((settings.lifeSimulation?lifeSim.heartRate:settings.bpm)/60))%1; const pulse=(Math.exp(-Math.pow((beatPhase-.06)/.035,2))*.18+Math.exp(-Math.pow((beatPhase-.22)/.05,2))*.08); applyAdditive('upperChest',pulse,0,0,'heartbeat'); }
  }
};
const additiveScratch=new Map();
function applyAdditive(name,x=0,y=0,z=0,key='life'){
  if(!vrm)return; const node=getBone(name); if(!node)return; const base=baseQuats.get(name); if(!base)return;
  if(!additiveScratch.has(name)) additiveScratch.set(name,{}); const s=additiveScratch.get(name); s[key]=[x,y,z];
}
function applyManualAndLife(){
  if(!vrm)return;
  for(const [name,base] of baseQuats.entries()){
    if(currentAction && ['walk','run','wave','think','thinkLoop','reach','weight','nod','crouch','recovery'].includes(currentActionName) && !manualOffsets.has(name)) continue;
    const node=getBone(name); if(!node)continue; const m=manualOffsets.get(name)||[0,0,0],layers=additiveScratch.get(name)||{};let lx=0,ly=0,lz=0;for(const v of Object.values(layers)){lx+=v?.[0]||0;ly+=v?.[1]||0;lz+=v?.[2]||0;}
    node.quaternion.copy(base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(m[0]+lx),rad(m[1]+ly),rad(m[2]+lz),'XYZ')));
  }
  additiveScratch.clear();
}

const director={
  state:'idle', last:'', nextMicro:performance.now()+6500, nextMajor:performance.now()+19000, resumeAt:0,
  cooldown:new Map(),
  can(name,now){return (this.cooldown.get(name)||0)<=now&&this.last!==name;},
  choose(pool){const total=pool.reduce((s,x)=>s+x[1],0);let r=Math.random()*total;for(const x of pool){r-=x[1];if(r<=0)return x[0];}return pool[0][0];},
  fire(name,now){this.last=name;this.cooldown.set(name,now+({think:12000,smile:10000,look:10000,reach:20000,weight:10000,walk:28000,run:40000}[name]||10000)); if(name==='think')playClip('think',{duration:2.5}); if(name==='smile'){setExpression('happy',.20);setTimeout(()=>setExpression('neutral',0),2000);} if(name==='look'){lookOverride={x:(Math.random()-.5)*.55,y:(Math.random()-.5)*.18};lookOverrideUntil=now+2200;} if(name==='reach')playClip('reach',{duration:2}); if(name==='weight')playClip('weight',{duration:2.6}); if(name==='walk'){if(playClip('walk',{loop:true}))setTimeout(stopAction,2900);} if(name==='run'){if(playClip('run',{loop:true}))setTimeout(stopAction,2300);}},
  update(now){
    if(!settings.lifeEnabled||!modelReady||speaking||currentAction||persistentPreview||now<manualOverrideUntil||now<this.resumeAt)return;
    if(now>=this.nextMicro){ const p=[['think',1],['smile',1.25],['look',.9],['weight',.8]].filter(x=>this.can(x[0],now)); if(p.length)this.fire(this.choose(p),now); this.nextMicro=now+(6000+Math.random()*6000)/(0.5+settings.microFreq); }
    if(now>=this.nextMajor){ const p=[];if(settings.allowReach&&pointerInside&&pointerNdc.x>.12&&pointerNdc.y<.45)p.push(['reach',.55]);if(settings.allowWalk)p.push(['walk',.35]);if(settings.allowRun)p.push(['run',.15]);const ok=p.filter(x=>this.can(x[0],now));if(ok.length)this.fire(this.choose(ok),now);this.nextMajor=now+(18000+Math.random()*17000)/(0.5+settings.majorFreq); }
  }
};

function updateGaze(now){
  if(!vrm||!settings.gazeEnabled)return;
  let x=0,y=0;
  if(lookOverride&&now<lookOverrideUntil){x=clamp(lookOverride.x,-.45,.45);y=clamp(lookOverride.y,-.22,.22);}else{lookOverride=null;if(settings.mouseGaze&&pointerInside&&(now-pointerMovedAt)<1200){x=clamp(pointerNdc.x,-.8,.8);y=clamp(pointerNdc.y,-.6,.6);}}
  const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  const target=camera.position.clone().addScaledVector(right,x*modelHeight*.24).addScaledVector(up,y*modelHeight*.14);
  gazeTarget.position.lerp(target,.12);
}
canvas.addEventListener('pointerenter',()=>pointerInside=true);canvas.addEventListener('pointerleave',()=>pointerInside=false);canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();pointerNdc.set(((e.clientX-r.left)/r.width)*2-1,-(((e.clientY-r.top)/r.height)*2-1));pointerMovedAt=performance.now();});

for(const t of TABS){const b=document.createElement('button');b.textContent=t;b.onclick=()=>{activeTab=t;renderControl();};controlTabs.appendChild(b);}
function rowSlider(label,min,max,step,value){const id=`s${Math.random().toString(36).slice(2)}`;return `<label class="control-row"><span>${label}</span><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output>${value}</output></label>`;}
function toggleHtml(label,key){return `<label class="switch-row"><span>${label}</span><input type="checkbox" data-setting="${key}" ${settings[key]?'checked':''}></label>`;}
function bindToggles(){controlPage.querySelectorAll('[data-setting]').forEach(el=>el.onchange=()=>{settings[el.dataset.setting]=el.checked;saveSettings();});}
function renderControl(){
  [...controlTabs.children].forEach(b=>b.classList.toggle('active',b.textContent===activeTab));
  if(activeTab==='基础'){
    controlPage.innerHTML=`<section class="panel-section"><h3>基础体验</h3>${toggleHtml('生命状态','lifeEnabled')}${toggleHtml('自动眨眼','blinkEnabled')}${toggleHtml('注视用户','gazeEnabled')}${toggleHtml('跟随鼠标','mouseGaze')}${toggleHtml('呼吸','breathingEnabled')}${toggleHtml('心跳','heartbeatEnabled')}${toggleHtml('声音','soundEnabled')}${toggleHtml('对白气泡','bubblesEnabled')}${toggleHtml('Rapier 角色物理','physicsEnabled')}${toggleHtml('脚底 IK','footIKEnabled')}${toggleHtml('地面接触','physicsGroundContact')}<button id="resetFree" class="secondary-btn wide">恢复默认设置</button></section>`;bindToggles();$('#resetFree').onclick=()=>{localStorage.removeItem('niva.free.settings');location.reload();};
  } else if(activeTab==='人物') renderBodyControls();
  else if(activeTab==='表情') renderExpressionControls();
  else if(activeTab==='生命') renderLifeControls();
  else if(activeTab==='动作') renderMotionControls();
  else if(activeTab==='舞台') renderStageControls();
  else if(activeTab==='灯光') renderLightControls();
  else if(activeTab==='相机') renderCameraControls();
  else if(activeTab==='声音') renderVoiceControls();
}
function renderBodyControls(){
  const groups={躯干:['hips','spine','chest','upperChest'],头颈:['neck','head','leftEye','rightEye','jaw'],肩臂:['leftShoulder','rightShoulder','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftHand','rightHand'],下肢:['leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg','leftFoot','rightFoot','leftToes','rightToes'],左手指:['leftThumbMetacarpal','leftThumbProximal','leftThumbDistal','leftIndexProximal','leftIndexIntermediate','leftIndexDistal','leftMiddleProximal','leftMiddleIntermediate','leftMiddleDistal','leftRingProximal','leftRingIntermediate','leftRingDistal','leftLittleProximal','leftLittleIntermediate','leftLittleDistal'],右手指:['rightThumbMetacarpal','rightThumbProximal','rightThumbDistal','rightIndexProximal','rightIndexIntermediate','rightIndexDistal','rightMiddleProximal','rightMiddleIntermediate','rightMiddleDistal','rightRingProximal','rightRingIntermediate','rightRingDistal','rightLittleProximal','rightLittleIntermediate','rightLittleDistal']};
  let html=`<section class="panel-section"><h3>模型总控</h3>${toggleHtml('显示模型','modelVisible')}${rowSlider('模型缩放',.5,1.8,.01,settings.modelScale)}${rowSlider('位置 X',-2,2,.01,settings.modelX)}${rowSlider('位置 Y',-.5,2,.01,settings.modelY)}${rowSlider('位置 Z',-2,2,.01,settings.modelZ)}${rowSlider('朝向 Y°',-180,180,1,settings.modelRotY)}${rowSlider('皮肤/面部亮度',.55,1.45,.01,settings.skinBrightness)}<button id="modelReset" class="secondary-btn wide">恢复自然站姿</button></section><div class="section-toolbar"><button id="bodyReset" class="secondary-btn">清除骨骼偏移</button><small>完整 normalized humanoid 控制</small></div>`;
  for(const [g,bones] of Object.entries(groups)){html+=`<details class="bone-group"><summary>${g} · ${bones.filter(getBone).length} 骨骼</summary>`;for(const bone of bones){if(!getBone(bone))continue;html+=`<div class="bone-card"><b>${bone}</b>${['X','Y','Z'].map((a,i)=>`<label class="control-row compact"><span>${a}</span><input type="range" min="-60" max="60" step="1" value="${manualOffsets.get(bone)?.[i]||0}" data-bone="${bone}" data-axis="${i}"><output>${manualOffsets.get(bone)?.[i]||0}</output></label>`).join('')}<button class="mini-btn" data-reset-bone="${bone}">重置</button></div>`;}html+='</details>';}
  html+='<details class="bone-group"><summary>全部材质控制</summary><div id="materialControls"></div></details><details class="bone-group"><summary>全部 Mesh 显隐</summary><div id="meshControls"></div></details><details class="bone-group"><summary>SpringBone / 物理控制</summary><div id="springControls"></div></details>';
  controlPage.innerHTML=html;bindToggles();
  const modelRanges=[...controlPage.querySelectorAll('.panel-section input[type=range]')],modelKeys=['modelScale','modelX','modelY','modelZ','modelRotY','skinBrightness'];modelRanges.forEach((el,i)=>el.oninput=()=>{settings[modelKeys[i]]=Number(el.value);el.parentElement.querySelector('output').textContent=el.value;applyModelSettings();saveSettings();});
  controlPage.querySelector('[data-setting="modelVisible"]').onchange=e=>{settings.modelVisible=e.target.checked;applyModelSettings();saveSettings();};
  controlPage.querySelectorAll('[data-bone]').forEach(el=>{el.onpointerdown=()=>{manualOverrideUntil=performance.now()+999999;stopAction();};el.onpointerup=()=>manualOverrideUntil=performance.now()+1500;el.oninput=()=>{const b=el.dataset.bone,i=Number(el.dataset.axis);const v=manualOffsets.get(b)||[0,0,0];v[i]=Number(el.value);manualOffsets.set(b,v);el.parentElement.querySelector('output').textContent=el.value;};});
  controlPage.querySelectorAll('[data-reset-bone]').forEach(b=>b.onclick=()=>{manualOffsets.delete(b.dataset.resetBone);renderBodyControls();});$('#bodyReset').onclick=()=>{manualOffsets.clear();renderBodyControls();};$('#modelReset').onclick=()=>{manualOffsets.clear();Object.assign(settings,{modelScale:1,modelX:0,modelY:0,modelZ:0,modelRotY:0,skinBrightness:1});applyModelSettings();saveSettings();renderBodyControls();};
  const mc=$('#materialControls');if(mc){for(const snap of materialSnapshots.values()){const m=snap.mat,card=document.createElement('div');card.className='material-card';let h=`<b>${snap.name}</b>`;if(m.color)h+=`<label class="color-row"><span>颜色</span><input type="color" value="#${m.color.getHexString()}" data-kind="color"></label>`;if(typeof m.opacity==='number')h+=rowSlider('透明度',0,1,.01,m.opacity);if(typeof m.roughness==='number')h+=rowSlider('粗糙度',0,1,.01,m.roughness);if(typeof m.metalness==='number')h+=rowSlider('金属度',0,1,.01,m.metalness);card.innerHTML=h;const c=card.querySelector('[data-kind=color]');if(c)c.oninput=e=>{m.color.set(e.target.value);m.needsUpdate=true;};const rr=[...card.querySelectorAll('input[type=range]')];let i=0;if(typeof m.opacity==='number'){const e=rr[i++];e.oninput=()=>{m.opacity=+e.value;m.transparent=m.opacity<1;e.parentElement.querySelector('output').textContent=e.value;m.needsUpdate=true;};}if(typeof m.roughness==='number'){const e=rr[i++];e.oninput=()=>{m.roughness=+e.value;e.parentElement.querySelector('output').textContent=e.value;};}if(typeof m.metalness==='number'){const e=rr[i++];e.oninput=()=>{m.metalness=+e.value;e.parentElement.querySelector('output').textContent=e.value;};}mc.appendChild(card);}}
  const meshBox=$('#meshControls');if(meshBox){const meshes=[];vrm?.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});for(const mesh of meshes){const row=document.createElement('label');row.className='switch-row';row.innerHTML=`<span>${mesh.name||mesh.uuid.slice(0,8)}</span><input type="checkbox" ${mesh.visible?'checked':''}>`;row.querySelector('input').onchange=e=>mesh.visible=e.target.checked;meshBox.appendChild(row);}if(!meshes.length)meshBox.textContent='无 Mesh';}
  const springBox=$('#springControls');if(springBox){const sm=vrm?.springBoneManager,joints=[...(sm?.joints||[])],colliders=[...(sm?.colliders||[])];springBox.innerHTML=`<div class="section-toolbar"><button id="springReset" class="secondary-btn">重置物理状态</button><small>${joints.length} joints · ${colliders.length} colliders</small></div>`;$('#springReset').onclick=()=>sm?.reset?.();for(const joint of joints){const st=joint.settings||{},card=document.createElement('div');card.className='material-card';card.innerHTML=`<b>${joint.bone?.name||'Spring Joint'}</b>${rowSlider('刚度 stiffness',0,5,.01,st.stiffness??1)}${rowSlider('阻力 drag',0,1,.01,st.dragForce??.4)}${rowSlider('重力 gravity',0,3,.01,st.gravityPower??0)}${rowSlider('碰撞半径',0,.2,.001,st.hitRadius??0)}${rowSlider('重力方向 X',-1,1,.01,st.gravityDir?.x??0)}${rowSlider('重力方向 Y',-1,1,.01,st.gravityDir?.y??-1)}${rowSlider('重力方向 Z',-1,1,.01,st.gravityDir?.z??0)}`;const q=[...card.querySelectorAll('input[type=range]')];q.forEach(e=>e.oninput=()=>e.parentElement.querySelector('output').textContent=e.value);q[0].oninput=()=>{st.stiffness=+q[0].value;q[0].parentElement.querySelector('output').textContent=q[0].value;};q[1].oninput=()=>{st.dragForce=+q[1].value;q[1].parentElement.querySelector('output').textContent=q[1].value;};q[2].oninput=()=>{st.gravityPower=+q[2].value;q[2].parentElement.querySelector('output').textContent=q[2].value;};q[3].oninput=()=>{st.hitRadius=+q[3].value;q[3].parentElement.querySelector('output').textContent=q[3].value;};const gv=()=>{st.gravityDir?.set?.(+q[4].value,+q[5].value,+q[6].value);for(let i=4;i<7;i++)q[i].parentElement.querySelector('output').textContent=q[i].value;};q[4].oninput=q[5].oninput=q[6].oninput=gv;springBox.appendChild(card);}for(const [i,col] of colliders.entries()){const shape=col.shape;if(!shape||typeof shape.radius!=='number')continue;const card=document.createElement('div');card.className='material-card';card.innerHTML=`<b>Collider ${i+1}</b>${rowSlider('半径',0,.3,.001,shape.radius)}`;const r=card.querySelector('input');r.oninput=()=>{shape.radius=+r.value;r.parentElement.querySelector('output').textContent=r.value;};springBox.appendChild(card);}if(!sm)springBox.innerHTML='<small>该 VRM 未提供 SpringBone Manager。</small>';}

}
function renderExpressionControls(){
  const presets=[['自然','neutral'],['微笑','happy'],['开心','happy'],['悲伤','sad'],['生气','angry'],['惊讶','surprised'],['放松','relaxed'],['眨眼','blink']];
  const mgr=vrm?.expressionManager;const dyn=[...new Set([...(mgr?.expressions||[]).map(e=>e.expressionName||e.name).filter(Boolean),...Object.keys(mgr?.expressionMap||{})])];
  controlPage.innerHTML=`<section class="panel-section"><h3>预设表情</h3><div class="button-grid">${presets.map(([l,n])=>`<button data-exp="${n}" class="secondary-btn">${l}</button>`).join('')}</div>${rowSlider('表情强度',0,1,.05,.7)}<button id="clearExp" class="secondary-btn wide">清除表情</button></section><details class="bone-group"><summary>全部 Expression · ${dyn.length}</summary><div id="allExpressions"></div></details>`;
  const slider=controlPage.querySelector('.panel-section input[type=range]');controlPage.querySelectorAll('[data-exp]').forEach(b=>{const exists=!mgr||dyn.length===0||dyn.includes(b.dataset.exp);b.disabled=!exists;b.onclick=()=>setExpression(b.dataset.exp,Number(slider.value),220);});$('#clearExp').onclick=()=>{for(const n of dyn)mgr?.setValue?.(n,0);setExpression('neutral',0,180);};
  const box=$('#allExpressions');for(const name of dyn){const wrap=document.createElement('div');wrap.innerHTML=rowSlider(name,0,1,.01,0);const r=wrap.querySelector('input');r.oninput=()=>{mgr.setValue(name,Number(r.value));wrap.querySelector('output').textContent=r.value;};box.appendChild(wrap);}
}
function renderLifeControls(){
  controlPage.innerHTML=`<section class="panel-section"><h3>真实生命系统</h3>${toggleHtml('生命模拟','lifeSimulation')}${toggleHtml('极限疲劳自动恢复','autoFatigueRecovery')}${rowSlider('生命时间倍率',.25,3,.05,settings.lifeTimeScale)}<div class="life-readout">实时：心率 <b>${Math.round(lifeSim.heartRate)}</b> · 呼吸 <b>${Math.round(lifeSim.breathRate)}</b> · 疲劳 <b>${Math.round(lifeSim.fatigue)}%</b> · 能量 <b>${Math.round(lifeSim.energy)}%</b></div></section><section class="panel-section"><h3>基础生命参数</h3>${toggleHtml('自然行为系统','lifeEnabled')}${toggleHtml('跟随鼠标','mouseGaze')}${toggleHtml('允许摸鼠标','allowReach')}${toggleHtml('允许走路','allowWalk')}${toggleHtml('允许跑步','allowRun')}${rowSlider('基础心率 BPM',45,120,1,settings.bpm)}${rowSlider('基础呼吸 / min',6,24,1,settings.breaths)}${rowSlider('呼吸幅度',0,.8,.05,settings.breathAmp)}${rowSlider('微动作频率',0,1,.05,settings.microFreq)}${rowSlider('大动作频率',0,1,.05,settings.majorFreq)}</section>`;bindToggles();const ins=controlPage.querySelectorAll('input[type=range]');const keys=['lifeTimeScale','bpm','breaths','breathAmp','microFreq','majorFreq'];ins.forEach((el,i)=>{el.oninput=()=>{settings[keys[i]]=Number(el.value);el.parentElement.querySelector('output').textContent=el.value;saveSettings();};});
}
function renderMotionControls(){controlPage.innerHTML=`<section class="panel-section"><h3>持续动作预览</h3><div class="button-grid"><button data-preview="stop">停止</button><button data-preview="thinkLoop">思考</button><button data-preview="walk">走路</button><button data-preview="run">跑步</button><button data-preview="crouch">蹲下</button></div>${rowSlider('动作速度',.6,1.5,.05,settings.motionSpeed)}<small>选择后持续播放，直到切换或停止。</small></section><section class="panel-section"><h3>单次动作</h3><div class="button-grid"><button data-once="nod">点头</button><button data-once="wave">挥手</button><button data-once="reach">摸鼠标</button><button data-once="weight">重心切换</button></div></section>`;controlPage.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>startPreviewMotion(b.dataset.preview));controlPage.querySelectorAll('[data-once]').forEach(b=>b.onclick=()=>playClip(b.dataset.once,{duration:clips.get(b.dataset.once)?.duration||2}));const speed=controlPage.querySelector('input[type=range]');speed.oninput=()=>{settings.motionSpeed=Number(speed.value);speed.parentElement.querySelector('output').textContent=speed.value;if(currentAction)currentAction.setEffectiveTimeScale(settings.motionSpeed);saveSettings();};}
function renderStageControls(){controlPage.innerHTML=`<section class="panel-section"><h3>舞台总控</h3>${toggleHtml('显示舞台','stageVisible')}${rowSlider('舞台半径',.6,3,.05,1.55)}${rowSlider('地板透明度',0,1,.01,floorMat.opacity)}${rowSlider('地板粗糙度',0,1,.01,floorMat.roughness)}${rowSlider('地板金属度',0,1,.01,floorMat.metalness)}${rowSlider('主圆环亮度',0,1,.01,ringMat.opacity)}${rowSlider('内圆环亮度',0,1,.01,innerRing.material.opacity)}<label class="color-row"><span>背景颜色</span><input id="bgColor" type="color" value="#${scene.background.getHexString()}"></label><label class="color-row"><span>地板颜色</span><input id="floorColor" type="color" value="#${floorMat.color.getHexString()}"></label><label class="color-row"><span>主圆环颜色</span><input id="ringColor" type="color" value="#${ringMat.color.getHexString()}"></label><label class="color-row"><span>内圆环颜色</span><input id="innerColor" type="color" value="#${innerRing.material.color.getHexString()}"></label><button id="stageReset" class="secondary-btn wide">舞台复位</button></section>`;bindToggles();const vis=controlPage.querySelector('[data-setting="stageVisible"]');vis.onchange=e=>{settings.stageVisible=e.target.checked;floor.visible=ring.visible=innerRing.visible=settings.stageVisible;saveSettings();};const a=[...controlPage.querySelectorAll('input[type=range]')];a[0].oninput=()=>{const z=+a[0].value/1.55;floor.scale.setScalar(z);ring.scale.setScalar(z);innerRing.scale.setScalar(z);bodyPhysics?.rebuildGround?.(+a[0].value);a[0].parentElement.querySelector('output').textContent=a[0].value;};a[1].oninput=()=>{floorMat.opacity=+a[1].value;a[1].parentElement.querySelector('output').textContent=a[1].value;};a[2].oninput=()=>{floorMat.roughness=+a[2].value;a[2].parentElement.querySelector('output').textContent=a[2].value;};a[3].oninput=()=>{floorMat.metalness=+a[3].value;a[3].parentElement.querySelector('output').textContent=a[3].value;};a[4].oninput=()=>{ringMat.opacity=+a[4].value;a[4].parentElement.querySelector('output').textContent=a[4].value;};a[5].oninput=()=>{innerRing.material.opacity=+a[5].value;a[5].parentElement.querySelector('output').textContent=a[5].value;};$('#bgColor').oninput=e=>{scene.background.set(e.target.value);renderer.setClearColor(e.target.value);};$('#floorColor').oninput=e=>floorMat.color.set(e.target.value);$('#ringColor').oninput=e=>ringMat.color.set(e.target.value);$('#innerColor').oninput=e=>innerRing.material.color.set(e.target.value);$('#stageReset').onclick=()=>{floor.scale.setScalar(1);ring.scale.setScalar(1);innerRing.scale.setScalar(1);floorMat.opacity=.94;floorMat.roughness=.78;floorMat.metalness=.08;ringMat.opacity=.75;innerRing.material.opacity=.32;scene.background.set(0x0b0d0e);renderer.setClearColor(0x0b0d0e);floorMat.color.set(0x10161d);ringMat.color.set(0x59dce0);innerRing.material.color.set(0x5665a7);renderStageControls();};}
function renderLightControls(){controlPage.innerHTML=`<section class="panel-section"><h3>灯光总控</h3><div class="preset-row"><button data-light="natural">自然</button><button data-light="soft">柔和</button><button data-light="warm">暖色</button><button data-light="cool">冷色</button><button data-light="stage">舞台</button></div>${rowSlider('环境光',0,2,.01,settings.ambient)}${rowSlider('主光',0,4,.01,settings.key)}<label class="color-row"><span>主光颜色</span><input id="keyColor" type="color" value="${settings.keyColor}"></label>${rowSlider('主光 X',-6,6,.1,settings.keyX)}${rowSlider('主光 Y',-2,8,.1,settings.keyY)}${rowSlider('主光 Z',-6,6,.1,settings.keyZ)}${rowSlider('补光',0,3,.01,settings.fill)}<label class="color-row"><span>补光颜色</span><input id="fillColor" type="color" value="${settings.fillColor}"></label>${rowSlider('补光 X',-6,6,.1,settings.fillX)}${rowSlider('补光 Y',-2,8,.1,settings.fillY)}${rowSlider('补光 Z',-6,6,.1,settings.fillZ)}${rowSlider('轮廓光',0,3,.01,settings.rim)}<label class="color-row"><span>轮廓颜色</span><input id="rimColor" type="color" value="${settings.rimColor}"></label>${rowSlider('轮廓 X',-6,6,.1,settings.rimX)}${rowSlider('轮廓 Y',-2,8,.1,settings.rimY)}${rowSlider('轮廓 Z',-6,6,.1,settings.rimZ)}${rowSlider('舞台聚光',0,8,.01,settings.stageLight)}<label class="color-row"><span>舞台灯颜色</span><input id="spotColor" type="color" value="${settings.stageColor}"></label>${rowSlider('聚光 X',-6,6,.1,settings.spotX)}${rowSlider('聚光 Y',0,10,.1,settings.spotY)}${rowSlider('聚光 Z',-6,6,.1,settings.spotZ)}${rowSlider('目标 X',-3,3,.1,settings.spotTargetX)}${rowSlider('目标 Y',0,3,.1,settings.spotTargetY)}${rowSlider('目标 Z',-3,3,.1,settings.spotTargetZ)}${rowSlider('聚光角度',.1,1.2,.01,settings.spotAngle)}${rowSlider('边缘柔和',0,1,.01,settings.spotPenumbra)}${rowSlider('距离',1,20,.1,settings.spotDistance)}${rowSlider('曝光',.5,1.5,.01,settings.exposure)}<label class="switch-row"><span>阴影</span><input id="shadowToggle" type="checkbox" ${renderer.shadowMap.enabled?'checked':''}></label><label>像素倍率<select id="pixelRatio"><option value="auto">Auto</option><option value="1">1x</option><option value="1.5">1.5x</option><option value="2">2x</option></select></label></section>`;const keys=['ambient','key','keyX','keyY','keyZ','fill','fillX','fillY','fillZ','rim','rimX','rimY','rimZ','stageLight','spotX','spotY','spotZ','spotTargetX','spotTargetY','spotTargetZ','spotAngle','spotPenumbra','spotDistance','exposure'];const ranges=[...controlPage.querySelectorAll('input[type=range]')];ranges.forEach((el,i)=>el.oninput=()=>{settings[keys[i]]=+el.value;el.parentElement.querySelector('output').textContent=el.value;applyLighting();saveSettings();});for(const [id,k] of [['keyColor','keyColor'],['fillColor','fillColor'],['rimColor','rimColor'],['spotColor','stageColor']])$('#'+id).oninput=e=>{settings[k]=e.target.value;applyLighting();saveSettings();};$('#shadowToggle').onchange=e=>renderer.shadowMap.enabled=e.target.checked;$('#pixelRatio').onchange=e=>{renderer.setPixelRatio(e.target.value==='auto'?Math.min(devicePixelRatio||1,2):+e.target.value);resize();};controlPage.querySelectorAll('[data-light]').forEach(b=>b.onclick=()=>applyLightPreset(b.dataset.light));}
function applyLighting(){ambient.intensity=settings.ambient;key.intensity=settings.key;fill.intensity=settings.fill;rim.intensity=settings.rim;stageSpot.intensity=settings.stageLight;key.color.set(settings.keyColor);fill.color.set(settings.fillColor);rim.color.set(settings.rimColor);stageSpot.color.set(settings.stageColor);key.position.set(settings.keyX,settings.keyY,settings.keyZ);fill.position.set(settings.fillX,settings.fillY,settings.fillZ);rim.position.set(settings.rimX,settings.rimY,settings.rimZ);stageSpot.position.set(settings.spotX,settings.spotY,settings.spotZ);stageSpot.target.position.set(settings.spotTargetX,settings.spotTargetY,settings.spotTargetZ);stageSpot.angle=settings.spotAngle;stageSpot.penumbra=settings.spotPenumbra;stageSpot.distance=settings.spotDistance;renderer.toneMappingExposure=settings.exposure;}
function applyLightPreset(p){const m={natural:[.32,1.15,.42,.55,0,.9],soft:[.42,.85,.55,.35,0,.9],warm:[.28,1.25,.35,.5,0,.88],cool:[.25,1,.6,.75,0,.88],stage:[.18,.8,.25,.8,2.2,.82]}[p];if(!m)return;[settings.ambient,settings.key,settings.fill,settings.rim,settings.stageLight,settings.exposure]=m;if(p==='warm'){settings.keyColor='#ffddc7';settings.fillColor='#ffd9c8';}else if(p==='cool'){settings.keyColor='#dceaff';settings.fillColor='#a6d9ff';}else{settings.keyColor='#fff4eb';settings.fillColor='#bfdcff';}applyLighting();saveSettings();renderLightControls();}
function renderCameraControls(){controlPage.innerHTML=`<section class="panel-section"><h3>相机总控</h3><div class="button-grid"><button data-cam="full">全身</button><button data-cam="upper">半身</button><button data-cam="face">脸部</button><button data-cam="left">左侧</button><button data-cam="right">右侧</button><button data-cam="back">背面</button></div>${rowSlider('FOV',15,70,1,camera.fov)}${rowSlider('旋转速度',.1,2,.05,controls.rotateSpeed)}${rowSlider('缩放速度',.1,2,.05,controls.zoomSpeed)}${rowSlider('平移速度',.1,2,.05,controls.panSpeed)}${rowSlider('阻尼',0,.25,.01,controls.dampingFactor)}${rowSlider('最小距离',.3,5,.1,controls.minDistance)}${rowSlider('最大距离',2,15,.1,controls.maxDistance)}${rowSlider('相机 X',-8,8,.05,camera.position.x)}${rowSlider('相机 Y',-2,8,.05,camera.position.y)}${rowSlider('相机 Z',-8,8,.05,camera.position.z)}${rowSlider('目标 X',-3,3,.05,controls.target.x)}${rowSlider('目标 Y',0,3,.05,controls.target.y)}${rowSlider('目标 Z',-3,3,.05,controls.target.z)}</section>`;controlPage.querySelectorAll('[data-cam]').forEach(b=>b.onclick=()=>{cameraPreset(b.dataset.cam);renderCameraControls();});const q=[...controlPage.querySelectorAll('input[type=range]')];const apply=()=>{camera.fov=+q[0].value;camera.updateProjectionMatrix();controls.rotateSpeed=+q[1].value;controls.zoomSpeed=+q[2].value;controls.panSpeed=+q[3].value;controls.dampingFactor=+q[4].value;controls.minDistance=+q[5].value;controls.maxDistance=+q[6].value;camera.position.set(+q[7].value,+q[8].value,+q[9].value);controls.target.set(+q[10].value,+q[11].value,+q[12].value);controls.update();q.forEach(e=>e.parentElement.querySelector('output').textContent=e.value);};q.forEach(e=>e.oninput=apply);}
function cameraPreset(p){const y=modelHeight*.52,d=modelHeight*2.35;const map={full:[0,y,d],upper:[0,modelHeight*.72,modelHeight*1.65],face:[0,modelHeight*.86,modelHeight*.72],left:[-d*.75,y,0],right:[d*.75,y,0],back:[0,y,-d]};const v=map[p]||map.full;camera.position.set(...v);controls.target.set(0,p==='face'?modelHeight*.86:y,0);controls.update();}
function renderVoicePageIfOpen(){if(activeTab==='声音'&&panel&&!panel.classList.contains('hidden'))renderVoiceControls();}
function renderVoiceControls(){const opts=voices.map(v=>`<option ${settings.systemVoice===v.name?'selected':''}>${v.name}</option>`).join('');controlPage.innerHTML=`<section class="panel-section"><h3>免费系统语音</h3><label>系统 Voice<select id="voiceSelect"><option value="">自动选择中文</option>${opts}</select></label>${rowSlider('语速',.7,1.3,.05,settings.voiceRate)}${rowSlider('音调',.7,1.3,.05,settings.voicePitch)}${rowSlider('音量',0,1,.05,settings.voiceVolume)}<button id="voiceTest" class="primary-btn wide">测试声音</button><small>免费版默认使用浏览器 / 系统语音，不等待云接口。</small></section>`;$('#voiceSelect').onchange=e=>{settings.systemVoice=e.target.value;saveSettings();};const s=controlPage.querySelectorAll('input[type=range]');['voiceRate','voicePitch','voiceVolume'].forEach((k,i)=>s[i].oninput=()=>{settings[k]=Number(s[i].value);s[i].parentElement.querySelector('output').textContent=s[i].value;saveSettings();});$('#voiceTest').onclick=()=>speak('你好，我是 NIVA。很高兴见到你。');}

lifeGuideToggle.onclick=()=>{lifeGuide.classList.toggle('hidden');panel.classList.add('hidden');upgradePanel.classList.add('hidden');};closeLifeGuide.onclick=()=>lifeGuide.classList.add('hidden');
$('#panelToggle').onclick=()=>{panel.classList.toggle('hidden');lifeGuide.classList.add('hidden');upgradePanel.classList.add('hidden');settings.panelVisible=!panel.classList.contains('hidden');saveSettings();renderControl();};$('#closePanel').onclick=()=>{panel.classList.add('hidden');settings.panelVisible=false;saveSettings();};$('#upgradeToggle').onclick=()=>{upgradePanel.classList.toggle('hidden');panel.classList.add('hidden');};$('#closeUpgrade').onclick=()=>upgradePanel.classList.add('hidden');
if(settings.panelVisible){panel.classList.remove('hidden');renderControl();}
document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='c'&&document.activeElement!==composerInput)$('#panelToggle').click();});

applyLighting();floor.visible=ring.visible=innerRing.visible=settings.stageVisible!==false;
function animate(){
  requestAnimationFrame(animate); const dt=Math.min(clock.getDelta(),.05),now=performance.now(); controls.update(); if(mixer)mixer.update(dt); lifeSim.update(dt,now); life.update(now); director.update(now); updateGaze(now); expressionTick(now); lifeSim.applyFatigueFace();
  if(speaking&&vrm?.expressionManager){ mouthLevel=.12+Math.abs(Math.sin(now*.012))*0.32+Math.abs(Math.sin(now*.027))*0.14;vrm.expressionManager.setValue('aa',mouthLevel); } else if(vrm?.expressionManager){mouthLevel*=.78;vrm.expressionManager.setValue('aa',mouthLevel);}
  applyManualAndLife(); if(vrm){lifeSim.applyGroundContact(dt);if(settings.physicsEnabled&&bodyPhysics&&physicsReady){const clip=currentAction?.getClip?.();bodyPhysics.configure({enabled:true,ikEnabled:settings.footIKEnabled,ikStrength:settings.footIKStrength});bodyPhysics.solvePostAnimation(dt,{action:currentActionName,actionTime:currentAction?.time||0,duration:clip?.duration||1,crouchDepth:settings.crouchDepth});}vrm.update(dt);} renderer.render(scene,camera);
}
animate();

window.NIVA={version:'0.94-physics-body',speak,act:(name)=>performAction(name),play:(name)=>playClip(name,{duration:clips.get(name)?.duration||2}),stop:stopAction,state:()=>({modelReady,speaking,currentAction:currentActionName,director:director.state,physics:{ready:physicsReady,error:physicsError,...(bodyPhysics?.state?.()||{})},life:{fatigue:lifeSim.fatigue,energy:lifeSim.energy,heartRate:lifeSim.heartRate,breathRate:lifeSim.breathRate,recovering:lifeSim.recovering}})};
