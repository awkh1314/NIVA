import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));

function v3(v) { return new THREE.Vector3(v.x, v.y, v.z); }
function rapierVec(v) { return { x: v.x, y: v.y, z: v.z }; }

export class NivaPhysicsBodySystem {
  static async create(options) {
    await RAPIER.init();
    const system = new NivaPhysicsBodySystem(options);
    system.init();
    return system;
  }

  constructor({ vrm, getBone, modelHeight, rootHome, stageRadius = 1.55 }) {
    this.vrm = vrm;
    this.getBone = getBone;
    this.modelHeight = modelHeight;
    this.rootHome = rootHome.clone();
    this.stageRadius = stageRadius;
    this.world = null;
    this.characterBody = null;
    this.characterCollider = null;
    this.characterController = null;
    this.groundBody = null;
    this.groundCollider = null;
    this.characterRadius = Math.max(0.12, modelHeight * 0.14);
    this.characterHalfHeight = Math.max(0.22, modelHeight * 0.22);
    this.characterCenterOffset = this.characterHalfHeight + this.characterRadius;
    this.groundY = 0;
    this.postureOffset = 0;
    this.targetPostureOffset = 0;
    this.grounded = true;
    this.enabled = true;
    this.ikEnabled = true;
    this.ikStrength = 0.9;
    this.footOffset = { left: 0.08, right: 0.08 };
    this.footAnchor = { left: null, right: null };
    this.lastStance = { left: false, right: false };
    this.lastAction = 'idle';
    this.lastGroundNormal = new THREE.Vector3(0, 1, 0);
    this.tmp = {
      p0: new THREE.Vector3(), p1: new THREE.Vector3(), p2: new THREE.Vector3(),
      q0: new THREE.Quaternion(), q1: new THREE.Quaternion(), q2: new THREE.Quaternion(),
      a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(),
    };
  }

  init() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.rebuildGround(this.stageRadius);

