import * as THREE from 'three';
import {
  calibrateCollisionThresholds,
  detectAnatomicalCollisions,
} from '../../../runtime/niva-vrm-collision-guard.mjs';

const POINT_BONES = Object.freeze([
  'hips','upperChest','head',
  'leftUpperArm','leftLowerArm','leftHand',
  'rightUpperArm','rightLowerArm','rightHand',
  'leftUpperLeg','leftLowerLeg','leftFoot','leftToes',
  'rightUpperLeg','rightLowerLeg','rightFoot','rightToes',
]);

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function quatAngleDeg(a,b){
  const d=Math.min(1,Math.abs(a.dot(b)));
  return THREE.MathUtils.radToDeg(2*Math.acos(d));
}

/**
 * Predictive final-pose collision constraint.
 *
 * This is deliberately NOT a rollback guard. The unsafe pose is never rendered.
 * Each frame we treat the post-animation/post-IK pose as a desired target, sweep
 * the continuous quaternion path from the last accepted pose to that target,
 * find the first unsafe time-of-impact, and project the pose to the largest safe
 * fraction just before contact.
 */
export class SelfCollisionProjector {
  constructor({vrm,getBone,baseQuats,getHeight}={}){
    this.vrm=vrm;
    this.getBone=getBone;
    this.baseQuats=baseQuats;
    this.getHeight=getHeight;
    this.thresholds=null;
    this.safePose=null;
    this.lastFraction=1;
    this.lastCollisions=[];
    this.constrainedFrames=0;
    this.sweptSamples=0;
    this._point=new THREE.Vector3();
  }

  capturePose(){
    const pose=new Map();
    for(const [name] of this.baseQuats?.entries?.()||[]){
      const node=this.getBone?.(name);
      if(node)pose.set(name,node.quaternion.clone().normalize());
    }
    return pose;
  }

  applyPose(pose){
    for(const [name,q] of pose?.entries?.()||[]){
      const node=this.getBone?.(name);
      if(node)node.quaternion.copy(q);
    }
    this.vrm?.scene?.updateMatrixWorld?.(true);
  }

  applyBlend(from,to,t){
    const alpha=clamp(t,0,1);
    for(const [name,qa] of from?.entries?.()||[]){
      const node=this.getBone?.(name),qb=to?.get?.(name);
      if(!node||!qb)continue;
      node.quaternion.copy(qa).slerp(qb,alpha).normalize();
    }
    this.vrm?.scene?.updateMatrixWorld?.(true);
  }

  points(){
    this.vrm?.scene?.updateMatrixWorld?.(true);
    const out={};
    for(const name of POINT_BONES){
      const node=this.getBone?.(name);
      if(!node)continue;
      node.getWorldPosition(this._point);
      out[name]={x:this._point.x,y:this._point.y,z:this._point.z};
    }
    return out;
  }

  height(){return Math.max(.1,Number(this.getHeight?.())||1);}

  calibrate(){
    const points=this.points();
    this.thresholds=calibrateCollisionThresholds(points,this.height());
    this.safePose=this.capturePose();
    this.lastFraction=1;
    this.lastCollisions=[];
    return {pairThresholds:Object.keys(this.thresholds).length};
  }

  collisions(){
    if(!this.thresholds)this.calibrate();
    return detectAnatomicalCollisions(this.points(),this.height(),this.thresholds);
  }

  dynamicSampleCount(from,to){
    let maxAngle=0;
    for(const [name,qa] of from?.entries?.()||[]){
      const qb=to?.get?.(name);if(!qb)continue;
      maxAngle=Math.max(maxAngle,quatAngleDeg(qa,qb));
    }
    // About one probe per 5 degrees, bounded for predictable realtime cost.
    if(maxAngle<.25)return 1;
    return clamp(Math.ceil(maxAngle/5),2,24);
  }

  project(){
    if(!this.safePose){this.calibrate();return {safe:true,fraction:1,collisions:[]};}
    const target=this.capturePose();
    const from=this.safePose;
    const samples=this.dynamicSampleCount(from,target);
    this.sweptSamples+=samples;

    let safeT=0;
    let hitT=null;
    let hit=[];

    // Continuous swept-pose test. Candidate poses exist only inside this call,
    // before render, so no penetrating frame is ever presented to the user.
    for(let i=1;i<=samples;i++){
      const t=i/samples;
      this.applyBlend(from,target,t);
      const collisions=this.collisions();
      if(collisions.length){hitT=t;hit=collisions;break;}
      safeT=t;
    }

    if(hitT===null){
      this.applyPose(target);
      this.safePose=target;
      this.lastFraction=1;
      this.lastCollisions=[];
      return {safe:true,fraction:1,collisions:[]};
    }

    // Refine the exact contact boundary. Six iterations resolve a 1/64 slice
    // of the coarse interval while keeping the per-frame budget deterministic.
    let lo=safeT,hi=hitT;
    for(let i=0;i<6;i++){
      const mid=(lo+hi)*.5;
      this.applyBlend(from,target,mid);
      const collisions=this.collisions();
      if(collisions.length){hi=mid;hit=collisions;}else lo=mid;
    }

    // Maintain a tiny temporal clearance instead of sitting numerically inside
    // the collision threshold due floating point noise.
    const epsilonT=Math.min(.004,1/(samples*128));
    const accepted=Math.max(0,lo-epsilonT);
    this.applyBlend(from,target,accepted);
    const acceptedPose=this.capturePose();
    this.safePose=acceptedPose;
    this.lastFraction=accepted;
    this.lastCollisions=hit;
    this.constrainedFrames++;
    return {safe:false,fraction:accepted,collisions:hit};
  }

  state(){return {
    active:true,
    solver:'predictive-self-collision-projector-v1',
    mode:'continuous-pose-projection-no-rollback',
    fraction:this.lastFraction,
    constrainedFrames:this.constrainedFrames,
    sweptSamples:this.sweptSamples,
    lastCollisions:this.lastCollisions.map(c=>c.id),
  };}
}
