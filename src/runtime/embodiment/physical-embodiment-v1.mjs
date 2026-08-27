import * as THREE from 'three';
import { ContactGaitController } from '../physics/contact-gait-v3.mjs';
import { FootDrivenWalkPlanner } from '../physics/foot-driven-walk.mjs';
import { SINGLE_STEP_DURATION } from '../physics/single-step-march.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));
const smooth=(t)=>{const x=clamp(t,0,1);return x*x*(3-2*x);};

export class PhysicalEmbodimentController{
  constructor({world,getVrm,getBodyPhysics,getActionState,playClip,stopAction,faceDirection,setActionPhase,walkSpeed=.48,stepLength=.68,modelHeight=1.6}={}){
    this.world=world;this.getVrm=getVrm;this.getBodyPhysics=getBodyPhysics;this.getActionState=getActionState;this.playClip=playClip;this.stopAction=stopAction;this.faceDirection=faceDirection;this.setActionPhase=setActionPhase;this.walkSpeed=walkSpeed;this.stepLength=Math.max(.18,Number(stepLength)||.68);this.modelHeight=Math.max(.6,Number(modelHeight)||1.6);
    this.contactCycle=new ContactGaitController();this.footWalk=new FootDrivenWalkPlanner({modelHeight:this.modelHeight,nominalSpeed:this.walkSpeed});this.gaitPlan=null;
    this.task='idle';this.taskTime=0;this.taskStarted=false;this.rootOverride=false;this._startPos=new THREE.Vector3();this._startQuat=new THREE.Quaternion();this._startYaw=0;this._driveDir=new THREE.Vector3(0,0,1);this._marchDir=new THREE.Vector3(0,0,1);this._marchSide='left';
  }
  currentPhase(){const s=this.getActionState?.()||{};const d=Math.max(.01,s.duration||1);return (((s.time||0)%d)/d+1)%1;}
  resolveLanding(physics){return(start,desired,meta)=>physics?.resolveFootLanding?.(start,desired,meta)||desired;}
  drive(dt,direction,speed=this.walkSpeed,action='walk',{continueSteps=true}={}){
    const physics=this.getBodyPhysics?.();if(!physics||!direction)return null;
    const h=clamp(Number(dt)||0,0,.05),target=direction.clone?.()||new THREE.Vector3(direction.x||0,0,direction.z||0);target.y=0;if(target.lengthSq()<1e-8)target.copy(this._driveDir);else target.normalize();
    this._driveDir.copy(target);
    const leftFoot=physics.readFoot?.('left'),rightFoot=physics.readFoot?.('right');
    const plan=this.footWalk.update(h,{direction:target,desiredSpeed:speed,leftFoot,rightFoot,resolveLanding:this.resolveLanding(physics),continueSteps,action});
    const contact=this.contactCycle.update(h,{phase:plan.animationPhase||0,action,moving:plan.active||!plan.settled});plan.contactCycle=contact;
    this.gaitPlan=plan;this.setActionPhase?.(plan.animationPhase||0,action);
    if(plan.rootDelta?.lengthSq?.()>1e-12)physics.moveByDelta?.(h,plan.rootDelta,{maxDelta:plan.maxRootDeltaPerFrame});else physics.holdPosition?.(h);
    const facing=plan.direction||target;this.faceDirection?.(facing,h,action==='run'?6.5:4.8);return plan;
  }
  finishDrive(dt,direction=this._driveDir){
    if(!this.footWalk.active)return this.gaitPlan=this.footWalk.state();
    return this.drive(dt,direction,0,'walk',{continueSteps:false});
  }
  walkSettled(){return !this.footWalk.active&&(this.gaitPlan?.settled??true);}
  idleGait(dt){
    if(this.footWalk.active)return this.gaitPlan;
    const contact=this.contactCycle.update(dt,{action:'idle',moving:false});
    const idle=this.footWalk.state();idle.contactCycle=contact;this.gaitPlan=idle;return idle;
  }
  startSleep(){if(this.task!=='idle'&&this.task!=='sleep')return false;this.task='walk-to-bed';this.taskTime=0;this.taskStarted=false;this.rootOverride=false;this.world?.setBlanket('rest',0);return true;}
  startWalkTo(anchorName='roomCenter'){this.targetAnchor=anchorName;this.task='walk-to-anchor';this.taskTime=0;this.taskStarted=false;this.rootOverride=false;return true;}
  startMarchStep(side='left'){
    if(this.rootOverride)return false;if(this.task!=='idle')this.cancelTask();const physics=this.getBodyPhysics?.();
    this._marchSide=side==='right'?'right':'left';this.task='march-step';this.taskTime=0;this.taskStarted=false;this.rootOverride=false;
    const vrm=this.getVrm?.();if(vrm){this._marchDir.set(0,0,1).applyQuaternion(vrm.scene.quaternion).setY(0);if(this._marchDir.lengthSq()<1e-8)this._marchDir.set(0,0,1);else this._marchDir.normalize();}
    this.footWalk.reset({leftFoot:physics?.readFoot?.('left')||null,rightFoot:physics?.readFoot?.('right')||null});return true;
  }
  cancelTask(){
    if(this.rootOverride)return false;if(this.task!=='idle')this.stopAction?.();this.task='idle';this.taskTime=0;this.taskStarted=false;this.targetAnchor=null;
    if(!this.footWalk.active)this.idleGait(1/60);return true;
  }
  transition(next){this.task=next;this.taskTime=0;this.taskStarted=false;}
  beginTask(){if(this.taskStarted)return;this.taskStarted=true;
    if(this.task==='walk-to-bed'||this.task==='walk-to-anchor')this.playClip?.('walk',{loop:true});
    if(this.task==='march-step')this.playClip?.(this._marchSide==='right'?'marchStepRight':'marchStepLeft',{duration:SINGLE_STEP_DURATION});
    if(this.task==='open-blanket')this.playClip?.('reach',{duration:2});
    if(this.task==='sit-bed')this.playClip?.('sitBed',{duration:1.25});
    if(this.task==='lie-bed')this.playClip?.('lieBed',{duration:1.5});
    if(this.task==='cover-blanket')this.playClip?.('sleepBed',{loop:true});
    if(this.task==='sleep')this.playClip?.('sleepBed',{loop:true});
  }
  walkToward(dt,target,next){
    const vrm=this.getVrm?.(),physics=this.getBodyPhysics?.();if(!vrm||!physics||!target)return;
    const pos=new THREE.Vector3(vrm.scene.position.x,0,vrm.scene.position.z),to=target.clone().setY(0).sub(pos),dist=to.length();
    if(dist<.16){const settled=this.finishDrive(dt,to.lengthSq()>1e-8?to.normalize():this._driveDir);if(settled?.settled){this.stopAction?.();this.transition(next);}return;}
    const dir=to.normalize();this.drive(dt,dir,this.walkSpeed,'walk',{continueSteps:true});
  }
  executeMarchStep(dt){
    const physics=this.getBodyPhysics?.();if(!physics)return null;
    const plan=this.footWalk.update(dt,{direction:this._marchDir,desiredSpeed:this.walkSpeed,leftFoot:physics.readFoot?.('left'),rightFoot:physics.readFoot?.('right'),resolveLanding:this.resolveLanding(physics),continueSteps:false,action:'walk',mode:'single',forcedSide:this._marchSide,forcedStepLength:this.stepLength,forcedDuration:SINGLE_STEP_DURATION});
    this.gaitPlan=plan;this.setActionPhase?.(plan.animationPhase||0,'march');if(plan.rootDelta?.lengthSq?.()>1e-12)physics.moveByDelta?.(dt,plan.rootDelta,{maxDelta:plan.maxRootDeltaPerFrame});else physics.holdPosition?.(dt);this.faceDirection?.(plan.direction||this._marchDir,dt,5.5);
    if(plan.settled&&plan.stepCount>=1){this.stopAction?.();this.task='idle';this.taskTime=0;this.taskStarted=false;}
    return plan;
  }
  captureRoot(){const vrm=this.getVrm?.();if(!vrm)return;this._startPos.copy(vrm.scene.position);this._startQuat.copy(vrm.scene.quaternion);this._startYaw=vrm.scene.rotation.y||0;}
  setBedRoot(t,lying=false){
    const vrm=this.getVrm?.();if(!vrm)return;const k=smooth(t);const anchor=this.world?.anchor(lying?'bedLie':'bedSit');if(!anchor)return;
    vrm.scene.position.lerpVectors(this._startPos,anchor,k);const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(lying?-Math.PI/2:0,this._startYaw,0,'XYZ'));vrm.scene.quaternion.slerpQuaternions(this._startQuat,q,k);vrm.scene.updateMatrixWorld(true);
  }
  update(dt){
    this.world?.update(dt);this.taskTime+=dt;this.beginTask();if(this.task==='idle'){this.idleGait(dt);return;}
    if(this.task==='march-step'){this.executeMarchStep(dt);return;}
    if(this.task==='walk-to-bed'){this.walkToward(dt,this.world?.anchor('bedApproach'),'open-blanket');return;}
    if(this.task==='walk-to-anchor'){this.walkToward(dt,this.world?.anchor(this.targetAnchor||'roomCenter'),'idle');return;}
    if(this.task==='open-blanket'){this.idleGait(dt);this.world?.setBlanket('open',clamp(this.taskTime/1.8,0,1));if(this.taskTime>=1.9){this.stopAction?.();this.captureRoot();this.rootOverride=true;this.transition('sit-bed');}return;}
    if(this.task==='sit-bed'){this.idleGait(dt);this.rootOverride=true;this.setBedRoot(clamp(this.taskTime/1.25,0,1),false);if(this.taskTime>=1.3){this.captureRoot();this.transition('lie-bed');}return;}
    if(this.task==='lie-bed'){this.idleGait(dt);this.rootOverride=true;this.setBedRoot(clamp(this.taskTime/1.5,0,1),true);if(this.taskTime>=1.55)this.transition('cover-blanket');return;}
    if(this.task==='cover-blanket'){this.idleGait(dt);this.rootOverride=true;this.world?.setBlanket('cover',clamp(this.taskTime/2.1,0,1));if(this.taskTime>=2.2)this.transition('sleep');return;}
    if(this.task==='sleep'){this.idleGait(dt);this.rootOverride=true;return;}
  }
  ownsRootPose(){return this.rootOverride;}
  contactGait(){return this.gaitPlan;}
  state(){return {solver:'physical-embodiment-foot-driven-v2',task:this.task,rootOverride:this.rootOverride,gait:this.gaitPlan,march:{side:this._marchSide,stepLength:this.stepLength},footDriven:this.footWalk.state(),world:this.world?.state?.()||null};}
}
