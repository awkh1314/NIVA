import * as THREE from 'three';
import { createTwoBoneIKScratch, solveTwoBoneIK } from './two-bone-ik.mjs';
import { NivaFootIKSystem } from './foot-ik-system.mjs';
import { SelfCollisionConstraint } from './self-collision-constraint.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/**
 * Sole owner of post-animation limb IK.
 * Analytical two-bone IK replaces the old iterative CCD solver.
 * Physics owns root translation; Facing owns root yaw; this module owns limb correction only.
 */
export class NivaIKSystem {
  constructor({vrm,getBone,frame,modelHeight}){
    this.vrm=vrm;this.getBone=getBone;this.frame=frame;this.modelHeight=modelHeight;
    this.enabled=true;this.footEnabled=true;this.actionEnabled=true;this.strength=.9;this.lastAction='idle';
    this.footIK=new NivaFootIKSystem({vrm,getBone,frame,modelHeight});
    this.collision=new SelfCollisionConstraint({vrm,getBone,modelHeight});
    this.armScratch={left:createTwoBoneIKScratch(),right:createTwoBoneIKScratch()};
    this.armChains={left:null,right:null};
    this.lastRejectedAction='';
  }

  configure({enabled=true,footEnabled=true,actionEnabled=true,strength=.9}={}){
    this.enabled=enabled;this.footEnabled=footEnabled;this.actionEnabled=actionEnabled;this.strength=clamp(strength,0,1);
  }

  armChain(side){
    if(this.armChains[side])return this.armChains[side];
    const root=this.getBone(`${side}UpperArm`),mid=this.getBone(`${side}LowerArm`),end=this.getBone(`${side}Hand`);
    if(!root||!mid||!end)return null;
    return this.armChains[side]={root,mid,end,lastPole:new THREE.Vector3(),hasLastPole:false};
  }

  solveArm(side,target,weight=1,poleWorld=null){
    const chain=this.armChain(side);if(!chain||!target)return false;
    const {right,forward,up}=this.frame.basis();const sign=side==='left'?-1:1;
    const rootPos=chain.root.getWorldPosition(new THREE.Vector3());
    const poleDirection=poleWorld
      ? poleWorld.clone().sub(rootPos).normalize()
      : right.clone().multiplyScalar(sign).addScaledVector(forward,.15).addScaledVector(up,-.08).normalize();
    return solveTwoBoneIK(chain,target,clamp(weight,0,1),{
      scratch:this.armScratch[side],poleDirection,
      minBend:THREE.MathUtils.degToRad(7),maxBend:THREE.MathUtils.degToRad(150),
    });
  }

  armLength(side){
    const c=this.armChain(side);if(!c)return this.modelHeight*.32;
    this.vrm.scene.updateMatrixWorld(true);
    const a=c.root.getWorldPosition(new THREE.Vector3()),b=c.mid.getWorldPosition(new THREE.Vector3()),d=c.end.getWorldPosition(new THREE.Vector3());
    return Math.max(this.modelHeight*.22,a.distanceTo(b)+b.distanceTo(d));
  }

  solveLocomotionArms(action,phase){
    const bones=['leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand'];
    const result=this.collision.attempt({action,bones,apply:(scale)=>{
      const {right,up,forward}=this.frame.basis();const down=up.clone().multiplyScalar(-1);const run=action==='run';const wave=Math.cos(phase*Math.PI*2);
      for(const side of ['left','right']){
        const chain=this.armChain(side);if(!chain)continue;
        const sign=side==='left'?-1:1;const gait=sign*wave;const len=this.armLength(side);const root=chain.root.getWorldPosition(new THREE.Vector3());
        const target=root.clone().addScaledVector(down,len*(run?.55:.78)).addScaledVector(forward,gait*len*(run?.36:.20)).addScaledVector(right,sign*len*.08);
        const pole=root.clone().addScaledVector(right,sign*len*.72).addScaledVector(forward,gait*len*.10).addScaledVector(down,len*(run?.08:.18));
        this.solveArm(side,target,(run?.92:.72)*scale,pole);
      }
    }});
    if(!result.ok)this.lastRejectedAction=action;
  }

