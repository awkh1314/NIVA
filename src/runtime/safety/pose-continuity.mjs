import * as THREE from 'three';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));

export function dampedPoseQuaternion(current,target,dt,{lambda=14,maxDegreesPerSecond=220}={}){
  const h=clamp(Number(dt)||0,0,.05);
  const out=current?.clone?.()||new THREE.Quaternion();
  if(!target||h<=0)return out;
  const goal=target.clone?.()||new THREE.Quaternion(target.x||0,target.y||0,target.z||0,target.w??1);
  const blend=1-Math.exp(-Math.max(.01,Number(lambda)||14)*h);
  const blended=out.clone().slerp(goal,blend);
  const maxStep=THREE.MathUtils.degToRad(Math.max(1,Number(maxDegreesPerSecond)||220))*h;
  const angle=out.angleTo(blended);
  if(angle>maxStep&&angle>1e-8)out.slerp(blended,maxStep/angle);else out.copy(blended);
  return out.normalize();
}

export class PoseContinuityGuard{
  constructor({lambda=14,maxDegreesPerSecond=220}={}){this.lambda=lambda;this.maxDegreesPerSecond=maxDegreesPerSecond;this.maxObservedStep=0;this.corrections=0;}
  apply(node,target,dt){if(!node?.quaternion||!target)return false;const before=node.quaternion.clone(),after=dampedPoseQuaternion(before,target,dt,{lambda:this.lambda,maxDegreesPerSecond:this.maxDegreesPerSecond}),rawAngle=before.angleTo(target),applied=before.angleTo(after);this.maxObservedStep=Math.max(this.maxObservedStep,applied);if(applied+1e-7<rawAngle)this.corrections++;node.quaternion.copy(after);return true;}
  state(){return{solver:'pose-continuity-guard-v1',lambda:this.lambda,maxDegreesPerSecond:this.maxDegreesPerSecond,corrections:this.corrections,maxObservedStepDeg:THREE.MathUtils.radToDeg(this.maxObservedStep)};}
}
