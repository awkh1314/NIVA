import * as THREE from 'three';
import { NIVA_RUNTIME_JOINT_LIMITS, anatomicalLimitForBone, anatomicalRomState, projectAnatomicalPose } from './anatomical-rom-v2.mjs';

export { NIVA_RUNTIME_JOINT_LIMITS } from './anatomical-rom-v2.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
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

export class JointRotationGuard{
  constructor({getBone,baseQuats}={}){
    this.getBone=getBone;this.baseQuats=baseQuats;this.last=new Map();this.corrections=0;this.lastCorrected=[];
    this._inv=new THREE.Quaternion();this._rel=new THREE.Quaternion();this._euler=new THREE.Euler(0,0,0,'XYZ');this._safe=new THREE.Quaternion();
  }
  reset(){this.last.clear();this.corrections=0;this.lastCorrected=[];}
  apply(dt){
    const targetPose={};
    const entries=[];
    for(const [name,base] of this.baseQuats?.entries?.()||[]){
      const limit=anatomicalLimitForBone(name),node=this.getBone?.(name);if(!limit||!node||!base)continue;
      this._inv.copy(base).invert();this._rel.copy(this._inv).multiply(node.quaternion).normalize();
      this._euler.setFromQuaternion(this._rel,'XYZ');
      targetPose[name]={x:deg(this._euler.x),y:deg(this._euler.y),z:deg(this._euler.z)};
      entries.push([name,base,node,limit]);
    }

    // Project the WHOLE pose before mutating any bone. Coupled anatomy therefore
    // sees one coherent target state instead of a sequence of partially-clamped
    // joints. This is the core Anatomical ROM V2 invariant.
    const anatomicalPose=projectAnatomicalPose(targetPose);
    const corrected=[];
    for(const [name,base,node,limit] of entries){
      const target=targetPose[name],projected=anatomicalPose[name]||target;
      const safe=limitEulerStep(projected,this.last.get(name),limit,dt);
      const changed=Math.abs(safe.x-target.x)>1e-3||Math.abs(safe.y-target.y)>1e-3||Math.abs(safe.z-target.z)>1e-3;
      if(changed){
        this._safe.setFromEuler(new THREE.Euler(rad(safe.x),rad(safe.y),rad(safe.z),'XYZ'));
        node.quaternion.copy(base).multiply(this._safe).normalize();corrected.push(name);this.corrections++;
      }
      this.last.set(name,safe);
    }
    this.lastCorrected=corrected;return corrected;
  }
  state(){return {active:true,solver:'final-joint-rotation-guard-v2',anatomy:anatomicalRomState(),corrections:this.corrections,lastCorrected:[...this.lastCorrected]};}
}