  solveWavePose(phase){
    const bones=['rightUpperArm','rightLowerArm','rightHand'];
    const result=this.collision.attempt({action:'wave',bones,apply:(scale)=>{
      const chain=this.armChain('right'),head=this.getBone('head');if(!chain||!head)return;
      const {right,up,forward}=this.frame.basis();
      const enter=clamp(phase/.17,0,1),leave=clamp((1-phase)/.18,0,1),blend=Math.min(enter,leave);if(blend<=.01)return;
      const headPos=head.getWorldPosition(new THREE.Vector3());const sway=Math.sin(clamp((phase-.24)/.52,0,1)*Math.PI*5)*this.modelHeight*.018;
      const target=headPos.clone().addScaledVector(right,this.modelHeight*.255+sway).addScaledVector(up,this.modelHeight*.015).addScaledVector(forward,this.modelHeight*.055);
      const root=chain.root.getWorldPosition(new THREE.Vector3());const pole=root.clone().addScaledVector(right,this.modelHeight*.30).addScaledVector(forward,this.modelHeight*.10).addScaledVector(up,this.modelHeight*.03);
      this.solveArm('right',target,.90*blend*scale,pole);
    }});
    if(!result.ok)this.lastRejectedAction='wave';
  }

  solveCrouchHandsToHead(weight=.9){
    const bones=['leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand'];
    const result=this.collision.attempt({action:'crouch',bones,apply:(scale)=>{
      const head=this.getBone('head');if(!head)return;this.vrm.scene.updateMatrixWorld(true);
      const {right,up,forward}=this.frame.basis();const hp=head.getWorldPosition(new THREE.Vector3());
      for(const side of ['left','right']){
        const chain=this.armChain(side);if(!chain)continue;const sign=side==='left'?-1:1;
        const target=hp.clone().addScaledVector(right,sign*this.modelHeight*.082).addScaledVector(up,this.modelHeight*.018).addScaledVector(forward,-this.modelHeight*.048);
        const pole=chain.root.getWorldPosition(new THREE.Vector3()).addScaledVector(right,sign*this.modelHeight*.34).addScaledVector(up,this.modelHeight*.05);
        this.solveArm(side,target,weight*scale,pole);
      }
    }});
    if(!result.ok)this.lastRejectedAction='crouch-hands';
  }

  solveHandsToKnees(weight=.8){
    const bones=['leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand'];
    const result=this.collision.attempt({action:'recovery',bones,apply:(scale)=>{
      const {right,forward,up}=this.frame.basis();
      for(const side of ['left','right']){
        const knee=this.getBone(`${side}LowerLeg`),chain=this.armChain(side);if(!knee||!chain)continue;const sign=side==='left'?-1:1;
        const target=knee.getWorldPosition(new THREE.Vector3()).addScaledVector(right,sign*this.modelHeight*.025).addScaledVector(forward,this.modelHeight*.025).addScaledVector(up,this.modelHeight*.018);
        const pole=chain.root.getWorldPosition(new THREE.Vector3()).addScaledVector(right,sign*this.modelHeight*.22).addScaledVector(forward,this.modelHeight*.10).addScaledVector(up,-this.modelHeight*.03);
        this.solveArm(side,target,weight*scale,pole);
      }
    }});
    if(!result.ok)this.lastRejectedAction='recovery-hands';
  }

  solveFeet(plan,action){
    if(!this.footEnabled||!plan.footAnchors)return;
    const bones=['leftUpperLeg','leftLowerLeg','leftFoot','leftToes','rightUpperLeg','rightLowerLeg','rightFoot','rightToes'];
    const result=this.collision.attempt({action,bones,apply:(scale)=>{
      for(const side of ['left','right']){
        const anchor=plan.footAnchors[side];if(!anchor||!plan.stance?.[side])continue;
        this.footIK.solve(side,anchor,plan.groundNormal,this.strength*scale,action);
      }
    }});
    if(!result.ok)this.lastRejectedAction=`${action}-feet`;
  }

  solve(plan={}){
    if(!this.enabled||!this.vrm)return;
    const action=plan.action||'idle',phase=plan.phase||0,crouchAmount=clamp(plan.crouchAmount||0,0,1);
    this.lastAction=action;
    this.solveFeet(plan,action);
    if(!this.actionEnabled)return;
    if(action==='walk'||action==='run')this.solveLocomotionArms(action,phase);
    if(action==='wave')this.solveWavePose(phase);
    if(action==='crouch')this.solveCrouchHandsToHead(.90*crouchAmount);
    if(action==='recovery')this.solveHandsToKnees(.84);
  }

  recalibrateCollision(){this.collision.calibrate();}

  state(){
    return {
      owner:'normalized humanoid limb IK',solver:'analytical-two-bone+foot-contact+self-collision-v2',
      footEnabled:this.footEnabled,actionEnabled:this.actionEnabled,lastAction:this.lastAction,lastRejectedAction:this.lastRejectedAction,
      collision:this.collision.state(),foot:this.footIK.state(),
    };
  }
}
