const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));
const smooth=(t)=>{const x=clamp(t,0,1);return x*x*(3-2*x);};
const lerp=(a,b,t)=>a+(b-a)*clamp(t,0,1);

function footCycle(local){
  const p=((local%1)+1)%1;
  let load=0,heel=0,toe=0,contact=false,phase='swing';
  if(p<.10){
    const t=smooth(p/.10);load=lerp(.42,1,t);heel=1;toe=lerp(.10,.72,t);contact=true;phase='loading';
  }else if(p<.38){
    const t=smooth((p-.10)/.28);load=lerp(1,.86,t);heel=lerp(.92,.22,t);toe=1;contact=true;phase='mid-stance';
  }else if(p<.58){
    const t=smooth((p-.38)/.20);load=lerp(.86,0,t);heel=lerp(.20,0,t);toe=lerp(1,0,t);contact=true;phase='toe-off';
  }else{
    phase=p<.78?'swing':'pre-contact';
  }
  return {phase,cycle:p,load,heelContact:heel,toeContact:toe,contact};
}

export class ContactGaitController{
  constructor(){this.leftLoad=.5;this.rightLoad=.5;this.last=null;}
  reset(){this.leftLoad=.5;this.rightLoad=.5;this.last=null;}
  update(dt,{phase=0,action='walk',moving=true}={}){
    if(!moving||!['walk','run'].includes(action)){
      this.leftLoad=lerp(this.leftLoad,.5,clamp((Number(dt)||0)*8,0,1));
      this.rightLoad=1-this.leftLoad;
      return this.last={phase:0,left:{...footCycle(0),load:this.leftLoad,contact:true,phase:'double-support'},right:{...footCycle(.5),load:this.rightLoad,contact:true,phase:'double-support'},supportLoad:{left:this.leftLoad,right:this.rightLoad},stance:{left:true,right:true},rootDrive:0,stepSide:null,doubleSupport:true};
    }
    const stride=action==='run'?.46:.50;
    const left=footCycle(phase);
    const right=footCycle(phase+stride);
    const sum=Math.max(1e-6,left.load+right.load);
    const rawLeft=left.load/sum,rawRight=right.load/sum;
    const alpha=1-Math.exp(-(action==='run'?18:13)*clamp(Number(dt)||0,0,.05));
    this.leftLoad=lerp(this.leftLoad,rawLeft,alpha);
    this.rightLoad=lerp(this.rightLoad,rawRight,alpha);
    const norm=Math.max(1e-6,this.leftLoad+this.rightLoad);this.leftLoad/=norm;this.rightLoad/=norm;
    left.load=this.leftLoad;right.load=this.rightLoad;
    const stance={left:left.contact,right:right.contact};
    const doubleSupport=stance.left&&stance.right;
    const toePush=left.toeContact*this.leftLoad+right.toeContact*this.rightLoad;
    const heelAbsorb=left.heelContact*this.leftLoad+right.heelContact*this.rightLoad;
    // Root advances from stance-foot push, never from an ungrounded swing leg.
    const rootDrive=clamp(.30+.62*toePush+.18*heelAbsorb,action==='run'?.45:.28,action==='run'?1.22:1.08);
    const stepSide=!left.contact&&right.contact?'left':(!right.contact&&left.contact?'right':null);
    return this.last={phase,left,right,supportLoad:{left:this.leftLoad,right:this.rightLoad},stance,rootDrive,stepSide,doubleSupport};
  }
  state(){return this.last?{...this.last,solver:'contact-gait-v3'}:{solver:'contact-gait-v3',supportLoad:{left:.5,right:.5}};}
}