    const root = this.vrm.scene.position;
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      root.x,
      this.groundY + this.characterCenterOffset,
      root.z,
    );
    this.characterBody = this.world.createRigidBody(bodyDesc);
    this.characterCollider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(this.characterHalfHeight, this.characterRadius)
        .setFriction(0.9)
        .setRestitution(0),
      this.characterBody,
    );

    this.characterController = this.world.createCharacterController(0.015);
    this.characterController.enableSnapToGround(0.12);
    this.characterController.enableAutostep(Math.min(0.18, this.modelHeight * 0.1), 0.08, false);
    this.characterController.setMaxSlopeClimbAngle(Math.PI * 0.28);
    this.characterController.setMinSlopeSlideAngle(Math.PI * 0.34);
    this.characterController.setSlideEnabled(true);

    this.vrm.scene.updateMatrixWorld(true);
    for (const side of ['left', 'right']) {
      const foot = this.getBone(`${side}Foot`);
      if (foot) {
        const p = foot.getWorldPosition(new THREE.Vector3());
        this.footOffset[side] = Math.max(0.025, p.y - this.groundY);
      }
    }
  }

  rebuildGround(radius) {
    this.stageRadius = Math.max(0.45, radius || 1.55);
    if (this.groundCollider) {
      try { this.world.removeCollider(this.groundCollider, true); } catch {}
      this.groundCollider = null;
    }
    if (!this.groundBody) {
      this.groundBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.045, 0));
    }
    this.groundCollider = this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.045, this.stageRadius).setFriction(1.0).setRestitution(0),
      this.groundBody,
    );
  }

  configure({ enabled = true, ikEnabled = true, ikStrength = 0.9 } = {}) {
    this.enabled = enabled;
    this.ikEnabled = ikEnabled;
    this.ikStrength = clamp(ikStrength, 0, 1);
  }

  syncManualRoot(x, z) {
    if (!this.characterBody) return;
    const t = this.characterBody.translation();
    this.characterBody.setNextKinematicTranslation({ x, y: t.y, z });
  }

  move(dt, direction, speed) {
    if (!this.enabled || !this.characterBody || !this.characterCollider) return new THREE.Vector3();
    const dir = direction?.clone?.() || new THREE.Vector3();
    dir.y = 0;
    if (dir.lengthSq() > 1e-7) dir.normalize();

    const desired = {
      x: dir.x * speed * dt,
      y: -Math.min(0.06, 9.81 * dt * dt * 1.5),
      z: dir.z * speed * dt,
    };
    this.characterController.computeColliderMovement(this.characterCollider, desired);
    const mv = this.characterController.computedMovement();
    this.grounded = Boolean(this.characterController.computedGrounded?.());
    const p = this.characterBody.translation();
    this.characterBody.setNextKinematicTranslation({ x: p.x + mv.x, y: p.y + mv.y, z: p.z + mv.z });
    this.world.timestep = clamp(dt, 1 / 120, 1 / 30);
    this.world.step();
    const next = this.characterBody.translation();
    this.vrm.scene.position.x = next.x;
    this.vrm.scene.position.z = next.z;
    this.groundY = next.y - this.characterCenterOffset;
    return new THREE.Vector3(mv.x, mv.y, mv.z);
  }

  holdPosition(dt) {
    if (!this.enabled || !this.characterBody || !this.characterCollider) return;
    this.characterController.computeColliderMovement(this.characterCollider, { x: 0, y: -Math.min(0.04, 9.81 * dt * dt), z: 0 });
    const mv = this.characterController.computedMovement();
    this.grounded = Boolean(this.characterController.computedGrounded?.());
    const p = this.characterBody.translation();
    this.characterBody.setNextKinematicTranslation({ x: p.x + mv.x, y: p.y + mv.y, z: p.z + mv.z });
    this.world.timestep = clamp(dt, 1 / 120, 1 / 30);
    this.world.step();
    const next = this.characterBody.translation();
    this.groundY = next.y - this.characterCenterOffset;
  }

  groundHitAt(worldPoint) {
    if (!this.world) return null;
    const origin = { x: worldPoint.x, y: worldPoint.y + 0.45, z: worldPoint.z };
    const ray = new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRayAndGetNormal(
      ray,
      1.25,
      true,
      undefined,
      undefined,
      this.characterCollider,
      this.characterBody,
    );
    if (!hit) return null;
    const toi = hit.timeOfImpact ?? hit.toi ?? 0;
    return {
      point: new THREE.Vector3(origin.x, origin.y - toi, origin.z),
      normal: v3(hit.normal || { x: 0, y: 1, z: 0 }).normalize(),
    };
  }

  captureFoot(side) {
    const foot = this.getBone(`${side}Foot`);
    if (!foot) return null;
    this.vrm.scene.updateMatrixWorld(true);
    const p = foot.getWorldPosition(new THREE.Vector3());
    const hit = this.groundHitAt(p);
    const target = hit?.point || new THREE.Vector3(p.x, this.groundY, p.z);
    target.y += this.footOffset[side];
    this.footAnchor[side] = target;
    if (hit?.normal) this.lastGroundNormal.copy(hit.normal);
    return target;
  }

  clearFeet() {
    this.footAnchor.left = null;
    this.footAnchor.right = null;
    this.lastStance.left = false;
    this.lastStance.right = false;
  }

  stanceFor(action, phase, side) {
    if (action === 'crouch' || action === 'recovery') return true;
    if (action === 'walk') {
      if (side === 'left') return phase < 0.54 || phase > 0.98;
      return phase > 0.46;
    }
    if (action === 'run') {
      if (side === 'left') return phase < 0.24 || phase > 0.96;
      return phase > 0.46 && phase < 0.74;
    }
    return false;
  }

  setPosture(action, dt, crouchDepth = 0.19) {
    const target = action === 'crouch'
      ? -this.modelHeight * clamp(crouchDepth, 0.08, 0.28)
      : action === 'recovery'
        ? -this.modelHeight * 0.105
        : 0;
    this.targetPostureOffset = target;
    this.postureOffset = damp(this.postureOffset, this.targetPostureOffset, action === 'crouch' ? 7.5 : 5.5, dt);
    this.vrm.scene.position.y = this.groundY + this.postureOffset;
  }

  solvePostAnimation(dt, { action = 'idle', actionTime = 0, duration = 1, crouchDepth = 0.19 } = {}) {
    if (!this.enabled || !this.vrm) return;
    this.setPosture(action, dt, crouchDepth);
    this.vrm.scene.updateMatrixWorld(true);

    if (action !== this.lastAction) {
      if (!['crouch', 'recovery'].includes(action)) this.clearFeet();
      this.lastAction = action;
    }

    if (!this.ikEnabled) return;
    const phase = duration > 0 ? ((actionTime % duration) / duration + 1) % 1 : 0;
    for (const side of ['left', 'right']) {
      const stance = this.stanceFor(action, phase, side);
      if (stance && !this.lastStance[side]) this.captureFoot(side);
      if (!stance && this.lastStance[side] && !['crouch', 'recovery'].includes(action)) this.footAnchor[side] = null;
      this.lastStance[side] = stance;
      if (stance && this.footAnchor[side]) this.solveLeg(side, this.footAnchor[side], this.ikStrength);
    }

    if (action === 'recovery') this.solveHandsToKnees(0.82);
  }

  rotateBoneTowardEnd(bone, end, target, weight = 1, maxStep = 0.22) {
    if (!bone || !end || !bone.parent) return;
    this.vrm.scene.updateMatrixWorld(true);
    const bonePos = bone.getWorldPosition(this.tmp.p0);
    const endPos = end.getWorldPosition(this.tmp.p1);
    const a = this.tmp.a.copy(endPos).sub(bonePos);
    const b = this.tmp.b.copy(target).sub(bonePos);
    if (a.lengthSq() < 1e-8 || b.lengthSq() < 1e-8) return;
    a.normalize(); b.normalize();
    let angle = Math.acos(clamp(a.dot(b), -1, 1));
    if (angle < 1e-4) return;
    angle = Math.min(angle * weight, maxStep);
    const axis = this.tmp.c.copy(a).cross(b);
    if (axis.lengthSq() < 1e-8) return;
    axis.normalize();
    const deltaWorld = this.tmp.q0.setFromAxisAngle(axis, angle);
    const boneWorld = bone.getWorldQuaternion(this.tmp.q1);
    const desiredWorld = this.tmp.q2.copy(deltaWorld).multiply(boneWorld);
    const parentWorld = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const desiredLocal = parentWorld.invert().multiply(desiredWorld);
    bone.quaternion.slerp(desiredLocal, clamp(weight, 0, 1));
  }

  solveLeg(side, target, weight = 1) {
    const upper = this.getBone(`${side}UpperLeg`);
    const lower = this.getBone(`${side}LowerLeg`);
    const foot = this.getBone(`${side}Foot`);
    if (!upper || !lower || !foot) return;
    const w = clamp(weight, 0, 1);
    for (let i = 0; i < 4; i++) {
      this.rotateBoneTowardEnd(lower, foot, target, 0.62 * w, 0.16);
      this.rotateBoneTowardEnd(upper, foot, target, 0.48 * w, 0.13);
    }
  }

  solveArm(side, target, weight = 1) {
    const upper = this.getBone(`${side}UpperArm`);
    const lower = this.getBone(`${side}LowerArm`);
    const hand = this.getBone(`${side}Hand`);
    if (!upper || !lower || !hand) return;
    for (let i = 0; i < 4; i++) {
      this.rotateBoneTowardEnd(lower, hand, target, 0.55 * weight, 0.18);
      this.rotateBoneTowardEnd(upper, hand, target, 0.42 * weight, 0.14);
    }
  }

  solveHandsToKnees(weight = 0.8) {
    this.vrm.scene.updateMatrixWorld(true);
    const rootQuat = this.vrm.scene.getWorldQuaternion(new THREE.Quaternion());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rootQuat);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQuat);
    for (const side of ['left', 'right']) {
      const knee = this.getBone(`${side}LowerLeg`);
      if (!knee) continue;
      const target = knee.getWorldPosition(new THREE.Vector3())
        .addScaledVector(right, side === 'left' ? -0.06 : 0.06)
        .addScaledVector(forward, 0.035)
        .add(new THREE.Vector3(0, 0.025, 0));
      this.solveArm(side, target, weight);
    }
  }

  state() {
    return {
      ready: Boolean(this.world && this.characterBody),
      grounded: this.grounded,
      physics: this.enabled,
      footIK: this.ikEnabled,
      postureOffset: this.postureOffset,
      leftFootPlanted: Boolean(this.footAnchor.left),
      rightFootPlanted: Boolean(this.footAnchor.right),
    };
  }
}
