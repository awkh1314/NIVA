import * as THREE from 'three';
import { createTwoBoneIKScratch, solveTwoBoneIK } from './two-bone-ik.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/**
 * NIVA Foot IK, modeled after mature FootIK pipelines:
 * animation -> stance/contact target -> analytical two-bone solve -> sole alignment.
 */
export class NivaFootIKSystem {
  constructor({vrm,getBone,frame,modelHeight}){
    this.vrm=vrm;this.getBone=getBone;this.frame=frame;this.h=modelHeight;
    this.scratch={left:createTwoBoneIKScratch(),right:createTwoBoneIKScratch()};
    this.chains={left:null,right:null};
    this.lastGroundNormal=new THREE.Vector3(0,1,0);
  }
  chain(side){
    if(this.chains[side])return this.chains[side];
    const root=this.getBone(`${side}UpperLeg`),mid=this.getBone(`${side}LowerLeg`),end=this.getBone(`${side}Foot`);
    if(!root||!mid||!end)return null;
    this.chains[side]={root,mid,end,lastPole:new THREE.Vector3(),hasLastPole:false};
    return this.chains[side];
  }
  solve(side,target,groundNormal,weight=1,action='idle'){
    const chain=this.chain(side);if(!chain||!target)return false;
    const {forward,right}=this.frame.basis();
    const sign=side==='left'?-1:1;
    const pole=forward.clone().addScaledVector(right,sign*.05).normalize();
    const maxBend=action==='crouch'?THREE.MathUtils.degToRad(130):action==='run'?THREE.MathUtils.degToRad(118):THREE.MathUtils.degToRad(105);
    solveTwoBoneIK(chain,target,clamp(weight,0,1),{
      scratch:this.scratch[side],
      poleDirection:pole,
      preferredForward:forward,
      planeNormal:right,
      minBend:THREE.MathUtils.degToRad(3),
      maxBend,
    });
    this.alignSole(side,target,groundNormal,action==='crouch'?0.95:0.72);
    return true;
  }
  alignSole(side,anchor,normal,weight=.7){
    const foot=this.getBone(`${side}Foot`),toes=this.getBone(`${side}Toes`);if(!foot||!toes)return;
    this.vrm.scene.updateMatrixWorld(true);
    const fp=foot.getWorldPosition(new THREE.Vector3()),tp=toes.getWorldPosition(new THREE.Vector3());
    const current=tp.clone().sub(fp);const len=current.length();if(len<1e-5)return;
    const up=(normal?.clone?.()||this.lastGroundNormal.clone()).normalize();this.lastGroundNormal.copy(up);
    const planar=current.clone().addScaledVector(up,-current.dot(up));
    if(planar.lengthSq()<1e-8)planar.copy(this.frame.forward());
    planar.normalize();
    const targetToe=fp.clone().addScaledVector(planar,len);
    // keep the toe on the same ground plane rather than forcing world-Y on slopes
    if(anchor){const delta=targetToe.clone().sub(anchor);targetToe.addScaledVector(up,-delta.dot(up));}
    this.rotateToward(foot,toes,targetToe,weight);
  }
  rotateToward(bone,end,target,weight){
    if(!bone?.parent||!end)return;
    this.vrm.scene.updateMatrixWorld(true);
    const joint=bone.getWorldPosition(new THREE.Vector3());
    const from=end.getWorldPosition(new THREE.Vector3()).sub(joint);const to=target.clone().sub(joint);
    if(from.lengthSq()<1e-8||to.lengthSq()<1e-8)return;from.normalize();to.normalize();
    const delta=new THREE.Quaternion().setFromUnitVectors(from,to);delta.slerp(new THREE.Quaternion(),1-clamp(weight,0,1));
    const world=bone.getWorldQuaternion(new THREE.Quaternion());const desired=delta.multiply(world);
    const parentWorld=bone.parent.getWorldQuaternion(new THREE.Quaternion());bone.quaternion.copy(parentWorld.invert().multiply(desired));
    bone.updateMatrixWorld(true);
  }
  state(){return {solver:'analytical-two-bone-foot-ik-v1'};}
}
