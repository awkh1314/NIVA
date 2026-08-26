const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));
const axis=(min,max)=>Object.freeze({min,max});
const joint=(x,y,z,speed=260)=>Object.freeze({x,y,z,speed});
const copyPose=(pose={})=>Object.fromEntries(Object.entries(pose).map(([k,v])=>[k,{x:v?.x||0,y:v?.y||0,z:v?.z||0}]));
const lerp=(a,b,t)=>a+(b-a)*clamp(t,0,1);

// Anatomical ROM V2. Values are engineering envelopes around a calibrated relaxed
// pose, derived from healthy-adult clinical ROM references and then mapped onto
// NIVA's normalized VRM local axes. They are NOT raw Euler copies of clinical ROM.
// Primary references: AAFP upper/lower-extremity ROM tables; CDC Normal Joint ROM;
// PubMed/PMC normative lumbar/cervical, thumb and finger studies.
export const ANATOMICAL_ROM_EVIDENCE=Object.freeze({
  shoulderComplex:{flexion:180,abduction:180,extension:60,internalRotation:90,externalRotation:90},
  elbow:{flexion:150,extensionHyper:10,pronation:90,supination:90},
  wrist:{flexion:90,extension:70,radialDeviation:30,ulnarDeviation:50},
  hip:{flexion:120,extension:20,abduction:45,adduction:30,internalRotation:40,externalRotation:45},
  knee:{flexion:135,extensionHyper:10,rotationStraight:10,rotationFlexedInternal:25,rotationFlexedExternal:40},
  ankle:{dorsiflexion:20,plantarFlexion:45,inversion:30,eversion:20},
  lumbar:{flexion:60,extension:30,lateralFlexion:30,axialRotation:7},
  cervical:{flexionExtensionTotal:120,lateralTotal:90,axialTotal:150},
  eye:{adduction:45,abduction:44,elevation:28,depression:47},
  thumb:{mcpFlexion:70,ipFlexion:90,cmcPalmarAbduction:71,cmcRadialAbduction:71},
  fingers:{mcpFlexion:90,mcpExtension:40,pipFlexion:{Index:110,Middle:110,Ring:120,Little:135},dipFlexion:{Index:90,Middle:90,Ring:90,Little:90}},
  toes:{dorsiflexion:75,plantarFlexion:35},
});

// Model-axis calibration for the current NIVA VRM, expressed as deltas from
// baseQuats. Whole-body ROM is enforced again below with coupled constraints.
export const NIVA_RUNTIME_JOINT_LIMITS=Object.freeze({
  hips:joint(axis(-18,22),axis(-25,25),axis(-16,16),150),
  spine:joint(axis(-20,25),axis(-10,10),axis(-15,15),135),
  chest:joint(axis(-20,25),axis(-18,18),axis(-20,20),145),
  upperChest:joint(axis(-15,20),axis(-18,18),axis(-18,18),145),
  neck:joint(axis(-35,40),axis(-45,45),axis(-30,30),210),
  head:joint(axis(-30,35),axis(-45,45),axis(-30,30),230),
  leftEye:joint(axis(-28,47),axis(-45,45),axis(-3,3),360),
  rightEye:joint(axis(-28,47),axis(-45,45),axis(-3,3),360),
  leftShoulder:joint(axis(-20,20),axis(-20,20),axis(-35,35),220),
  rightShoulder:joint(axis(-20,20),axis(-20,20),axis(-35,35),220),
  leftUpperArm:joint(axis(-60,120),axis(-90,90),axis(-130,130),300),
  rightUpperArm:joint(axis(-60,120),axis(-90,90),axis(-130,130),300),
  leftLowerArm:joint(axis(-85,85),axis(-150,10),axis(-8,8),340),
  rightLowerArm:joint(axis(-85,85),axis(-10,150),axis(-8,8),340),
  leftHand:joint(axis(-70,90),axis(-25,25),axis(-30,50),360),
  rightHand:joint(axis(-70,90),axis(-25,25),axis(-50,30),360),
  leftUpperLeg:joint(axis(-25,120),axis(-45,45),axis(-45,45),260),
  rightUpperLeg:joint(axis(-25,120),axis(-45,45),axis(-45,45),260),
  leftLowerLeg:joint(axis(-10,135),axis(-40,40),axis(-8,8),300),
  rightLowerLeg:joint(axis(-10,135),axis(-40,40),axis(-8,8),300),
  leftFoot:joint(axis(-20,50),axis(-15,15),axis(-25,30),260),
  rightFoot:joint(axis(-20,50),axis(-15,15),axis(-30,25),260),
  leftToes:joint(axis(-35,75),axis(-5,5),axis(-5,5),300),
  rightToes:joint(axis(-35,75),axis(-5,5),axis(-5,5),300),
});

