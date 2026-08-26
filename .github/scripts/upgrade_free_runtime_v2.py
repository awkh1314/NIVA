from pathlib import Path
import re

p = Path('src/main.js')
s = p.read_text(encoding='utf-8')

# Persistent runtime controls.
s = s.replace(
    "  voiceVolume:1,\n}, JSON.parse",
    "  voiceVolume:1,\n  motionSpeed:1,\n  modelVisible:true,\n  modelScale:1,\n  modelX:0, modelY:0, modelZ:0, modelRotY:0,\n  skinBrightness:1,\n  stageVisible:true,\n  keyColor:'#fff4eb', fillColor:'#bfdcff', rimColor:'#a9d8ff', stageColor:'#69e4e8',\n  keyX:2.4,keyY:4.2,keyZ:3.2, fillX:-2.8,fillY:2.3,fillZ:2.2, rimX:-2.3,rimY:3,rimZ:-2.7,\n  spotX:0,spotY:4,spotZ:2, spotTargetX:0,spotTargetY:1,spotTargetZ:0, spotAngle:.45,spotPenumbra:.7,spotDistance:8,\n}, JSON.parse",
    1,
)

# Full humanoid bone list.
s = re.sub(
    r"function rememberBones\(\)\{\n  const names = \[[^\n]+\];",
    """function rememberBones(){
  const names = ['hips','spine','chest','upperChest','neck','head','leftEye','rightEye','jaw','leftShoulder','rightShoulder','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftHand','rightHand','leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg','leftFoot','rightFoot','leftToes','rightToes','leftThumbMetacarpal','leftThumbProximal','leftThumbDistal','leftIndexProximal','leftIndexIntermediate','leftIndexDistal','leftMiddleProximal','leftMiddleIntermediate','leftMiddleDistal','leftRingProximal','leftRingIntermediate','leftRingDistal','leftLittleProximal','leftLittleIntermediate','leftLittleDistal','rightThumbMetacarpal','rightThumbProximal','rightThumbDistal','rightIndexProximal','rightIndexIntermediate','rightIndexDistal','rightMiddleProximal','rightMiddleIntermediate','rightMiddleDistal','rightRingProximal','rightRingIntermediate','rightRingDistal','rightLittleProximal','rightLittleIntermediate','rightLittleDistal'];""",
    s,
    count=1,
)

marker = "function makeClip(name, duration, tracks){"
insert = r'''
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
function applyModelSettings(){if(!vrm)return;vrm.scene.visible=settings.modelVisible;vrm.scene.scale.setScalar(settings.modelScale);vrm.scene.position.set(modelHome.x+settings.modelX,modelHome.y+settings.modelY,modelHome.z+settings.modelZ);vrm.scene.rotation.y=rad(settings.modelRotY);applySkinBrightness();}
'''
if marker not in s:
    raise SystemExit('makeClip marker missing')
s = s.replace(marker, insert + '\n' + marker, 1)

# Better authored walk/run, with relaxed baseline arms and foot tracks.
gait_pat = re.compile(r"  const walkTimes=\[0,.125,.25,.375,.5,.625,.75,.875,1\];.*?  clips\.set\('run', makeClip\('run',\.70,\{.*?\}\)\);", re.S)
gait_new = r'''  const walkTimes=[0,.125,.25,.375,.5,.625,.75,.875,1];
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
  clips.set('thinkLoop',makeClip('thinkLoop',4,{head:[[0,-2,5,-7],[1,-3,6,-8],[2,-2,5,-7],[3,-3,7,-6],[4,-2,5,-7]],rightUpperArm:[[0,8,4,20],[4,8,4,20]],rightLowerArm:[[0,0,48,0],[4,0,48,0]],rightHand:[[0,6,0,-6],[2,8,0,-5],[4,6,0,-6]]}));'''
s, n = gait_pat.subn(gait_new, s, count=1)
if n != 1:
    raise SystemExit('gait replacement failed')

