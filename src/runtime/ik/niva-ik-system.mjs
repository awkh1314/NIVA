import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Sole owner of post-animation limb IK.
 * It may rotate normalized humanoid limb bones.
 * It must never change VRM root position or root yaw.
 */
export class NivaIKSystem {
  constructor({ vrm, getBone, frame, modelHeight }) {
    this.vrm = vrm;
    this.getBone = getBone;
    this.frame = frame;
    this.modelHeight = modelHeight;
    this.enabled = true;
    this.footEnabled = true;
    this.actionEnabled = true;
    this.strength = 0.9;
    this.lastAction = 'idle';
    this.crouchReference = null;
    this.lastGroundNormal = new THREE.Vector3(0, 1, 0);
  }

  configure({ enabled = true, footEnabled = true, actionEnabled = true, strength = 0.9 } = {}) {
    this.enabled = enabled;
    this.footEnabled = footEnabled;
    this.actionEnabled = actionEnabled;
    this.strength = clamp(strength, 0, 1);
  }

  setBoneWorldQuaternion(bone, desiredWorld, weight = 1) {
    if (!bone?.parent) return;
    const parentWorld = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const desiredLocal = parentWorld.invert().multiply(desiredWorld);
    bone.quaternion.slerp(desiredLocal, clamp(weight, 0, 1));
  }

  rotateBoneTowardEnd(bone, end, target, weight = 1, maxStep = 0.22) {
    if (!bone || !end || !bone.parent) return;
    this.vrm.scene.updateMatrixWorld(true);
    const bonePos = bone.getWorldPosition(new THREE.Vector3());
    const endPos = end.getWorldPosition(new THREE.Vector3());
    const a = endPos.sub(bonePos);
    const b = target.clone().sub(bonePos);
    if (a.lengthSq() < 1e-8 || b.lengthSq() < 1e-8) return;
    a.normalize(); b.normalize();
    let angle = Math.acos(clamp(a.dot(b), -1, 1));
    if (angle < 1e-4) return;
    angle = Math.min(angle * weight, maxStep);
    const axis = a.clone().cross(b);
    if (axis.lengthSq() < 1e-8) return;
    axis.normalize();
    const deltaWorld = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    const boneWorld = bone.getWorldQuaternion(new THREE.Quaternion());
    this.setBoneWorldQuaternion(bone, deltaWorld.multiply(boneWorld), weight);
  }

  applyPole(root, mid, end, target, pole, weight = 1) {
    if (!root || !mid || !end || !pole) return;
    this.vrm.scene.updateMatrixWorld(true);
    const rootPos = root.getWorldPosition(new THREE.Vector3());
    const midPos = mid.getWorldPosition(new THREE.Vector3());
    const axis = target.clone().sub(rootPos);
    if (axis.lengthSq() < 1e-8) return;
    axis.normalize();
    const current = midPos.sub(rootPos);
    const wanted = pole.clone().sub(rootPos);
    current.addScaledVector(axis, -current.dot(axis));
    wanted.addScaledVector(axis, -wanted.dot(axis));
    if (current.lengthSq() < 1e-8 || wanted.lengthSq() < 1e-8) return;
    current.normalize(); wanted.normalize();
    const cross = current.clone().cross(wanted);
    let angle = Math.atan2(axis.dot(cross), clamp(current.dot(wanted), -1, 1));
    angle = clamp(angle, -0.24, 0.24) * clamp(weight, 0, 1);
    if (Math.abs(angle) < 1e-4) return;
    const worldQ = root.getWorldQuaternion(new THREE.Quaternion());
    const delta = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    this.setBoneWorldQuaternion(root, delta.multiply(worldQ), weight);
  }

  solveChain(root, mid, end, target, pole, weight = 1, iterations = 4) {
    const w = clamp(weight, 0, 1);
    for (let i = 0; i < iterations; i++) {
      this.rotateBoneTowardEnd(mid, end, target, 0.72 * w, 0.13);
      this.rotateBoneTowardEnd(root, end, target, 0.58 * w, 0.11);
      this.applyPole(root, mid, end, target, pole, 0.5 * w);
    }
  }

