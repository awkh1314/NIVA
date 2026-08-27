import * as THREE from 'three';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));
const smooth=(t)=>{const x=clamp(t,0,1);return x*x*(3-2*x);};
const lerp=(a,b,t)=>a+(b-a)*clamp(t,0,1);
const EPS=1e-6;

export const FOOT_WALK_PHASES=Object.freeze(['DOUBLE_SUPPORT','PRELOAD','SWING','HEEL_STRIKE','LOAD_TRANSFER','MID_STANCE','TOE_OFF','RECOVERY']);

function vec(v,fallback=new THREE.Vector3()){
  if(v?.isVector3)return v.clone();
  if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z))return new THREE.Vector3(v.x,v.y,v.z);
  return fallback.clone();
}
function phaseAt(u){if(u<=0)return'DOUBLE_SUPPORT';if(u<.12)return'PRELOAD';if(u<.48)return'SWING';if(u<.56)return'HEEL_STRIKE';if(u<.74)return'LOAD_TRANSFER';if(u<.84)return'MID_STANCE';if(u<.95)return'TOE_OFF';if(u<1)return'RECOVERY';return'DOUBLE_SUPPORT';}

// C1-continuous stride progress. Unlike the old piecewise curve, velocity never
// spikes during load transfer and does not fall to zero at every step boundary.
function rootCurve(u){
  const t=clamp(u,0,1),m=.55,t2=t*t,t3=t2*t;
  return clamp((t3-2*t2+t)*m+(-2*t3+3*t2)+(t3-t2)*m,0,1);
}

function supportLoads(u,lead){
  const other=lead==='left'?'right':'left';let leadLoad=.5,otherLoad=.5,leadHeel=1,leadToe=1,otherHeel=1,otherToe=1;
  if(u<.12){const t=smooth(u/.12);leadLoad=lerp(.5,.15,t);otherLoad=1-leadLoad;}
  else if(u<.48){leadLoad=0;otherLoad=1;leadHeel=0;leadToe=0;}
  else if(u<.56){const t=smooth((u-.48)/.08);leadLoad=lerp(.08,.22,t);otherLoad=1-leadLoad;leadHeel=1;leadToe=lerp(.05,.35,t);}
  else if(u<.74){const t=smooth((u-.56)/.18);leadLoad=lerp(.22,.70,t);otherLoad=1-leadLoad;leadHeel=lerp(1,.45,t);leadToe=lerp(.35,1,t);}
  else if(u<.84){const t=smooth((u-.74)/.10);leadLoad=lerp(.70,.86,t);otherLoad=1-leadLoad;leadHeel=lerp(.45,.12,t);leadToe=1;otherHeel=lerp(1,.25,t);}
  else if(u<.95){const t=smooth((u-.84)/.11);leadLoad=lerp(.86,1,t);otherLoad=1-leadLoad;leadHeel=0;leadToe=1;otherHeel=0;otherToe=lerp(1,0,t);}
  else{const t=smooth((u-.95)/.05);leadLoad=lerp(1,.5,t);otherLoad=1-leadLoad;leadHeel=lerp(0,1,t);leadToe=1;otherHeel=lerp(0,1,t);otherToe=lerp(0,1,t);}
  const out={left:0,right:0,leftHeel:0,rightHeel:0,leftToe:0,rightToe:0};out[lead]=leadLoad;out[other]=otherLoad;out[`${lead}Heel`]=leadHeel;out[`${lead}Toe`]=leadToe;out[`${other}Heel`]=otherHeel;out[`${other}Toe`]=otherToe;return out;
}

function rotateToward2D(from,to,maxRadians){
  const a=vec(from,new THREE.Vector3(0,0,1)).setY(0),b=vec(to,a).setY(0);if(a.lengthSq()<EPS)a.set(0,0,1);else a.normalize();if(b.lengthSq()<EPS)return a;b.normalize();
  const dot=clamp(a.dot(b),-1,1),angle=Math.acos(dot);if(angle<1e-6)return b;const cross=a.x*b.z-a.z*b.x,sign=cross>=0?1:-1,step=Math.min(angle,Math.max(0,maxRadians))*sign,c=Math.cos(step),s=Math.sin(step);return new THREE.Vector3(a.x*c-a.z*s,0,a.x*s+a.z*c).normalize();
}