s = s.replace("next.reset(); next.enabled=true; next.setEffectiveWeight(1); next.setEffectiveTimeScale(1);", "next.reset(); next.enabled=true; next.setEffectiveWeight(1); next.setEffectiveTimeScale(settings.motionSpeed||1);", 1)

old = "scene.add(vrm.scene); centerModel(); rememberBones();\n  if(vrm.lookAt) vrm.lookAt.target=gazeTarget;\n  mixer=new THREE.AnimationMixer(vrm.humanoid.normalizedHumanBonesRoot || vrm.scene); buildClips();"
new = "scene.add(vrm.scene); rememberBones(); applyRelaxedStandingPose(); rememberBones(); centerModel(); modelHome.copy(vrm.scene.position); captureMaterials(); applyModelSettings();\n  gazeTarget.position.copy(camera.position); if(vrm.lookAt) vrm.lookAt.target=gazeTarget;\n  mixer=new THREE.AnimationMixer(vrm.humanoid.normalizedHumanBonesRoot || vrm.scene); buildClips();"
if old not in s:
    raise SystemExit('loader marker missing')
s = s.replace(old, new, 1)

# Fix white-eye / rolled-eye behavior.
gaze_pat = re.compile(r"function updateGaze\(now\)\{.*?\n\}", re.S)
gaze_new = r'''function updateGaze(now){
  if(!vrm||!settings.gazeEnabled)return;
  let x=0,y=0;
  if(lookOverride&&now<lookOverrideUntil){x=clamp(lookOverride.x,-.45,.45);y=clamp(lookOverride.y,-.22,.22);}else{lookOverride=null;if(settings.mouseGaze&&pointerInside&&(now-pointerMovedAt)<1200){x=clamp(pointerNdc.x,-.8,.8);y=clamp(pointerNdc.y,-.6,.6);}}
  const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  const target=camera.position.clone().addScaledVector(right,x*modelHeight*.24).addScaledVector(up,y*modelHeight*.14);
  gazeTarget.position.lerp(target,.12);
}'''
s, n = gaze_pat.subn(gaze_new, s, count=1)
if n != 1:
    raise SystemExit('gaze replacement failed')

# Two UI layers: persistent motion previews and speech performances.
chips_pat = re.compile(r"const chips=\[.*?\nfor\(const \[label,text\] of chips\).*?\n\nconst life=", re.S)
chips_new = r'''const experienceBar=$('#experienceBar');
experienceBar.innerHTML='<div class="experience-row"><span class="experience-label">动作预览</span></div><div class="experience-row"><span class="experience-label">语音演出</span></div>';
const previewRow=experienceBar.children[0],voiceRow=experienceBar.children[1];
const previewActions=[['停止','stop'],['思考','thinkLoop'],['走路','walk'],['跑步','run']];
function startPreviewMotion(name){if(name==='stop'){stopAction();setExpression('neutral',0);return;}stopAction();setTimeout(()=>playClip(name,{loop:true}),190);}
for(const [label,name] of previewActions){const b=document.createElement('button');b.className='chip';b.textContent=label;b.onclick=()=>startPreviewMotion(name);previewRow.appendChild(b);}
const voiceScenes=[
  ['打招呼',()=>{stopAction();setExpression('happy',.28);setTimeout(()=>playClip('wave',{duration:2.05}),120);setTimeout(()=>speak('你好，我是 NIVA。很高兴见到你。',true),220);}],
  ['自我介绍',()=>{stopAction();setExpression('happy',.22);setTimeout(()=>playClip('nod',{duration:1}),120);setTimeout(()=>speak('我是妮瓦。你可以体验我的动作、表情、生命状态、舞台、灯光和完整模型控制。',true),220);}],
  ['微笑说话',()=>{stopAction();setExpression('happy',.30);speak('嗯，我在这里。',true);}],
  ['说明',()=>{stopAction();setExpression('neutral',.08);speak('免费基础体验不需要连接任何接口，你可以直接操控和观察我。',true);}]
];
for(const [label,fn] of voiceScenes){const b=document.createElement('button');b.className='chip';b.textContent=label;b.onclick=fn;voiceRow.appendChild(b);}

const life='''
s, n = chips_pat.subn(chips_new, s, count=1)
if n != 1:
    raise SystemExit('experience replacement failed')