  captureCrouchReference() {
    this.vrm.scene.updateMatrixWorld(true);
    const ref = { kneeDir: {} };
    const { forward } = this.frame.basis();
    for (const side of ['left', 'right']) {
      const upper = this.getBone(`${side}UpperLeg`);
      const lower = this.getBone(`${side}LowerLeg`);
      if (!upper || !lower) continue;
      const hip = upper.getWorldPosition(new THREE.Vector3());
      const knee = lower.getWorldPosition(new THREE.Vector3());
      const d = knee.sub(hip); d.y = 0;
      if (d.lengthSq() < 1e-6) d.copy(forward);
      d.normalize();
      if (d.dot(forward) < 0) d.negate();
      ref.kneeDir[side] = d.clone();
    }
    this.crouchReference = ref;
  }

  solveLeg(side, target, weight = 1, action = 'idle') {
    const upper = this.getBone(`${side}UpperLeg`);
    const lower = this.getBone(`${side}LowerLeg`);
    const foot = this.getBone(`${side}Foot`);
    if (!upper || !lower || !foot || !target) return;
    const { right, forward } = this.frame.basis();
    const sign = side === 'left' ? -1 : 1;
    const hip = upper.getWorldPosition(new THREE.Vector3());
    const kneeDir = action === 'crouch'
      ? (this.crouchReference?.kneeDir?.[side]?.clone() || forward.clone())
      : forward.clone();
    if (kneeDir.dot(forward) < 0) kneeDir.negate();
    const pole = hip.clone()
      .addScaledVector(kneeDir, this.modelHeight * (action === 'crouch' ? 0.11 : 0.24))
      .addScaledVector(right, sign * this.modelHeight * 0.035)
      .add(new THREE.Vector3(0, -this.modelHeight * 0.055, 0));
    this.solveChain(upper, lower, foot, target, pole, weight, action === 'crouch' ? 3 : 4);
  }

  solveArm(side, target, weight = 1, pole = null) {
    const upper = this.getBone(`${side}UpperArm`);
    const lower = this.getBone(`${side}LowerArm`);
    const hand = this.getBone(`${side}Hand`);
    if (!upper || !lower || !hand || !target) return;
    const { right, forward } = this.frame.basis();
    const sign = side === 'left' ? -1 : 1;
    const root = upper.getWorldPosition(new THREE.Vector3());
    const elbowPole = pole || root.clone()
      .addScaledVector(right, sign * this.modelHeight * 0.24)
      .addScaledVector(forward, this.modelHeight * 0.06)
      .add(new THREE.Vector3(0, -this.modelHeight * 0.08, 0));
    this.solveChain(upper, lower, hand, target, elbowPole, weight, 4);
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
    const { right, up, forward } = this.frame.basis();
    const down = up.clone().multiplyScalar(-1);
    const run = action === 'run';
    const wave = Math.cos(phase * Math.PI * 2);
    for (const side of ['left', 'right']) {
      const upper = this.getBone(`${side}UpperArm`);
      if (!upper) continue;
      const sign = side === 'left' ? -1 : 1;
      const gait = sign * wave;
      const len = this.armLength(side);
      const root = upper.getWorldPosition(new THREE.Vector3());
      const target = root.clone()
        .addScaledVector(down, len * (run ? 0.60 : 0.80))
        .addScaledVector(forward, gait * len * (run ? 0.34 : 0.20))
        .addScaledVector(right, sign * len * 0.07);
      const pole = root.clone()
        .addScaledVector(right, sign * len * 0.72)
        .addScaledVector(forward, gait * len * 0.08)
        .addScaledVector(down, len * 0.18);
      this.solveArm(side, target, run ? 0.86 : 0.68, pole);
    }
  }

