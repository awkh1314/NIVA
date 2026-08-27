const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));
const smooth=(t)=>{const x=clamp(t,0,1);return x*x*(3-2*x);};
const lerp=(a,b,t)=>a+(b-a)*clamp(t,0,1);
const seg=(u,a,b)=>smooth((u-a)/Math.max(1e-6,b-a));

export const SINGLE_STEP_DURATION=1.65;

function foot({phase,load,contact,heel=0,toe=0,cycle=0}){
  return {phase,load:clamp(load,0,1),contact:Boolean(contact),heelContact:clamp(heel,0,1),toeContact:clamp(toe,0,1),cycle};
}

export function sampleSingleStepMarch(elapsed,{side='left',duration=SINGLE_STEP_DURATION}={}){
  const lead=side==='right'?'right':'left',trail=lead==='left'?'right':'left';
  const u=clamp((Number(elapsed)||0)/Math.max(.01,duration),0,1);
  let phase='attention',leadLoad=.5,trailLoad=.5,leadFoot,trailFoot,rootProgress=0,freeFoot=null;

  if(u<.10){
    const k=seg(u,0,.10);phase='weight-shift';leadLoad=lerp(.5,.10,k);trailLoad=1-leadLoad;rootProgress=lerp(0,.015,k);
    leadFoot=foot({phase:'unloading',load:leadLoad,contact:true,heel:1,toe:1,cycle:u});
    trailFoot=foot({phase:'support',load:trailLoad,contact:true,heel:1,toe:1,cycle:u});
  }else if(u<.30){
    const k=seg(u,.10,.30);phase='lead-swing';leadLoad=0;trailLoad=1;rootProgress=lerp(.015,.25,k);freeFoot=lead;
    leadFoot=foot({phase:'swing',load:0,contact:false,cycle:u});
    trailFoot=foot({phase:'single-support',load:1,contact:true,heel:lerp(1,.72,k),toe:1,cycle:u});
  }else if(u<.42){
    const k=seg(u,.30,.42);phase='heel-strike';leadLoad=lerp(.10,.62,k);trailLoad=1-leadLoad;rootProgress=lerp(.25,.48,k);
    leadFoot=foot({phase:'heel-strike',load:leadLoad,contact:true,heel:1,toe:lerp(.05,.72,k),cycle:u});
    trailFoot=foot({phase:'rear-support',load:trailLoad,contact:true,heel:lerp(.72,.22,k),toe:1,cycle:u});
  }else if(u<.60){
    const k=seg(u,.42,.60);phase='transfer-toe-off';leadLoad=lerp(.62,.97,k);trailLoad=1-leadLoad;rootProgress=lerp(.48,.72,k);
    leadFoot=foot({phase:'loading-to-stance',load:leadLoad,contact:true,heel:lerp(1,.68,k),toe:1,cycle:u});
    trailFoot=foot({phase:'toe-off',load:trailLoad,contact:true,heel:lerp(.22,0,k),toe:lerp(1,.18,k),cycle:u});
  }else if(u<.78){
    const k=seg(u,.60,.78);phase='trail-recovery';leadLoad=1;trailLoad=0;rootProgress=lerp(.72,.93,k);freeFoot=trail;
    leadFoot=foot({phase:'single-support',load:1,contact:true,heel:lerp(.68,.90,k),toe:1,cycle:u});
    trailFoot=foot({phase:'recovery-swing',load:0,contact:false,cycle:u});
  }else if(u<.90){
    const k=seg(u,.78,.90);phase='close-step';leadLoad=lerp(.78,.5,k);trailLoad=1-leadLoad;rootProgress=lerp(.93,1,k);
    leadFoot=foot({phase:'front-support',load:leadLoad,contact:true,heel:1,toe:1,cycle:u});
    trailFoot=foot({phase:'closing-contact',load:trailLoad,contact:true,heel:1,toe:lerp(.15,1,k),cycle:u});
  }else{
    phase='attention-settle';leadLoad=.5;trailLoad=.5;rootProgress=1;
    leadFoot=foot({phase:'double-support',load:.5,contact:true,heel:1,toe:1,cycle:u});
    trailFoot=foot({phase:'double-support',load:.5,contact:true,heel:1,toe:1,cycle:u});
  }

  const left=lead==='left'?leadFoot:trailFoot,right=lead==='right'?leadFoot:trailFoot;
  const supportLoad={left:lead==='left'?leadLoad:trailLoad,right:lead==='right'?leadLoad:trailLoad};
  const stance={left:left.contact,right:right.contact};
  return {
    solver:'single-step-march-v1',phase,progress:u,rootProgress:clamp(rootProgress,0,1),complete:u>=1,
    leadSide:lead,trailSide:trail,freeFoot,stepSide:freeFoot,
    left,right,supportLoad,stance,doubleSupport:stance.left&&stance.right,
    rootDrive:1,
  };
}