# Full-body controls + model transform + every standard finger bone.
body_pat = re.compile(r"function renderBodyControls\(\)\{.*?\n\}\nfunction renderExpressionControls", re.S)
body_new = r'''function renderBodyControls(){
  const groups={躯干:['hips','spine','chest','upperChest'],头颈:['neck','head','leftEye','rightEye','jaw'],肩臂:['leftShoulder','rightShoulder','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftHand','rightHand'],下肢:['leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg','leftFoot','rightFoot','leftToes','rightToes'],左手指:['leftThumbMetacarpal','leftThumbProximal','leftThumbDistal','leftIndexProximal','leftIndexIntermediate','leftIndexDistal','leftMiddleProximal','leftMiddleIntermediate','leftMiddleDistal','leftRingProximal','leftRingIntermediate','leftRingDistal','leftLittleProximal','leftLittleIntermediate','leftLittleDistal'],右手指:['rightThumbMetacarpal','rightThumbProximal','rightThumbDistal','rightIndexProximal','rightIndexIntermediate','rightIndexDistal','rightMiddleProximal','rightMiddleIntermediate','rightMiddleDistal','rightRingProximal','rightRingIntermediate','rightRingDistal','rightLittleProximal','rightLittleIntermediate','rightLittleDistal']};
  let html=`<section class="panel-section"><h3>模型总控</h3>${toggleHtml('显示模型','modelVisible')}${rowSlider('模型缩放',.5,1.8,.01,settings.modelScale)}${rowSlider('位置 X',-2,2,.01,settings.modelX)}${rowSlider('位置 Y',-.5,2,.01,settings.modelY)}${rowSlider('位置 Z',-2,2,.01,settings.modelZ)}${rowSlider('朝向 Y°',-180,180,1,settings.modelRotY)}${rowSlider('皮肤/面部亮度',.55,1.45,.01,settings.skinBrightness)}<button id="modelReset" class="secondary-btn wide">恢复自然站姿</button></section><div class="section-toolbar"><button id="bodyReset" class="secondary-btn">清除骨骼偏移</button><small>完整 normalized humanoid 控制</small></div>`;
  for(const [g,bones] of Object.entries(groups)){html+=`<details class="bone-group"><summary>${g} · ${bones.filter(getBone).length} 骨骼</summary>`;for(const bone of bones){if(!getBone(bone))continue;html+=`<div class="bone-card"><b>${bone}</b>${['X','Y','Z'].map((a,i)=>`<label class="control-row compact"><span>${a}</span><input type="range" min="-60" max="60" step="1" value="${manualOffsets.get(bone)?.[i]||0}" data-bone="${bone}" data-axis="${i}"><output>${manualOffsets.get(bone)?.[i]||0}</output></label>`).join('')}<button class="mini-btn" data-reset-bone="${bone}">重置</button></div>`;}html+='</details>';}
  controlPage.innerHTML=html;bindToggles();
  const modelRanges=[...controlPage.querySelectorAll('.panel-section input[type=range]')],modelKeys=['modelScale','modelX','modelY','modelZ','modelRotY','skinBrightness'];modelRanges.forEach((el,i)=>el.oninput=()=>{settings[modelKeys[i]]=Number(el.value);el.parentElement.querySelector('output').textContent=el.value;applyModelSettings();saveSettings();});
  controlPage.querySelector('[data-setting="modelVisible"]').onchange=e=>{settings.modelVisible=e.target.checked;applyModelSettings();saveSettings();};
  controlPage.querySelectorAll('[data-bone]').forEach(el=>{el.onpointerdown=()=>{manualOverrideUntil=performance.now()+999999;stopAction();};el.onpointerup=()=>manualOverrideUntil=performance.now()+1500;el.oninput=()=>{const b=el.dataset.bone,i=Number(el.dataset.axis);const v=manualOffsets.get(b)||[0,0,0];v[i]=Number(el.value);manualOffsets.set(b,v);el.parentElement.querySelector('output').textContent=el.value;};});
  controlPage.querySelectorAll('[data-reset-bone]').forEach(b=>b.onclick=()=>{manualOffsets.delete(b.dataset.resetBone);renderBodyControls();});$('#bodyReset').onclick=()=>{manualOffsets.clear();renderBodyControls();};$('#modelReset').onclick=()=>{manualOffsets.clear();Object.assign(settings,{modelScale:1,modelX:0,modelY:0,modelZ:0,modelRotY:0,skinBrightness:1});applyModelSettings();saveSettings();renderBodyControls();};
}
function renderExpressionControls'''
s, n = body_pat.subn(body_new, s, count=1)
if n != 1:
    raise SystemExit('body controls replacement failed')

