const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));

export const MOVEMENT_CODES=Object.freeze(new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight']));

export function movementAxes(codes=[]){
  const set=codes instanceof Set?codes:new Set(codes);
  let x=0,z=0;
  if(set.has('KeyA')||set.has('ArrowLeft'))x-=1;
  if(set.has('KeyD')||set.has('ArrowRight'))x+=1;
  if(set.has('KeyW')||set.has('ArrowUp'))z+=1;
  if(set.has('KeyS')||set.has('ArrowDown'))z-=1;
  const len=Math.hypot(x,z);
  if(len>1e-6){x/=len;z/=len;}
  return {x,z,active:len>1e-6};
}

export function isMovementCode(code){return MOVEMENT_CODES.has(code);}

export class KeyboardLocomotionController{
  constructor({acceleration=10,deceleration=13}={}){
    this.acceleration=Math.max(.1,acceleration);this.deceleration=Math.max(.1,deceleration);
    this.pressed=new Set();this.speed01=0;this.lastAxis={x:0,z:1};this.wasMoving=false;this.last=null;
  }
  keyDown(code){if(!isMovementCode(code))return false;this.pressed.add(code);return true;}
  keyUp(code){if(!isMovementCode(code))return false;this.pressed.delete(code);return true;}
  clear(){this.pressed.clear();}
  update(dt){
    const h=clamp(Number(dt)||0,0,.05),axis=movementAxes(this.pressed);
    if(axis.active)this.lastAxis={x:axis.x,z:axis.z};
    const target=axis.active?1:0,rate=axis.active?this.acceleration:this.deceleration,alpha=1-Math.exp(-rate*h);
    this.speed01+= (target-this.speed01)*alpha;
    if(!axis.active&&this.speed01<.015)this.speed01=0;
    const moving=axis.active||this.speed01>.025;
    const started=!this.wasMoving&&moving,stopped=this.wasMoving&&!moving;this.wasMoving=moving;
    return this.last={inputActive:axis.active,moving,started,stopped,speed01:this.speed01,axisX:axis.active?axis.x:this.lastAxis.x,axisZ:axis.active?axis.z:this.lastAxis.z,pressed:[...this.pressed]};
  }
  state(){return this.last||{inputActive:false,moving:false,started:false,stopped:false,speed01:this.speed01,axisX:this.lastAxis.x,axisZ:this.lastAxis.z,pressed:[...this.pressed]};}
}
