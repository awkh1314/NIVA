import * as THREE from 'three';

const TMP_A=new THREE.Vector3(),TMP_B=new THREE.Vector3(),TMP_C=new THREE.Vector3(),TMP_D=new THREE.Vector3();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function segmentDistance(a0,a1,b0,b1){
  const u=TMP_A.copy(a1).sub(a0),v=TMP_B.copy(b1).sub(b0),w=TMP_C.copy(a0).sub(b0);
  const A=u.dot(u),B=u.dot(v),C=v.dot(v),D=u.dot(w),E=v.dot(w),den=A*C-B*B;
  let sN,sD=den,tN,tD=den;
  if(den<1e-8){sN=0;sD=1;tN=E;tD=C;}else{sN=B*E-C*D;tN=A*E-B*D;if(sN<0){sN=0;tN=E;tD=C;}else if(sN>sD){sN=sD;tN=E+B;tD=C;}}
  if(tN<0){tN=0;if(-D<0)sN=0;else if(-D>A)sN=sD;else{sN=-D;sD=A;}}
  else if(tN>tD){tN=tD;if((-D+B)<0)sN=0;else if((-D+B)>A)sN=sD;else{sN=-D+B;sD=A;}}
  const sc=Math.abs(sN)<1e-8?0:sN/sD,tc=Math.abs(tN)<1e-8?0:tN/tD;
  return TMP_D.copy(w).addScaledVector(u,sc).addScaledVector(v,-tc).length();
}

/** Lightweight humanoid proxy guard: capsules/spheres follow normalized bones. */
export class SelfCollisionConstraint {
  constructor({vrm,getBone,modelHeight}){
    this.vrm=vrm;this.getBone=getBone;this.h=modelHeight;this.rejected=0;this.lastViolations=[];
    this.pairs=[
      ['rightUpperArm','torso'],['rightForearm','torso'],['rightHand','torso'],['rightForearm','head'],['rightHand','head'],
      ['leftUpperArm','torso'],['leftForearm','torso'],['leftHand','torso'],['leftForearm','head'],['leftHand','head'],
      ['leftThigh','rightThigh'],['leftShin','rightShin'],['leftThigh','rightShin'],['rightThigh','leftShin'],
    ];
    this.baseline=new Map();
    this.calibrate();
  }

  bone(name){return this.getBone?.(name)||null;}
  proxy(name){
    const h=this.h;
    const defs={
      torso:['spine','upperChest',.115],head:['neck','head',.085],pelvis:['hips','spine',.10],
      leftUpperArm:['leftUpperArm','leftLowerArm',.045],rightUpperArm:['rightUpperArm','rightLowerArm',.045],
      leftForearm:['leftLowerArm','leftHand',.038],rightForearm:['rightLowerArm','rightHand',.038],
      leftHand:['leftHand','leftIndexProximal',.042],rightHand:['rightHand','rightIndexProximal',.042],
      leftThigh:['leftUpperLeg','leftLowerLeg',.058],rightThigh:['rightUpperLeg','rightLowerLeg',.058],
      leftShin:['leftLowerLeg','leftFoot',.047],rightShin:['rightLowerLeg','rightFoot',.047],
    };
    const d=defs[name];if(!d)return null;
    const a=this.bone(d[0]),b=this.bone(d[1])||a;if(!a||!b)return null;
    return {a:a.getWorldPosition(new THREE.Vector3()),b:b.getWorldPosition(new THREE.Vector3()),r:d[2]*h};
  }
  key(a,b){return `${a}|${b}`;}
  measure(a,b){const A=this.proxy(a),B=this.proxy(b);if(!A||!B)return null;return {distance:segmentDistance(A.a,A.b,B.a,B.b),radius:A.r+B.r};}
  calibrate(){
    this.vrm?.scene?.updateMatrixWorld?.(true);
    this.baseline.clear();
    for(const [a,b] of this.pairs){const m=this.measure(a,b);if(m)this.baseline.set(this.key(a,b),m.radius-m.distance);}
  }
  ignored(action,a,b){
    if(action==='crouch' && ((a.endsWith('Hand')&&b==='head')||(b.endsWith('Hand')&&a==='head'))) return true;
    return false;
  }
  check(action='idle'){
    this.vrm?.scene?.updateMatrixWorld?.(true);
    const out=[];
    for(const [a,b] of this.pairs){
      if(this.ignored(action,a,b))continue;
      const m=this.measure(a,b);if(!m)continue;
      const penetration=m.radius-m.distance;
      const baseline=this.baseline.get(this.key(a,b))||0;
      const allowed=Math.max(0,baseline)+this.h*.012;
      if(penetration>allowed)out.push({a,b,penetration,allowed});
    }
    this.lastViolations=out;return out;
  }
  snapshot(names){const m=new Map();for(const n of names){const b=this.bone(n);if(b)m.set(n,b.quaternion.clone());}return m;}
  restore(snapshot){for(const [n,q] of snapshot){const b=this.bone(n);if(b)b.quaternion.copy(q);}this.vrm?.scene?.updateMatrixWorld?.(true);}
  attempt({action='idle',bones=[],apply}){
    const snap=this.snapshot(bones);
    for(const scale of [1,.65,.35]){
      this.restore(snap);apply(scale);this.vrm?.scene?.updateMatrixWorld?.(true);
      if(this.check(action).length===0)return {ok:true,scale};
    }
    this.restore(snap);this.rejected++;return {ok:false,scale:0,violations:this.lastViolations};
  }
  state(){return {solver:'humanoid-capsule-proxy-v1',rejected:this.rejected,lastViolations:this.lastViolations};}
}
