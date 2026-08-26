import * as THREE from 'three';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const axis=(min,max)=>Object.freeze({min,max});
const joint=(x,y,z,speed=260)=>Object.freeze({x,y,z,speed});

// Runtime deltas are measured from NIVA's calibrated relaxed pose (baseQuats),
// not from raw VRM bind-pose coordinates. These are final safety envelopes,
// intentionally broader than normal motion but narrower than pathological twists.
export const NIVA_RUNTIME_JOINT_LIMITS=Object.freeze({
  hips:joint(axis(-18,22),axis(-25,25),axis(-16,16),150),
  spine:joint(axis(-14,18),axis(-20,20),axis(-16,16),135),
  chest:joint(axis(-16,20),axis(-22,22),axis(-18,18),145),
  upperChest:joint(axis(-14,16),axis(-18,18),axis(-15,15),145),
  neck:joint(axis(-28,32),axis(-42,42),axis(-28,28),210),
  head:joint(axis(-24,28),axis(-38,38),axis(-25,25),230),
  leftShoulder:joint(axis(-20,20),axis(-22,22),axis(-30,30),220),
  rightShoulder:joint(axis(-20,20),axis(-22,22),axis(-30,30),220),
  leftUpperArm:joint(axis(-70,105),axis(-75,75),axis(-125,125),300),
  rightUpperArm:joint(axis(-70,105),axis(-75,75),axis(-125,125),300),
  leftLowerArm:joint(axis(-20,20),axis(-125,18),axis(-20,20),340),
  rightLowerArm:joint(axis(-20,20),axis(-18,125),axis(-20,20),340),
  leftHand:joint(axis(-60,60),axis(-35,35),axis(-45,45),360),
  rightHand:joint(axis(-60,60),axis(-35,35),axis(-45,45),360),
  leftUpperLeg:joint(axis(-45,105),axis(-45,45),axis(-48,48),260),
  rightUpperLeg:joint(axis(-45,105),axis(-45,45),axis(-48,48),260),
  leftLowerLeg:joint(axis(-8,125),axis(-15,15),axis(-15,15),300),
  rightLowerLeg:joint(axis(-8,125),axis(-15,15),axis(-15,15),300),
  leftFoot:joint(axis(-35,45),axis(-22,22),axis(-28,28),260),
  rightFoot:joint(axis(-35,45),axis(-22,22),axis(-28,28),260),
  leftToes:joint(axis(-22,45),axis(-12,12),axis(-12,12),300),
  rightToes:joint(axis(-22,45),axis(-12,12),axis(-12,12),300),
});

const fingerNames=[];
for(const side of ['left','right']){
  for(const f of ['Thumb','Index','Middle','Ring','Little']){
    for(const s of f==='Thumb'?['Metacarpal','Proximal','Distal']:['Proximal','Intermediate','Distal']) fingerNames.push(`${side}${f}${s}`);
  }
}
for(const name of fingerNames){
  if(!NIVA_RUNTIME_JOINT_LIMITS[name]){
    // Object.freeze above is shallow for the map itself, so finger limits are
    // supplied through the fallback below rather than mutating the frozen map.
  }
}
const FINGER_LIMIT=joint(axis(-35,35),axis(-110,110),axis(-110,110),480);

const rad=d=>THREE.MathUtils.degToRad(d);
const deg=r=>THREE.MathUtils.radToDeg(r);

export function softClampAxis(value,min,max,softFraction=.90){
  const v=Number.isFinite(value)?value:0;
  const f=clamp(softFraction,.5,.98);
  const loSoft=min<0?min*f:min+(max-min)*(1-f);
  const hiSoft=max>0?max*f:max-(max-min)*(1-f);
  if(v<loSoft){
    const span=Math.max(1e-6,loSoft-min);
    return Math.max(min,loSoft-span*Math.tanh((loSoft-v)/span));
  }
  if(v>hiSoft){
    const span=Math.max(1e-6,max-hiSoft);
    return Math.min(max,hiSoft+span*Math.tanh((v-hiSoft)/span));
  }
  return clamp(v,min,max);
}

export function limitEulerStep(target,last,limit,dt){
  const h=clamp(Number(dt)||0,1/240,.05);
  const maxStep=Math.max(0.1,limit.speed*h);
  const out={};
  for(const key of ['x','y','z']){
    const a=limit[key];
    const bounded=softClampAxis(target[key]||0,a.min,a.max);
    const prev=Number.isFinite(last?.[key])?last[key]:bounded;
    out[key]=clamp(prev+clamp(bounded-prev,-maxStep,maxStep),a.min,a.max);
  }
  return out;
}

function limitFor(name){return NIVA_RUNTIME_JOINT_LIMITS[name]||(fingerNames.includes(name)?FINGER_LIMIT:null);}

export class JointRotationGuard{
  constructor({getBone,baseQuats}={}){
    this.getBone=getBone;this.baseQuats=baseQuats;this.last=new Map();this.corrections=0;this.lastCorrected=[];
    this._inv=new THREE.Quaternion();this._rel=new THREE.Quaternion();this._euler=new THREE.Euler(0,0,0,'XYZ');this._safe=new THREE.Quaternion();
  }
  reset(){this.last.clear();this.corrections=0;this.lastCorrected=[];}
  apply(dt){
    const corrected=[];
    for(const [name,base] of this.baseQuats?.entries?.()||[]){
      const limit=limitFor(name),node=this.getBone?.(name);if(!limit||!node||!base)continue;
      this._inv.copy(base).invert();this._rel.copy(this._inv).multiply(node.quaternion).normalize();
      this._euler.setFromQuaternion(this._rel,'XYZ');
      const target={x:deg(this._euler.x),y:deg(this._euler.y),z:deg(this._euler.z)};
      const safe=limitEulerStep(target,this.last.get(name),limit,dt);
      const changed=Math.abs(safe.x-target.x)>1e-3||Math.abs(safe.y-target.y)>1e-3||Math.abs(safe.z-target.z)>1e-3;
      if(changed){
        this._safe.setFromEuler(new THREE.Euler(rad(safe.x),rad(safe.y),rad(safe.z),'XYZ'));
        node.quaternion.copy(base).multiply(this._safe).normalize();corrected.push(name);this.corrections++;
      }
      this.last.set(name,safe);
    }
    this.lastCorrected=corrected;return corrected;
  }
  state(){return {active:true,solver:'final-joint-rotation-guard-v1',corrections:this.corrections,lastCorrected:[...this.lastCorrected]};}
}