const FINGER_FLEX=Object.freeze({Index:{pip:110,dip:90,spread:30},Middle:{pip:110,dip:90,spread:22.5},Ring:{pip:120,dip:90,spread:22.5},Little:{pip:135,dip:90,spread:25}});
const fingerNames=[];
const fingerLimits={};
for(const side of ['left','right']){
  const left=side==='left';
  fingerLimits[`${side}ThumbMetacarpal`]=joint(axis(-25,40),left?axis(-71,25):axis(-25,71),axis(-30,30),360);
  fingerLimits[`${side}ThumbProximal`]=joint(axis(-10,10),left?axis(-70,15):axis(-15,70),axis(-10,10),420);
  fingerLimits[`${side}ThumbDistal`]=joint(axis(-6,6),left?axis(-90,15):axis(-15,90),axis(-6,6),460);
  for(const finger of ['Index','Middle','Ring','Little']){
    const f=FINGER_FLEX[finger];
    const mcp=`${side}${finger}Proximal`,pip=`${side}${finger}Intermediate`,dip=`${side}${finger}Distal`;
    fingerNames.push(mcp,pip,dip);
    fingerLimits[mcp]=joint(axis(-f.spread,f.spread),left?axis(-90,40):axis(-40,90),axis(-f.spread,f.spread),420);
    fingerLimits[pip]=joint(axis(-3,3),left?axis(-f.pip,5):axis(-5,f.pip),axis(-3,3),460);
    fingerLimits[dip]=joint(axis(-3,3),left?axis(-f.dip,5):axis(-5,f.dip),axis(-3,3),480);
  }
}
Object.freeze(fingerLimits);

export function anatomicalLimitForBone(name){return NIVA_RUNTIME_JOINT_LIMITS[name]||fingerLimits[name]||null;}
export const ANATOMICAL_CONTROLLED_BONES=Object.freeze([...Object.keys(NIVA_RUNTIME_JOINT_LIMITS),...Object.keys(fingerLimits)]);

function hardClampBone(name,p){
  const l=anatomicalLimitForBone(name);if(!l)return {...p};
  return {x:clamp(p.x,l.x.min,l.x.max),y:clamp(p.y,l.y.min,l.y.max),z:clamp(p.z,l.z.min,l.z.max)};
}

function limitCombined(pose,bones,axisName,min,max){
  const present=bones.filter((b)=>pose[b]);if(!present.length)return;
  const total=present.reduce((s,b)=>s+(pose[b][axisName]||0),0);
  const target=clamp(total,min,max);
  if(Math.abs(total-target)<1e-6||Math.abs(total)<1e-6)return;
  const scale=target/total;
  for(const b of present)pose[b][axisName]*=scale;
}

function flexMagnitude(value,left){return Math.max(0,left?-value:value);}
function clampMirroredFlex(value,left,extension,flexion){return left?clamp(value,-flexion,extension):clamp(value,-extension,flexion);}

function projectShoulderComplex(pose,side){
  const shoulder=pose[`${side}Shoulder`],arm=pose[`${side}UpperArm`];if(!shoulder||!arm)return;
  const elevation=Math.max(Math.abs(arm.z),Math.max(0,arm.x));
  if(elevation>80){
    const sign=Math.sign(arm.z||1);
    const scapNeed=Math.min(35,(elevation-80)*0.55);
    if(Math.abs(shoulder.z)<scapNeed)shoulder.z=sign*scapNeed;
    const upperChest=pose.upperChest;
    if(upperChest&&elevation>120){
      const thoracic=Math.min(10,(elevation-120)*0.25);
      if(Math.abs(upperChest.z)<thoracic)upperChest.z=sign*thoracic;
    }
  }
  // At high elevation the remaining free axial rotation narrows. This prevents
  // the classic 'arm overhead + 90deg twist' pathological pose.
  const rotMax=lerp(90,58,(elevation-90)/40);
  arm.y=clamp(arm.y,-rotMax,rotMax);
}

function projectHip(pose,side){
  const hip=pose[`${side}UpperLeg`];if(!hip)return;
  const flex=Math.max(0,hip.x);
  const t=clamp((flex-85)/35,0,1);
  const rot=lerp(45,28,t),abd=lerp(45,30,t);
  hip.y=clamp(hip.y,-rot,rot);hip.z=clamp(hip.z,-abd,abd);
}

