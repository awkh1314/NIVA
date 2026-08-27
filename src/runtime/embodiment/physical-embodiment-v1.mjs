import * as THREE from 'three';
import { ContactGaitController } from '../physics/contact-gait-v3.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));
const smooth=(t)=>{const x=clamp(t,0,1);return x*x*(3-2*x);};

export class PhysicalEmbodimentController{
  constructor({world,getVrm,getBodyPhysics,getActionState,playClip,stopAction,faceDirection,walkSpeed=.48}={}){
    this.world=world;this.getVrm=getVrm;this.getBodyPhysics=getBodyPhysics;this.getActionState=getActionState;this.playClip=playClip;this.stopAction=stopAction;this.faceDirection=faceDirection;this.walkSpeed=walkSpeed;
    this.gait=new ContactGaitController();this.gaitPlan=null;this.task='idle';this.taskTime=0;this.taskStarted=false;this.rootOverride=false;this._startPos=new THREE.Vector3();this._startQuat=new THREE.Quaternion();this._startYaw=0;this._driveDir=new THREE.Vector3(0,0,1);
  }
  currentPhase(){const s=this.getActionState?.()||{};const d=Math.max(.01,s.duration||1);return (((s.time||0)%d)/d+1)%1;}
  drive(dt,direction,speed=this.walkSpeed,action='walk'){
    const physics=this.getBodyPhysics?.();if(!physics||!direction)return null;
    const h=clamp(Number(dt)||0,0,.05),target=direction.clone?.()||new THREE.Vector3(direction.x||0,0,direction.z||0);target.y=0;
    if(target.lengthSq()<1e-8)return this.idleGait(dt);
    target.normalize();
    const turnAlpha=1-Math.exp(-(action==='run'?13:10)*h);
    this._driveDir.lerp(target,turnAlpha);if(this._driveDir.lengthSq()<1e-8)this._driveDir.copy(target);else this._driveDir.normalize();
    const phase=this.currentPhase(),speedRatio=clamp(speed/Math.max(.05,this.walkSpeed),0,1.5);
    this.gaitPlan=this.gait.update(dt,{phase,action,moving:true,speedRatio});
    this.gaitPlan.speedRatio=speedRatio;this.gaitPlan.direction={x:this._driveDir.x,z:this._driveDir.z};
    physics.move(dt,this._driveDir,speed*(this.gaitPlan.rootDrive||1));return this.gaitPlan;
  }
  idleGait(dt){this.gaitPlan=this.gait.update(dt,{action:'idle',moving:false,speedRatio:0});return this.gaitPlan;}
  startSleep(){if(this.task!=='idle'&&this.task!=='sleep')return false;this.task='walk-to-bed';this.taskTime=0;this.taskStarted=false;this.rootOverride=false;this.world?.setBlanket('rest',0);return true;}
  startWalkTo(anchorName='roomCenter'){this.targetAnchor=anchorName;this.task='walk-to-anchor';this.taskTime=0;this.taskStarted=false;this.rootOverride=false;return true;}
  transition(next){this.task=next;this.taskTime=0;this.taskStarted=false;}
  beginTask(){if(this.taskStarted)return;this.taskStarted=true;
    if(this.task==='walk-to-bed'||this.task==='walk-to-anchor')this.playClip?.('walk',{loop:true});
    if(this.task==='open-blanket')this.playClip?.('reach',{duration:2});
    if(this.task==='sit-bed')this.playClip?.('sitBed',{duration:1.25});
    if(this.task==='lie-bed')this.playClip?.('lieBed',{duration:1.5});
    if(this.task==='cover-blanket')this.playClip?.('sleepBed',{loop:true});
    if(this.task==='sleep')this.playClip?.('sleepBed',{loop:true});
  }
  walkToward(dt,target,next){
    const vrm=this.getVrm?.(),physics=this.getBodyPhysics?.();if(!vrm||!physics||!target)return;
    const pos=new THREE.Vector3(vrm.scene.position.x,0,vrm.scene.position.z),to=target.clone().setY(0).sub(pos),dist=to.length();
    if(dist<.16){this.stopAction?.();this.idleGait(dt);this.transition(next);return;}
    const dir=to.normalize();this.drive(dt,dir,this.walkSpeed,'walk');this.faceDirection?.(dir,dt,6.5);
  }
  captureRoot(){const vrm=this.getVrm?.();if(!vrm)return;this._startPos.copy(vrm.scene.position);this._startQuat.copy(vrm.scene.quaternion);this._startYaw=vrm.scene.rotation.y||0;}
  setBedRoot(t,lying=false){
    const vrm=this.getVrm?.();if(!vrm)return;const k=smooth(t);const anchor=this.world?.anchor(lying?'bedLie':'bedSit');if(!anchor)return;
    vrm.scene.position.lerpVectors(this._startPos,anchor,k);
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(lying?-Math.PI/2:0,this._startYaw,0,'XYZ'));
    vrm.scene.quaternion.slerpQuaternions(this._startQuat,q,k);vrm.scene.updateMatrixWorld(true);
  }
  update(dt){
    this.world?.update(dt);this.taskTime+=dt;this.beginTask();
    if(this.task==='idle'){this.idleGait(dt);return;}
    if(this.task==='walk-to-bed'){this.walkToward(dt,this.world?.anchor('bedApproach'),'open-blanket');return;}
    if(this.task==='walk-to-anchor'){this.walkToward(dt,this.world?.anchor(this.targetAnchor||'roomCenter'),'idle');return;}
    if(this.task==='open-blanket'){
      this.idleGait(dt);this.world?.setBlanket('open',clamp(this.taskTime/1.8,0,1));if(this.taskTime>=1.9){this.stopAction?.();this.captureRoot();this.rootOverride=true;this.transition('sit-bed');}return;
    }
    if(this.task==='sit-bed'){
      this.idleGait(dt);this.rootOverride=true;this.setBedRoot(clamp(this.taskTime/1.25,0,1),false);if(this.taskTime>=1.3){this.captureRoot();this.transition('lie-bed');}return;
    }
    if(this.task==='lie-bed'){
      this.idleGait(dt);this.rootOverride=true;this.setBedRoot(clamp(this.taskTime/1.5,0,1),true);if(this.taskTime>=1.55)this.transition('cover-blanket');return;
    }
    if(this.task==='cover-blanket'){
      this.idleGait(dt);this.rootOverride=true;this.world?.setBlanket('cover',clamp(this.taskTime/2.1,0,1));if(this.taskTime>=2.2)this.transition('sleep');return;
    }
    if(this.task==='sleep'){this.idleGait(dt);this.rootOverride=true;return;}
  }
  ownsRootPose(){return this.rootOverride;}
  contactGait(){return this.gaitPlan;}
  state(){return {solver:'physical-embodiment-v1',task:this.task,rootOverride:this.rootOverride,gait:this.gaitPlan,world:this.world?.state?.()||null};}
}