  solveWavePose(phase) {
    const upper = this.getBone('rightUpperArm');
    const head = this.getBone('head');
    if (!upper || !head) return;
    const { right, up, forward } = this.frame.basis();
    const enter = clamp(phase / 0.17, 0, 1);
    const leave = clamp((1 - phase) / 0.18, 0, 1);
    const blend = Math.min(enter, leave);
    if (blend <= 0.01) return;
    const headPos = head.getWorldPosition(new THREE.Vector3());
    const sway = Math.sin(clamp((phase - 0.24) / 0.52, 0, 1) * Math.PI * 5) * this.modelHeight * 0.02;
    const target = headPos.clone()
      .addScaledVector(right, this.modelHeight * 0.25 + sway)
      .addScaledVector(up, this.modelHeight * 0.015)
      .addScaledVector(forward, this.modelHeight * 0.04);
    const root = upper.getWorldPosition(new THREE.Vector3());
    const pole = root.clone()
      .addScaledVector(right, this.modelHeight * 0.28)
      .addScaledVector(forward, this.modelHeight * 0.09)
      .addScaledVector(up, this.modelHeight * 0.03);
    this.solveArm('right', target, 0.86 * blend, pole);
  }

  solveCrouchHandsToHead(weight = 0.9) {
    const head = this.getBone('head');
    if (!head) return;
    this.vrm.scene.updateMatrixWorld(true);
    const { right, up, forward } = this.frame.basis();
    const headPos = head.getWorldPosition(new THREE.Vector3());
    for (const side of ['left', 'right']) {
      const upper = this.getBone(`${side}UpperArm`);
      if (!upper) continue;
      const sign = side === 'left' ? -1 : 1;
      const target = headPos.clone()
        .addScaledVector(right, sign * this.modelHeight * 0.078)
        .addScaledVector(up, this.modelHeight * 0.018)
        .addScaledVector(forward, -this.modelHeight * 0.05);
      const pole = upper.getWorldPosition(new THREE.Vector3())
        .addScaledVector(right, sign * this.modelHeight * 0.32)
        .addScaledVector(up, this.modelHeight * 0.05);
      this.solveArm(side, target, weight, pole);
    }
  }

  solveHandsToKnees(weight = 0.8) {
    const { right, forward, up } = this.frame.basis();
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

  flattenFoot(side, anchor, groundNormal, weight = 1) {
    const foot = this.getBone(`${side}Foot`);
    const toes = this.getBone(`${side}Toes`);
    if (!foot || !toes) return;
    this.vrm.scene.updateMatrixWorld(true);
    const fp = foot.getWorldPosition(new THREE.Vector3());
    const tp = toes.getWorldPosition(new THREE.Vector3());
    const raw = tp.clone().sub(fp);
    const len = raw.length();
    if (len < 1e-5) return;
    const up = (groundNormal?.clone?.() || this.lastGroundNormal.clone()).normalize();
    this.lastGroundNormal.copy(up);
    const planar = raw.addScaledVector(up, -raw.dot(up));
    if (planar.lengthSq() < 1e-8) planar.copy(this.frame.forward());
    planar.normalize();
    const targetToe = fp.clone().addScaledVector(planar, len);
    if (anchor) targetToe.y = anchor.y;
    this.rotateBoneTowardEnd(foot, toes, targetToe, 0.7 * clamp(weight, 0, 1), 0.09);
  }

  solve(plan = {}) {
    if (!this.enabled || !this.vrm) return;
    const action = plan.action || 'idle';
    const phase = plan.phase || 0;
    const crouchAmount = clamp(plan.crouchAmount || 0, 0, 1);
    if (action !== this.lastAction) {
      if (action === 'crouch') this.captureCrouchReference();
      this.lastAction = action;
    }

    if (this.footEnabled && plan.footAnchors) {
      for (const side of ['left', 'right']) {
        const anchor = plan.footAnchors[side];
        if (!anchor) continue;
        const stance = Boolean(plan.stance?.[side]);
        if (stance) {
          this.solveLeg(side, anchor, this.strength, action);
          this.flattenFoot(side, anchor, plan.groundNormal, action === 'crouch' ? 0.85 : 0.55);
        }
      }
    }

    if (this.actionEnabled) {
      if (action === 'walk' || action === 'run') this.solveLocomotionArms(action, phase);
      if (action === 'wave') this.solveWavePose(phase);
      if (action === 'crouch') this.solveCrouchHandsToHead(0.88 * crouchAmount);
      if (action === 'recovery') this.solveHandsToKnees(0.82);
    }
  }

  state() {
    return { owner: 'normalized humanoid limb IK', solver: 'isolated-ccd-v1', footEnabled: this.footEnabled, actionEnabled: this.actionEnabled, lastAction: this.lastAction };
  }
}