# Motion page persistent preview.
motion_pat = re.compile(r"function renderMotionControls\(\)\{.*?\}\nfunction renderStageControls", re.S)
motion_new = r'''function renderMotionControls(){controlPage.innerHTML=`<section class="panel-section"><h3>持续动作预览</h3><div class="button-grid"><button data-preview="stop">停止</button><button data-preview="thinkLoop">思考</button><button data-preview="walk">走路</button><button data-preview="run">跑步</button></div>${rowSlider('动作速度',.6,1.5,.05,settings.motionSpeed)}<small>选择后持续播放，直到切换或停止。</small></section><section class="panel-section"><h3>单次动作</h3><div class="button-grid"><button data-once="nod">点头</button><button data-once="wave">挥手</button><button data-once="reach">摸鼠标</button><button data-once="weight">重心切换</button></div></section>`;controlPage.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>startPreviewMotion(b.dataset.preview));controlPage.querySelectorAll('[data-once]').forEach(b=>b.onclick=()=>playClip(b.dataset.once,{duration:clips.get(b.dataset.once)?.duration||2}));const speed=controlPage.querySelector('input[type=range]');speed.oninput=()=>{settings.motionSpeed=Number(speed.value);speed.parentElement.querySelector('output').textContent=speed.value;if(currentAction)currentAction.setEffectiveTimeScale(settings.motionSpeed);saveSettings();};}
function renderStageControls'''
s, n = motion_pat.subn(motion_new, s, count=1)
if n != 1:
    raise SystemExit('motion controls replacement failed')

s = s.replace("version:'0.90-free-life'", "version:'0.91-free-life'", 1)
p.write_text(s, encoding='utf-8')

css = Path('src/style.css')
c = css.read_text(encoding='utf-8')
if 'NIVA Free Runtime v0.91' not in c:
    c += '''\n/* NIVA Free Runtime v0.91 */\n.experience-bar{flex-direction:column;align-items:center;overflow:visible;gap:5px;bottom:76px;max-width:min(900px,82vw)}\n.experience-row{display:flex;gap:6px;align-items:center;max-width:82vw;overflow-x:auto;scrollbar-width:none;padding:1px 2px}.experience-row::-webkit-scrollbar{display:none}.experience-label{font-size:11px;color:#72939d;border:1px solid #1e4655;background:#07141bcc;border-radius:999px;padding:6px 9px;white-space:nowrap}.panel-section+.panel-section{margin-top:14px;padding-top:12px;border-top:1px solid #173546}@media(max-width:620px){.experience-bar{max-width:96vw}.experience-row{max-width:96vw}.experience-label{display:none}}\n'''
css.write_text(c, encoding='utf-8')
