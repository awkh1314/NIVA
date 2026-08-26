const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const damp=(current,target,lambda,dt)=>current+(target-current)*(1-Math.exp(-Math.max(0,lambda)*Math.max(0,dt)));
const dotXZ=(a,b)=>(a?.x||0)*(b?.x||0)+(a?.z||0)*(b?.z||0);
const smoothstep=(t)=>{const x=clamp(t,0,1);return x*x*(3-2*x);};

export class RootMotionEstimator{
  constructor(){this.position=null;this.velocity={x:0,z:0};this.acceleration={x:0,z:0};}
  reset(position=null){this.position=position?{x:position.x||0,z:position.z||0}:null;this.velocity={x:0,z:0};this.acceleration={x:0,z:0};}
  update(dt,position){
    const h=clamp(Number(dt)||0,1/240,.05);const p={x:Number(position?.x)||0,z:Number(position?.z)||0};
    if(!this.position){this.reset(p);return {velocity:{...this.velocity},acceleration:{...this.acceleration}};}
    const rawV={x:(p.x-this.position.x)/h,z:(p.z-this.position.z)/h};
    const prevV={...this.velocity};
    this.velocity.x=damp(this.velocity.x,rawV.x,12,h);this.velocity.z=damp(this.velocity.z,rawV.z,12,h);
    const rawA={x:(this.velocity.x-prevV.x)/h,z:(this.velocity.z-prevV.z)/h};
    this.acceleration.x=damp(this.acceleration.x,rawA.x,8,h);this.acceleration.z=damp(this.acceleration.z,rawA.z,8,h);
    this.position=p;
    return {velocity:{...this.velocity},acceleration:{...this.acceleration}};
  }
}

export function capturePoint({centerOfMass,velocity={x:0,z:0},groundY=0,gravity=9.81,minHeight=.32}={}){
  if(!centerOfMass)return null;
  const height=Math.max(minHeight,(Number(centerOfMass.y)||0)-groundY);
  const omega=Math.sqrt(Math.max(1e-6,gravity/height));
  return {x:centerOfMass.x+(velocity.x||0)/omega,y:centerOfMass.y,z:centerOfMass.z+(velocity.z||0)/omega,omega,height};
}

function chooseStepSide({stance={},localRight=0}){
  if(stance.left&&!stance.right)return 'right';
  if(stance.right&&!stance.left)return 'left';
  return localRight>=0?'right':'left';
}

export class RecoveryStepPlanner{
  constructor({modelHeight=1.6}={}){
    this.h=Math.max(.5,modelHeight);this.risk=0;this.active=null;this.sequence=0;this.cooldown=0;
  }
  reset(){this.risk=0;this.active=null;this.cooldown=0;}
  update(dt,{action='idle',grounded=true,capturePoint:cp=null,supportCenter=null,leftFoot=null,rightFoot=null,stance={},forward={x:0,z:1},right={x:1,z:0},velocity={x:0,z:0},acceleration={x:0,z:0}}={}){
    const hdt=clamp(Number(dt)||0,0,.05);this.cooldown=Math.max(0,this.cooldown-hdt);
    if(!grounded||!cp||!supportCenter){this.risk=damp(this.risk,0,10,hdt);this.active=null;return {risk:this.risk,needsStep:false,stepSide:null,stepTarget:null,stepPhase:0,preLeanPitchDeg:0,preLeanRollDeg:0};}
    const running=action==='run';const locomotion=action==='walk'||running;
    const delta={x:cp.x-supportCenter.x,z:cp.z-supportCenter.z};
    const localRight=dotXZ(delta,right),localForward=dotXZ(delta,forward);
    const single=Boolean(stance.left)!==Boolean(stance.right);
    const sideRadius=this.h*(single?.040:.068);const forwardRadius=this.h*(single?.060:.095);
    const accelLeadRight=dotXZ(acceleration,right)*.018,accelLeadForward=dotXZ(acceleration,forward)*.018;
    const normalized=Math.hypot((localRight+accelLeadRight)/sideRadius,(localForward+accelLeadForward)/forwardRadius);
    const rawRisk=clamp((normalized-.62)/.78+(running?.10:locomotion?.04:0),0,1);
    this.risk=damp(this.risk,rawRisk,rawRisk>this.risk?9:5,hdt);
    const preLeanRollDeg=clamp(-(localRight/sideRadius)*1.35*this.risk,-3.2,3.2);
    const preLeanPitchDeg=clamp(-(localForward/forwardRadius)*1.15*this.risk,-3.4,3.4);

    if(!this.active&&this.cooldown<=0&&this.risk>.46){
      const side=chooseStepSide({stance,localRight});const foot=side==='left'?leftFoot:rightFoot;
      if(foot){
        const maxForward=this.h*(running?.30:locomotion?.24:.20),maxSide=this.h*(running?.18:.15);
        const leadForward=clamp(localForward+(dotXZ(velocity,forward)||0)*.10,-maxForward,maxForward);
        const leadRight=clamp(localRight+(dotXZ(velocity,right)||0)*.10,-maxSide,maxSide);
        const final={x:supportCenter.x+forward.x*leadForward+right.x*leadRight,y:foot.y,z:supportCenter.z+forward.z*leadForward+right.z*leadRight};
        this.active={id:++this.sequence,side,time:0,start:{x:foot.x,y:foot.y,z:foot.z},final};
      }
    }

    let needsStep=false,stepSide=null,stepTarget=null,stepPhase=0,stepId=null;
    if(this.active){
      this.active.time+=hdt;const duration=running?.24:.31;stepPhase=clamp(this.active.time/duration,0,1);const k=smoothstep(stepPhase);const a=this.active.start,b=this.active.final;
      stepTarget={x:a.x+(b.x-a.x)*k,y:a.y+(b.y-a.y)*k+Math.sin(Math.PI*stepPhase)*this.h*(running?.055:.040),z:a.z+(b.z-a.z)*k};
      needsStep=true;stepSide=this.active.side;stepId=this.active.id;
      if(stepPhase>=1&&((this.risk<.20&&this.active.time>duration+.10)||this.active.time>duration+.42)){
        this.active=null;this.cooldown=.20;
      }
    }
    return {risk:this.risk,normalizedDistance:normalized,needsStep,stepSide,stepTarget,stepPhase,stepId,preLeanPitchDeg,preLeanRollDeg,captureOffsetRight:localRight,captureOffsetForward:localForward};
  }
}
