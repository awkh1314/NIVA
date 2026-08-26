import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));

function v3(v) { return new THREE.Vector3(v.x, v.y, v.z); }

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
      p0: new THREE.Vector3(), p1: new THREE.Vector3(), p2: new THREE.Vector3(), p3: new THREE.Vector3(),
      q0: new THREE.Quaternion(), q1: new THREE.Quaternion(), q2: new THREE.Quaternion(),
      a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(),
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

  bodyBasis() {
    this.vrm.scene.updateMatrixWorld(true);
    const l = this.getBone('leftUpperArm');
    const r = this.getBone('rightUpperArm');
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.vrm.scene.getWorldQuaternion(new THREE.Quaternion())).normalize();
    let right;
    if (l && r) {
      right = r.getWorldPosition(new THREE.Vector3()).sub(l.getWorldPosition(new THREE.Vector3())).normalize();
    } else {
      right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.vrm.scene.getWorldQuaternion(new THREE.Quaternion())).normalize();
    }
    let forward = right.clone().cross(up).normalize();
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1).applyQuaternion(this.vrm.scene.quaternion).normalize();
    return { right, up, forward };
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

  captureBothFeet() {
    this.clearFeet();
    this.captureFoot('left');
    this.captureFoot('right');
    this.lastStance.left = true;
    this.lastStance.right = true;
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
      if (side === 'left') return phase < 0.22 || phase > 0.96;
      return phase > 0.47 && phase < 0.72;
    }
    return false;
  }

  setPosture(action, dt, crouchDepth = 0.19) {
    const target = action === 'crouch'
      ? -this.modelHeight * clamp(crouchDepth, 0.10, 0.25)
      : action === 'recovery'
        ? -this.modelHeight * 0.10
        : 0;
    this.targetPostureOffset = target;
    this.postureOffset = damp(this.postureOffset, this.targetPostureOffset, action === 'crouch' ? 6.2 : 5.5, dt);
    this.vrm.scene.position.y = this.groundY + this.postureOffset;
  }

  solvePostAnimation(dt, { action = 'idle', actionTime = 0, duration = 1, crouchDepth = 0.19 } = {}) {
    if (!this.enabled || !this.vrm) return;

    const changed = action !== this.lastAction;
    if (changed) {
      // Critical: planted actions capture the standing feet BEFORE the root/pelvis is lowered.
      if (action === 'crouch' || action === 'recovery') this.captureBothFeet();
      else this.clearFeet();
      this.lastAction = action;
    }

    this.setPosture(action, dt, crouchDepth);
    this.vrm.scene.updateMatrixWorld(true);

    const phase = duration > 0 ? ((actionTime % duration) / duration + 1) % 1 : 0;
    if (this.ikEnabled) {
      for (const side of ['left', 'right']) {
        const stance = this.stanceFor(action, phase, side);
        if (stance && !this.lastStance[side]) this.captureFoot(side);
        if (!stance && this.lastStance[side] && !['crouch', 'recovery'].includes(action)) this.footAnchor[side] = null;
        this.lastStance[side] = stance;
        if (stance && this.footAnchor[side]) this.solveLeg(side, this.footAnchor[side], this.ikStrength, action);
      }

      if (action === 'walk' || action === 'run') this.solveLocomotionArms(action, phase);
      if (action === 'wave') this.solveWavePose(phase);
      if (action === 'recovery') this.solveHandsToKnees(0.86);
    }
  }

  setBoneWorldQuaternion(bone, desiredWorld, weight = 1) {
    if (!bone || !bone.parent) return;
    const parentWorld = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const desiredLocal = parentWorld.invert().multiply(desiredWorld);
    bone.quaternion.slerp(desiredLocal, clamp(weight, 0, 1));
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
    this.setBoneWorldQuaternion(bone, desiredWorld, weight);
  }

  applyPole(root, mid, end, target, pole, weight = 1) {
    if (!root || !mid || !end || !pole) return;
    this.vrm.scene.updateMatrixWorld(true);
    const rootPos = root.getWorldPosition(new THREE.Vector3());
    const midPos = mid.getWorldPosition(new THREE.Vector3());
    const axis = target.clone().sub(rootPos);
    if (axis.lengthSq() < 1e-8) return;
    axis.normalize();

    const knee = midPos.sub(rootPos);
    const wanted = pole.clone().sub(rootPos);
    knee.addScaledVector(axis, -knee.dot(axis));
    wanted.addScaledVector(axis, -wanted.dot(axis));
    if (knee.lengthSq() < 1e-8 || wanted.lengthSq() < 1e-8) return;
    knee.normalize(); wanted.normalize();
    const cross = knee.clone().cross(wanted);
    let angle = Math.atan2(axis.dot(cross), clamp(knee.dot(wanted), -1, 1));
    angle = clamp(angle, -0.28, 0.28) * clamp(weight, 0, 1);
    if (Math.abs(angle) < 1e-4) return;
    const worldQ = root.getWorldQuaternion(new THREE.Quaternion());
    const delta = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    this.setBoneWorldQuaternion(root, delta.multiply(worldQ), weight);
  }

  solveChain(root, mid, end, target, pole, weight = 1, iterations = 4) {
    const w = clamp(weight, 0, 1);
    for (let i = 0; i < iterations; i++) {
      this.rotateBoneTowardEnd(mid, end, target, 0.72 * w, 0.14);
      this.rotateBoneTowardEnd(root, end, target, 0.58 * w, 0.12);
      this.applyPole(root, mid, end, target, pole, 0.55 * w);
    }
    this.rotateBoneTowardEnd(mid, end, target, 0.55 * w, 0.10);
  }

  solveLeg(side, target, weight = 1, action = 'idle') {
    const upper = this.getBone(`${side}UpperLeg`);
    const lower = this.getBone(`${side}LowerLeg`);
    const foot = this.getBone(`${side}Foot`);
    if (!upper || !lower || !foot) return;
    const { right, forward } = this.bodyBasis();
    const sign = side === 'left' ? -1 : 1;
    const hip = upper.getWorldPosition(new THREE.Vector3());
    const kneePole = hip.clone()
      .addScaledVector(forward, this.modelHeight * (action === 'crouch' ? 0.34 : 0.27))
      .addScaledVector(right, sign * this.modelHeight * 0.055)
      .add(new THREE.Vector3(0, -this.modelHeight * 0.10, 0));
    this.solveChain(upper, lower, foot, target, kneePole, weight, action === 'crouch' ? 6 : 4);
  }

  solveArm(side, target, weight = 1, pole = null) {
    const upper = this.getBone(`${side}UpperArm`);
    const lower = this.getBone(`${side}LowerArm`);
    const hand = this.getBone(`${side}Hand`);
    if (!upper || !lower || !hand) return;
    const { right, forward } = this.bodyBasis();
    const sign = side === 'left' ? -1 : 1;
    const root = upper.getWorldPosition(new THREE.Vector3());
    const elbowPole = pole || root.clone()
      .addScaledVector(right, sign * this.modelHeight * 0.24)
      .addScaledVector(forward, this.modelHeight * 0.06)
      .add(new THREE.Vector3(0, -this.modelHeight * 0.08, 0));
    this.solveChain(upper, lower, hand, target, elbowPole, weight, 5);
  }

  armLength(side) {
    const upper = this.getBone(`${side}UpperArm`);
    const lower = this.getBone(`${side}LowerArm`);
    const hand = this.getBone(`${side}Hand`);
    if (!upper || !lower || !hand) return this.modelHeight * 0.32;
    this.vrm.scene.updateMatrixWorld(true);
    const a = upper.getWorldPosition(new THREE.Vector3());
    const b = lower.getWorldPosition(new THREE.Vector3());
    const c = hand.getWorldPosition(new THREE.Vector3());
    return Math.max(this.modelHeight * 0.22, a.distanceTo(b) + b.distanceTo(c));
  }

  solveLocomotionArms(action, phase) {
    const { right, up, forward } = this.bodyBasis();
    const down = up.clone().multiplyScalar(-1);
    const run = action === 'run';
    const wave = Math.cos(phase * Math.PI * 2);
    for (const side of ['left', 'right']) {
      const upper = this.getBone(`${side}UpperArm`);
      if (!upper) continue;
      const sign = side === 'left' ? -1 : 1;
      // Arms counter-swing the opposite leg. At phase 0 the right arm is forward.
      const gait = sign * wave;
      const len = this.armLength(side);
      const root = upper.getWorldPosition(new THREE.Vector3());
      const target = root.clone()
        .addScaledVector(down, len * (run ? 0.66 : 0.82))
        .addScaledVector(forward, gait * len * (run ? 0.38 : 0.22))
        .addScaledVector(right, sign * len * (run ? 0.08 : 0.06));
      const pole = root.clone()
        .addScaledVector(right, sign * len * 0.72)
        .addScaledVector(forward, gait * len * 0.10)
        .addScaledVector(down, len * 0.18);
      this.solveArm(side, target, run ? 0.90 : 0.72, pole);
    }
  }

  solveWavePose(phase) {
    const upper = this.getBone('rightUpperArm');
    const head = this.getBone('head');
    if (!upper || !head) return;
    const { right, up, forward } = this.bodyBasis();
    const enter = clamp(phase / 0.17, 0, 1);
    const leave = clamp((1 - phase) / 0.18, 0, 1);
    const blend = Math.min(enter, leave);
    if (blend <= 0.01) return;
    const headPos = head.getWorldPosition(new THREE.Vector3());
    const sway = Math.sin(clamp((phase - 0.24) / 0.52, 0, 1) * Math.PI * 5) * this.modelHeight * 0.022;
    const target = headPos.clone()
      .addScaledVector(right, this.modelHeight * 0.25 + sway)
      .addScaledVector(up, this.modelHeight * 0.015)
      .addScaledVector(forward, this.modelHeight * 0.035);
    const root = upper.getWorldPosition(new THREE.Vector3());
    const pole = root.clone()
      .addScaledVector(right, this.modelHeight * 0.28)
      .addScaledVector(forward, this.modelHeight * 0.10)
      .addScaledVector(up, this.modelHeight * 0.03);
    this.solveArm('right', target, 0.90 * blend, pole);
  }

  solveHandsToKnees(weight = 0.8) {
    this.vrm.scene.updateMatrixWorld(true);
    const { right, forward, up } = this.bodyBasis();
    for (const side of ['left', 'right']) {
      const knee = this.getBone(`${side}LowerLeg`);
      const upper = this.getBone(`${side}UpperArm`);
      if (!knee || !upper) continue;
      const sign = side === 'left' ? -1 : 1;
      const target = knee.getWorldPosition(new THREE.Vector3())
        .addScaledVector(right, sign * this.modelHeight * 0.025)
        .addScaledVector(forward, this.modelHeight * 0.025)
        .addScaledVector(up, this.modelHeight * 0.018);
      const pole = upper.getWorldPosition(new THREE.Vector3())
        .addScaledVector(right, sign * this.modelHeight * 0.20)
        .addScaledVector(forward, this.modelHeight * 0.10)
        .addScaledVector(up, -this.modelHeight * 0.04);
      this.solveArm(side, target, weight, pole);
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
      solver: 'pole-guided-ccd-v3',
    };
  }
}
