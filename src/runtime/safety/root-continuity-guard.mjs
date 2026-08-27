import * as THREE from 'three';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));
const vec=(v)=>v?.clone?.()||new THREE.Vector3(v?.x||0,v?.y||0,v?.z||0);

export class RootContinuityGuard{
  constructor({modelHeight=1.6,maxWalkSpeed=null,maxFrameDistance=null,tolerance=1e-4}={}){
    this.h=Math.max(.6,Number(modelHeight)||1.6);
    this.maxWalkSpeed=Math.max(.2,Number(maxWalkSpeed)||this.h*.80);
    this.maxFrameDistance=Math.max(.005,Number(maxFrameDistance)||this.h*.025);
    this.tolerance=Math.max(1e-6,Number(tolerance)||1e-4);
    this.lastRendered=null;this.corrections=0;this.maxRejectedDistance=0;this.lastCorrection=0;this.lastApproved=new THREE.Vector3();
  }
  reset(position){this.lastRendered=vec(position);this.lastApproved.set(0,0,0);this.lastCorrection=0;return this.lastRendered.clone();}
  apply(dt,position,{active=false,approvedDelta=null}={}){
    if(!position)return {corrected:false,position:null};
    if(!this.lastRendered)this.reset(position);
    if(!active){this.lastRendered.copy(position);this.lastApproved.set(0,0,0);this.lastCorrection=0;return {corrected:false,position:vec(position),rejectedDistance:0,approvedDistance:0};}
    const h=clamp(Number(dt)||0,1/240,.05),approved=vec(approvedDelta);approved.y=0;
    const maxAllowed=Math.min(this.maxFrameDistance,this.maxWalkSpeed*h);
    if(approved.length()>maxAllowed)approved.setLength(maxAllowed);
    const expected=this.lastRendered.clone();expected.x+=approved.x;expected.z+=approved.z;expected.y=position.y;
    const error=new THREE.Vector3(position.x-expected.x,0,position.z-expected.z),rejected=error.length();
    let corrected=false;if(rejected>this.tolerance){position.x=expected.x;position.z=expected.z;corrected=true;this.corrections+=1;this.maxRejectedDistance=Math.max(this.maxRejectedDistance,rejected);}
    this.lastCorrection=rejected;this.lastApproved.copy(approved);this.lastRendered.set(position.x,position.y,position.z);
    return {corrected,position:vec(position),rejectedDistance:rejected,approvedDistance:approved.length(),expected};
  }
  state(){return {solver:'root-continuity-guard-v1',corrections:this.corrections,maxRejectedDistance:this.maxRejectedDistance,lastCorrection:this.lastCorrection,maxWalkSpeed:this.maxWalkSpeed,maxFrameDistance:this.maxFrameDistance,lastApproved:{x:this.lastApproved.x,y:this.lastApproved.y,z:this.lastApproved.z}};}
}