function projectKnee(pose,side){
  const knee=pose[`${side}LowerLeg`];if(!knee)return;
  const flex=clamp(knee.x,0,135);
  // Tibial rotation is almost locked in extension and progressively available
  // as the knee flexes. Literature reports roughly 10deg IR near extension and
  // ~25deg IR / ~40deg ER in flexion; a symmetric model-space cap is safer here.
  const axial=lerp(8,32,(flex-5)/85);
  knee.y=clamp(knee.y,-axial,axial);
  knee.z=clamp(knee.z,-6,6);
}

function projectWrist(pose,side){
  const hand=pose[`${side}Hand`];if(!hand)return;
  const t=clamp((Math.abs(hand.x)-45)/40,0,1);
  const deviation=lerp(50,28,t);
  hand.z=clamp(hand.z,-deviation,deviation);
}

function projectFinger(pose,side,finger){
  const left=side==='left',profile=FINGER_FLEX[finger];
  const mcp=pose[`${side}${finger}Proximal`],pip=pose[`${side}${finger}Intermediate`],dip=pose[`${side}${finger}Distal`];
  if(!mcp||!pip||!dip)return;
  const mcpFlex=flexMagnitude(mcp.y,left);
  const spread=lerp(profile.spread,profile.spread*.22,mcpFlex/90);
  mcp.x=clamp(mcp.x,-spread,spread);mcp.z=clamp(mcp.z,-spread,spread);
  pip.x=clamp(pip.x,-3,3);pip.z=clamp(pip.z,-3,3);
  dip.x=clamp(dip.x,-3,3);dip.z=clamp(dip.z,-3,3);
  pip.y=clampMirroredFlex(pip.y,left,5,profile.pip);
  // DIP can flex independently, but full DIP curl without accompanying PIP
  // flexion is restricted to avoid non-human hooked-finger poses.
  const pipFlex=flexMagnitude(pip.y,left);
  const dipDynamic=Math.min(profile.dip,45+0.55*pipFlex);
  dip.y=clampMirroredFlex(dip.y,left,5,dipDynamic);
}

function projectThumb(pose,side){
  const left=side==='left';
  const cmc=pose[`${side}ThumbMetacarpal`],mcp=pose[`${side}ThumbProximal`],ip=pose[`${side}ThumbDistal`];if(!cmc||!mcp||!ip)return;
  cmc.y=clampMirroredFlex(cmc.y,left,25,71);
  mcp.y=clampMirroredFlex(mcp.y,left,15,70);
  ip.y=clampMirroredFlex(ip.y,left,15,90);
  // Opposition is a coupled saddle-joint motion; high CMC flexion/abduction
  // permits only a modest axial component rather than arbitrary 3-axis twist.
  const opposition=clamp(flexMagnitude(cmc.y,left)/71,0,1);
  const twist=lerp(18,30,opposition);
  cmc.z=clamp(cmc.z,-twist,twist);
}

export function projectAnatomicalPose(inputPose={}){
  const pose=copyPose(inputPose);
  for(const [name,p] of Object.entries(pose))pose[name]=hardClampBone(name,p);

  // Spine/head are serial chains: clinical ROM applies to the combined chain,
  // not independently to every VRM bone.
  limitCombined(pose,['spine','chest','upperChest'],'x',-30,60);
  limitCombined(pose,['spine','chest','upperChest'],'y',-25,25);
  limitCombined(pose,['spine','chest','upperChest'],'z',-30,30);
  limitCombined(pose,['neck','head'],'x',-60,60);
  limitCombined(pose,['neck','head'],'y',-75,75);
  limitCombined(pose,['neck','head'],'z',-45,45);

  for(const side of ['left','right']){
    projectShoulderComplex(pose,side);projectHip(pose,side);projectKnee(pose,side);projectWrist(pose,side);projectThumb(pose,side);
    for(const finger of ['Index','Middle','Ring','Little'])projectFinger(pose,side,finger);
  }

  return pose;
}

export function anatomicalRomState(){return {active:true,solver:'anatomical-rom-v2',controlledBones:ANATOMICAL_CONTROLLED_BONES.length,couplings:['spine-chain','head-neck-chain','scapulohumeral','elevation-rotation','hip-flexion-rotation','knee-flexion-tibial-rotation','wrist-flexion-deviation','finger-mcp-spread','finger-pip-dip','thumb-opposition']};}