export class FootDrivenWalkPlanner{
  constructor({modelHeight=1.6,nominalSpeed=.55,startSide='left'}={}){
    this.h=Math.max(.6,Number(modelHeight)||1.6);this.nominalSpeed=Math.max(.1,Number(nominalSpeed)||.55);this.minStep=this.h*.16;this.comfortableStep=this.h*.30;this.maxWalkingStep=this.h*.42;this.stepHeightMin=this.h*.04;this.stepHeightMax=this.h*.07;
    this.maxRootVelocity=this.h*.75;this.maxRootAcceleration=this.h*2.2;this.maxRootDeltaPerFrame=this.h*.025;this.maxTurnPerStep=THREE.MathUtils.degToRad(42);this.startSide=startSide==='right'?'right':'left';this.reset();
  }
  reset({leftFoot=null,rightFoot=null}={}){
    this.planted={left:leftFoot?vec(leftFoot):null,right:rightFoot?vec(rightFoot):null};this.active=false;this.initialized=Boolean(this.planted.left&&this.planted.right);this.nextLead=this.startSide;this.lead=this.startSide;this.support=this.startSide==='left'?'right':'left';this.elapsed=0;this.duration=.9;this.actualStepDistance=0;this.leadStart=null;this.supportPlant=null;this.landing=null;this.stepDir=new THREE.Vector3(0,0,1);this.desiredDir=new THREE.Vector3(0,0,1);this.rootApplied=0;this.rootSpeed=0;this.totalRootAdvance=0;this.totalStepDistance=0;this.stepCount=0;this.stopRequested=false;this.singleMode=false;this.pendingRequest=new THREE.Vector3();this.last=null;
  }
  ensureFeet(leftFoot,rightFoot){if(!this.planted.left&&leftFoot)this.planted.left=vec(leftFoot);if(!this.planted.right&&rightFoot)this.planted.right=vec(rightFoot);this.initialized=Boolean(this.planted.left&&this.planted.right);return this.initialized;}
  chooseStepLength(speed,turnAngle,forcedStepLength=null,action='walk'){
    if(Number.isFinite(forcedStepLength))return clamp(forcedStepLength,this.h*.08,action==='run'?this.h*.55:this.maxWalkingStep);const ratio=clamp((Number(speed)||0)/this.nominalSpeed,0,1.5);let step=ratio<=1?lerp(this.minStep,this.comfortableStep,ratio):lerp(this.comfortableStep,this.maxWalkingStep,(ratio-1)/.5);if(action==='run')step=Math.min(this.h*.55,step*1.18);const turnPenalty=clamp(turnAngle/Math.PI,0,1)*.62;return Math.max(this.h*.10,step*(1-turnPenalty));
  }
  beginStep({direction,speed,leftFoot,rightFoot,resolveLanding=null,forcedSide=null,forcedStepLength=null,forcedDuration=null,mode='continuous',action='walk'}={}){
    if(!this.ensureFeet(leftFoot,rightFoot))return false;const requested=vec(direction,this.desiredDir).setY(0);if(requested.lengthSq()>EPS)requested.normalize();else requested.copy(this.desiredDir);this.desiredDir.copy(requested);
    const prev=this.stepDir.lengthSq()>EPS?this.stepDir:new THREE.Vector3(0,0,1),turnAngle=Math.acos(clamp(prev.dot(requested),-1,1));this.stepDir.copy(rotateToward2D(prev,requested,this.maxTurnPerStep));this.lead=forcedSide==='right'?'right':forcedSide==='left'?'left':this.nextLead;this.support=this.lead==='left'?'right':'left';this.leadStart=this.planted[this.lead].clone();this.supportPlant=this.planted[this.support].clone();
    const right=new THREE.Vector3(this.stepDir.z,0,-this.stepDir.x);let lateral=this.leadStart.clone().sub(this.supportPlant).dot(right);lateral=clamp(lateral,-this.h*.14,this.h*.14);const stepLength=this.chooseStepLength(speed,turnAngle,forcedStepLength,action),desired=this.supportPlant.clone().addScaledVector(this.stepDir,stepLength).addScaledVector(right,lateral);desired.y=this.leadStart.y;
    let landing=resolveLanding?.(this.leadStart.clone(),desired.clone(),{side:this.lead,direction:this.stepDir.clone(),stepLength})||desired;landing=vec(landing,desired);this.landing=landing;this.actualStepDistance=Math.max(0,landing.clone().sub(this.supportPlant).dot(this.stepDir));if(this.actualStepDistance<this.h*.025){this.active=false;this.stopRequested=true;this.last=this.idlePlan({blocked:true});return false;}
    const ratio=clamp((Number(speed)||this.nominalSpeed)/this.nominalSpeed,0,1.5),cadence=action==='run'?lerp(.68,.50,clamp(ratio/1.5,0,1)):lerp(1.05,.72,clamp(ratio,0,1));this.duration=Math.max(Number(forcedDuration)||0,cadence,this.actualStepDistance/(this.maxRootVelocity*.68));this.elapsed=0;this.rootApplied=0;this.pendingRequest.set(0,0,0);this.active=true;this.stopRequested=mode==='single';this.singleMode=mode==='single';if(mode==='single'||this.stepCount===0)this.rootSpeed=0;return true;
  }
  swingTarget(u){if(!this.leadStart||!this.landing)return null;if(u<=.12)return this.leadStart.clone();if(u>=.48)return this.landing.clone();const t=smooth((u-.12)/.36),p=this.leadStart.clone().lerp(this.landing,t),lift=lerp(this.stepHeightMin,this.stepHeightMax,clamp(this.actualStepDistance/this.maxWalkingStep,0,1));p.y+=Math.sin(Math.PI*t)*lift;return p;}
  idlePlan(extra={}){const left=this.planted.left?.clone?.()||null,right=this.planted.right?.clone?.()||null;return {solver:'foot-driven-walk-v2',phase:'DOUBLE_SUPPORT',animationPhase:0,active:false,settled:true,blocked:false,lead:null,support:null,supportLoad:{left:.5,right:.5},stance:{left:true,right:true},footTargets:{left,right},footTargetWeights:{left:1,right:1},heelContact:{left:1,right:1},toeContact:{left:1,right:1},rootDelta:new THREE.Vector3(),rootProgress:0,actualStepDistance:0,totalRootAdvance:this.totalRootAdvance,totalStepDistance:this.totalStepDistance,stepCount:this.stepCount,maxRootDeltaPerFrame:this.maxRootDeltaPerFrame,...extra};}
  finalizeStep(){
    this.planted[this.lead]=this.landing.clone();this.planted[this.support]=this.supportPlant.clone();this.totalStepDistance+=this.actualStepDistance;this.stepCount+=1;this.nextLead=this.support;this.active=false;const settled=this.stopRequested||this.singleMode;if(settled)this.rootSpeed=0;
    if(this.last){this.last.totalRootAdvance=this.totalRootAdvance;this.last.totalStepDistance=this.totalStepDistance;this.last.stepCount=this.stepCount;this.last.completeStep=true;this.last.active=!settled;this.last.settled=settled;if(settled){this.last.phase='DOUBLE_SUPPORT';this.last.supportLoad={left:.5,right:.5};this.last.stance={left:true,right:true};this.last.footTargetWeights={left:1,right:1};}}
  }
  commitAppliedRoot(actualDelta,requestedDelta=null){
    const req=vec(requestedDelta||this.pendingRequest);req.y=0;const actual=vec(actualDelta);actual.y=0;const reqForward=Math.max(0,req.dot(this.stepDir)),actualForward=clamp(actual.dot(this.stepDir),0,reqForward+1e-8);this.rootApplied=Math.min(this.actualStepDistance,this.rootApplied+actualForward);this.totalRootAdvance+=actualForward;this.pendingRequest.set(0,0,0);
    if(this.last){this.last.actualAppliedRootDelta=this.stepDir.clone().multiplyScalar(actualForward);this.last.rootProgress=this.actualStepDistance>EPS?clamp(this.rootApplied/this.actualStepDistance,0,1):1;this.last.totalRootAdvance=this.totalRootAdvance;}
    if(this.active&&this.elapsed>=this.duration-1e-8&&this.actualStepDistance-this.rootApplied<=1e-4)this.finalizeStep();return this.last||this.state();
  }
  update(dt,{direction=null,desiredSpeed=0,leftFoot=null,rightFoot=null,resolveLanding=null,continueSteps=true,action='walk',mode='continuous',forcedSide=null,forcedStepLength=null,forcedDuration=null}={}){
    const h=clamp(Number(dt)||0,0,.05);this.ensureFeet(leftFoot,rightFoot);if(direction){const d=vec(direction,this.desiredDir).setY(0);if(d.lengthSq()>EPS)this.desiredDir.copy(d.normalize());}if(!continueSteps)this.stopRequested=true;if(this.pendingRequest.lengthSq()>EPS)return this.last;
    if(!this.active){if((continueSteps||mode==='single')&&this.initialized){const started=this.beginStep({direction:this.desiredDir,speed:desiredSpeed,leftFoot,rightFoot,resolveLanding,forcedSide,forcedStepLength,forcedDuration,mode,action});if(!started)return this.last||this.idlePlan();}else return this.last=this.idlePlan();}
    this.elapsed+=h;const u=clamp(this.elapsed/Math.max(.01,this.duration),0,1),phase=phaseAt(u),loads=supportLoads(u,this.lead),swing=this.swingTarget(u),footTargets={left:this.planted.left?.clone?.()||null,right:this.planted.right?.clone?.()||null};footTargets[this.support]=this.supportPlant.clone();footTargets[this.lead]=swing||this.landing.clone();const stance={left:true,right:true};if(u>=.12&&u<.48)stance[this.lead]=false;const weights={left:stance.left?1:0,right:stance.right?1:0};if(!stance[this.lead])weights[this.lead]=.90;
    const targetAdvance=this.actualStepDistance*rootCurve(u),remaining=Math.max(0,targetAdvance-this.rootApplied),curveSpeed=h>0?remaining/h:0,targetSpeed=Math.min(this.maxRootVelocity,curveSpeed),maxDv=this.maxRootAcceleration*h;this.rootSpeed=clamp(targetSpeed,Math.max(0,this.rootSpeed-maxDv),this.rootSpeed+maxDv);const deltaDistance=Math.min(remaining,this.rootSpeed*h,this.maxRootDeltaPerFrame,this.maxRootVelocity*h),rootDelta=this.stepDir.clone().multiplyScalar(deltaDistance);this.pendingRequest.copy(rootDelta);
    return this.last={solver:'foot-driven-walk-v2',phase,animationPhase:u,active:true,settled:false,blocked:false,lead:this.lead,support:this.support,supportLoad:{left:loads.left,right:loads.right},stance,footTargets,footTargetWeights:weights,heelContact:{left:loads.leftHeel,right:loads.rightHeel},toeContact:{left:loads.leftToe,right:loads.rightToe},rootDelta,rootProgress:this.actualStepDistance>EPS?clamp(this.rootApplied/this.actualStepDistance,0,1):1,actualStepDistance:this.actualStepDistance,plannedLanding:this.landing.clone(),supportPlant:this.supportPlant.clone(),direction:this.stepDir.clone(),totalRootAdvance:this.totalRootAdvance,totalStepDistance:this.totalStepDistance,stepCount:this.stepCount,maxRootVelocity:this.maxRootVelocity,maxRootAcceleration:this.maxRootAcceleration,maxRootDeltaPerFrame:this.maxRootDeltaPerFrame,completeStep:false};
  }
  state(){return this.last||this.idlePlan();}
}

export { phaseAt as footWalkPhaseAt, rootCurve as footWalkRootCurve, rotateToward2D };
