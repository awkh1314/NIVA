import * as THREE from 'three';

// Adapted for NIVA from hh-hang/three-player-controller FootIK twoBoneIK (MIT).
// NIVA keeps the solver independent from Physics and from action selection.
const EPS = 1e-6;
const clamp = THREE.MathUtils.clamp;

export function createTwoBoneIKScratch() {
  return {
    v1:new THREE.Vector3(),v2:new THREE.Vector3(),v3:new THREE.Vector3(),v4:new THREE.Vector3(),
    v5:new THREE.Vector3(),v6:new THREE.Vector3(),v7:new THREE.Vector3(),v8:new THREE.Vector3(),
    v9:new THREE.Vector3(),v10:new THREE.Vector3(),v11:new THREE.Vector3(),v12:new THREE.Vector3(),
    q1:new THREE.Quaternion(),q2:new THREE.Quaternion(),q3:new THREE.Quaternion(),identity:new THREE.Quaternion(),
  };
}

function reachFromBend(a,b,bend){
  return Math.sqrt(Math.max(EPS,a*a+b*b+2*a*b*Math.cos(bend)));
}

function normalizeProjected(direction, chainDir, out){
  out.copy(direction).addScaledVector(chainDir,-direction.dot(chainDir));
  const l2=out.lengthSq();
  if(l2<EPS) return false;
  out.multiplyScalar(1/Math.sqrt(l2));
  return true;
}

function restPole(chain,s){
  const hip=chain.root.getWorldPosition(s.v9);
  const knee=chain.mid.getWorldPosition(s.v10);
  const end=chain.end.getWorldPosition(s.v11);
  const axis=s.v12.copy(end).sub(hip).normalize();
  const raw=s.v8.copy(knee).sub(hip);
  if(!normalizeProjected(raw,axis,s.v7)) s.v7.set(0,0,1);
  return s.v7;
}

function stablePole(chain, chainDir, s, { poleDirection=null, planeNormal=null, preferredForward=null }={}){
  const out=s.v7;
  if(poleDirection && normalizeProjected(poleDirection,chainDir,out)){
    if(preferredForward && out.dot(preferredForward)<0) out.negate();
    chain.lastPole ??= new THREE.Vector3(); chain.lastPole.copy(out); return out;
  }
  if(planeNormal){
    out.crossVectors(chainDir,planeNormal);
    if(out.lengthSq()>EPS){
      out.normalize();
      if(preferredForward && out.dot(preferredForward)<0) out.negate();
      chain.lastPole ??= new THREE.Vector3(); chain.lastPole.copy(out); return out;
    }
  }
  if(chain.lastPole && normalizeProjected(chain.lastPole,chainDir,out)) return out;
  const rp=restPole(chain,s);
  if(normalizeProjected(rp,chainDir,out)){
    if(preferredForward && out.dot(preferredForward)<0) out.negate();
    chain.lastPole ??= new THREE.Vector3(); chain.lastPole.copy(out); return out;
  }
  out.set(0,chainDir.z,-chainDir.y);
  if(out.lengthSq()<EPS) out.set(-chainDir.y,chainDir.x,0);
  out.normalize();
  return out;
}

function rotateBoneToward(bone, effectorWorld, targetWorld, weight, s){
  if(!bone?.parent) return;
  const joint=bone.getWorldPosition(s.v10);
  const from=s.v11.copy(effectorWorld).sub(joint);
  const to=s.v12.copy(targetWorld).sub(joint);
  if(from.lengthSq()<EPS||to.lengthSq()<EPS) return;
  from.normalize(); to.normalize();
  const delta=s.q1.setFromUnitVectors(from,to);
  delta.slerp(s.identity,1-clamp(weight,0,1));
  const world=bone.getWorldQuaternion(s.q2);
  const desired=delta.multiply(world);
  const parentWorld=bone.parent.getWorldQuaternion(s.q3);
  bone.quaternion.copy(parentWorld.invert().multiply(desired));
  bone.updateMatrixWorld(true);
}

/**
 * Analytical 2-bone IK. root->mid and mid->end lengths are preserved.
 * The target is clamped by knee/elbow bend limits, so the solver cannot fold a limb through itself.
 */
export function solveTwoBoneIK(chain,target,weight=1,options={}){
  if(!chain?.root||!chain?.mid||!chain?.end||!target||weight<=0.001) return false;
  const s=options.scratch||createTwoBoneIKScratch();
  const minBend=options.minBend??THREE.MathUtils.degToRad(2);
  const maxBend=options.maxBend??THREE.MathUtils.degToRad(145);
  const w=clamp(weight,0,1);

  const hip=chain.root.getWorldPosition(s.v1);
  const knee=chain.mid.getWorldPosition(s.v2);
  const end=chain.end.getWorldPosition(s.v3);
  const upperLen=Math.max(0.0001,hip.distanceTo(knee));
  const lowerLen=Math.max(0.0001,knee.distanceTo(end));
  const toTarget=s.v4.copy(target).sub(hip);
  const distance=toTarget.length();
  if(distance<0.0001) return false;

  const maxReach=reachFromBend(upperLen,lowerLen,minBend);
  const minReach=reachFromBend(upperLen,lowerLen,maxBend);
  const d=clamp(distance,minReach,maxReach);
  const clampedTarget=s.v5.copy(hip).addScaledVector(toTarget,d/distance);
  const chainDir=s.v6.copy(clampedTarget).sub(hip).normalize();
  const pole=stablePole(chain,chainDir,s,options);
  const along=(upperLen*upperLen-lowerLen*lowerLen+d*d)/(2*d);
  const h=Math.sqrt(Math.max(0,upperLen*upperLen-along*along));
  const desiredKnee=s.v8.copy(hip).addScaledVector(chainDir,along).addScaledVector(pole,h);

  rotateBoneToward(chain.root,chain.mid.getWorldPosition(s.v9),desiredKnee,w,s);
  chain.root.updateMatrixWorld(true); chain.mid.updateMatrixWorld(true);
  rotateBoneToward(chain.mid,chain.end.getWorldPosition(s.v9),clampedTarget,w,s);
  chain.mid.updateMatrixWorld(true);
  return true;
}
