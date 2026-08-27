import * as THREE from 'three';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));
const smooth=(t)=>{const x=clamp(t,0,1);return x*x*(3-2*x);};

export function sampleDayNight(timeOfDay=0.25){
  const t=((Number(timeOfDay)||0)%1+1)%1,angle=t*Math.PI*2,sunY=Math.sin(angle),sunX=Math.cos(angle),sunZ=Math.cos(angle*.5)*.28;
  const dayFactor=smooth(clamp((sunY+.08)/.34,0,1)),nightFactor=1-dayFactor,horizonFactor=Math.exp(-Math.pow(sunY/.24,2));
  const sunPosition=new THREE.Vector3(sunX*24,sunY*24,sunZ*24),moonPosition=sunPosition.clone().multiplyScalar(-1);
  const top=new THREE.Color().setRGB(
    THREE.MathUtils.lerp(.025,.25,dayFactor),
    THREE.MathUtils.lerp(.045,.56,dayFactor),
    THREE.MathUtils.lerp(.10,.91,dayFactor)
  );
  const horizonDay=new THREE.Color(0xc9e5f1),horizonNight=new THREE.Color(0x18243a),sunset=new THREE.Color(0xf2a06f);
  const horizon=horizonNight.clone().lerp(horizonDay,dayFactor).lerp(sunset,horizonFactor*(.86-.42*dayFactor));
  const ground=new THREE.Color(0x101820).lerp(new THREE.Color(0x91b8a0),dayFactor*.75);
  const sunColor=new THREE.Color(0xff9b63).lerp(new THREE.Color(0xfff3d6),clamp(Math.abs(sunY)*1.7,0,1));
  const moonColor=new THREE.Color(0xaec8ff);
  return {timeOfDay:t,angle,sunY,dayFactor,nightFactor,horizonFactor,sunPosition,moonPosition,topColor:top,horizonColor:horizon,groundColor:ground,sunColor,moonColor,sunIntensity:dayFactor*(1.2+.55*Math.max(0,sunY)),moonIntensity:nightFactor*.28,starOpacity:smooth(clamp((nightFactor-.28)/.72,0,1)),ambientIntensity:.18+dayFactor*.72};
}

export class DayNightCycle{
  constructor({timeOfDay=.30,dayDurationSeconds=720,auto=true,speed=1}={}){this.timeOfDay=((timeOfDay%1)+1)%1;this.dayDurationSeconds=Math.max(30,Number(dayDurationSeconds)||720);this.auto=Boolean(auto);this.speed=Math.max(0,Number(speed)||0);this.last=sampleDayNight(this.timeOfDay);}
  setTimeOfDay(value){this.timeOfDay=((Number(value)||0)%1+1)%1;this.last=sampleDayNight(this.timeOfDay);return this.last;}
  setSpeed(multiplier){this.speed=Math.max(0,Number(multiplier)||0);return this.speed;}
  pause(){this.auto=false;}
  resume(){this.auto=true;}
  update(dt){if(this.auto&&this.speed>0)this.timeOfDay=(this.timeOfDay+clamp(Number(dt)||0,0,.1)*this.speed/this.dayDurationSeconds)%1;return this.last=sampleDayNight(this.timeOfDay);}
  state(){return {timeOfDay:this.timeOfDay,hour:this.timeOfDay*24,auto:this.auto,speed:this.speed,dayFactor:this.last.dayFactor,nightFactor:this.last.nightFactor,starOpacity:this.last.starOpacity};}
}
