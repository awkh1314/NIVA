import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GaitBalanceController, HUMANOID_MASS_WEIGHTS, weightedCenterOfMass } from './biomechanics-life.mjs';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));
const v3 = (v) => new THREE.Vector3(v.x, v.y, v.z);

/**
 * Physics ownership contract:
 * - owns Rapier world, character collider, ground collider and VRM root world position
 * - may read foot world positions to create contact targets
 * - MUST NOT rotate humanoid bones
 * - MUST NOT own root yaw
 * - returns a post-animation contact plan for NivaIKSystem
 */
export class NivaPhysicsBodySystem {
  static async create(options) {
    await RAPIER.init();
    const system = new NivaPhysicsBodySystem(options);
    system.init();
    return system;
  }

  constructor({ vrm, getBone = null, getFootWorldPosition = null, modelHeight, rootHome, stageRadius = 1.55 }) {
    this.vrm = vrm;
    this.getBone = getBone; // compatibility: read-only fallback
    this.getFootWorldPosition = getFootWorldPosition;
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
    this.crouchBlend = 0;
    this.grounded = true;
    this.enabled = true;
    this.ikEnabled = true;
    this.ikStrength = 0.9;
    this.footOffset = { left: 0.08, right: 0.08 };
    this.footAnchor = { left: null, right: null };
    this.lastStance = { left: false, right: false };
    this.lastAction = 'idle';
    this.lastGroundNormal = new THREE.Vector3(0, 1, 0);
    this.balanceController = new GaitBalanceController({ modelHeight });
    this.balancePlan = null;
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
      const p = this.readFoot(side);
      if (p) this.footOffset[side] = Math.max(0.025, p.y - this.groundY);
    }
  }

  readFoot(side) {
    const viaAdapter = this.getFootWorldPosition?.(side, new THREE.Vector3());
    if (viaAdapter) return viaAdapter.clone?.() || v3(viaAdapter);
    const foot = this.getBone?.(`${side}Foot`);
    if (!foot) return null;
    this.vrm.scene.updateMatrixWorld(true);
    return foot.getWorldPosition(new THREE.Vector3());
  }

  readBoneWorld(name) {
    const bone = this.getBone?.(name);
    if (!bone) return null;
    this.vrm.scene.updateMatrixWorld(true);
    return bone.getWorldPosition(new THREE.Vector3());
  }

  estimateCenterOfMass() {
    const samples = [];
    for (const [name, mass] of Object.entries(HUMANOID_MASS_WEIGHTS)) {
      const position = this.readBoneWorld(name);
      if (position) samples.push({ mass, position });
    }
    return weightedCenterOfMass(samples);
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
      RAPIER.ColliderDesc.cylinder(0.045, this.stageRadius).setFriction(1).setRestitution(0),
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
    this.characterController.computeColliderMovement(
      this.characterCollider,
      { x: 0, y: -Math.min(0.04, 9.81 * dt * dt), z: 0 },
    );
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
  }

  groundHitAt(worldPoint) {
    if (!this.world) return null;
    const origin = { x: worldPoint.x, y: worldPoint.y + 0.45, z: worldPoint.z };
    const ray = new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRayAndGetNormal(
      ray, 1.25, true, undefined, undefined, this.characterCollider, this.characterBody,
    );
    if (!hit) return null;
    const toi = hit.timeOfImpact ?? hit.toi ?? 0;
    return {
      point: new THREE.Vector3(origin.x, origin.y - toi, origin.z),
      normal: v3(hit.normal || { x: 0, y: 1, z: 0 }).normalize(),
    };
  }

  captureFoot(side) {
    const p = this.readFoot(side);
    if (!p) return null;
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
    if (action === 'walk') return side === 'left' ? (phase < 0.54 || phase > 0.98) : phase > 0.46;
    if (action === 'run') return side === 'left' ? (phase < 0.22 || phase > 0.96) : (phase > 0.47 && phase < 0.72);
    return false;
  }

  setPosture(action, dt, crouchDepth = 0.14) {
    const crouching = action === 'crouch';
    this.crouchBlend = damp(this.crouchBlend, crouching ? 1 : 0, crouching ? 2.1 : 4.8, dt);
    const t = clamp(this.crouchBlend, 0, 1);
    const eased = t * t * (3 - 2 * t);
    if (crouching) {
      const depth = this.modelHeight * clamp(crouchDepth, 0.08, 0.14) * eased;
      this.targetPostureOffset = -depth;
      this.postureOffset = this.targetPostureOffset;
    } else {
      this.targetPostureOffset = action === 'recovery' ? -this.modelHeight * 0.10 : 0;
      this.postureOffset = damp(this.postureOffset, this.targetPostureOffset, 5.5, dt);
    }
    this.vrm.scene.position.y = this.groundY + this.postureOffset + (this.balancePlan?.verticalOffset || 0);
    return eased;
  }

  /**
   * Builds contact/posture data only. NivaIKSystem consumes this plan afterwards.
   */
  solvePostAnimation(dt, { action = 'idle', actionTime = 0, duration = 1, crouchDepth = 0.14 } = {}) {
    if (!this.enabled || !this.vrm) return null;
    const changed = action !== this.lastAction;
    if (changed) {
      if (action === 'crouch' || action === 'recovery') this.captureBothFeet();
      else this.clearFeet();
      this.lastAction = action;
    }
    const crouchAmount = this.setPosture(action, dt, crouchDepth);
    const phase = duration > 0 ? ((actionTime % duration) / duration + 1) % 1 : 0;
    const stance = { left: false, right: false };
    for (const side of ['left', 'right']) {
      const isStance = this.stanceFor(action, phase, side);
      stance[side] = isStance;
      if (isStance && !this.lastStance[side]) this.captureFoot(side);
      if (!isStance && this.lastStance[side] && !['crouch', 'recovery'].includes(action)) this.footAnchor[side] = null;
      this.lastStance[side] = isStance;
    }
    const centerOfMass = this.estimateCenterOfMass();
    const leftFoot = this.readFoot('left');
    const rightFoot = this.readFoot('right');
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.vrm.scene.quaternion).setY(0);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.vrm.scene.quaternion).setY(0);
    if (forward.lengthSq() > 1e-8) forward.normalize();
    if (right.lengthSq() > 1e-8) right.normalize();
    this.balancePlan = this.balanceController.update(dt, {
      action,
      phase,
      stance,
      centerOfMass,
      leftFoot,
      rightFoot,
      forward,
      right,
      grounded: this.grounded,
    });

    // Physics owns root translation. A small visual pelvis shift places the
    // projected COM over the support foot; move()/holdPosition() reset this
    // from the Rapier body on the next frame, so the correction never drifts.
    if (this.balancePlan && this.grounded) {
      this.vrm.scene.position.addScaledVector(right, this.balancePlan.rootShiftRight || 0);
      this.vrm.scene.position.addScaledVector(forward, this.balancePlan.rootShiftForward || 0);
    }

    return {
      owner: 'physics-contact-plan',
      action,
      phase,
      crouchAmount,
      stance,
      footAnchors: {
        left: this.footAnchor.left?.clone?.() || null,
        right: this.footAnchor.right?.clone?.() || null,
      },
      groundNormal: this.lastGroundNormal.clone(),
      grounded: this.grounded,
      postureOffset: this.postureOffset,
      balance: this.balancePlan ? { ...this.balancePlan } : null,
    };
  }

  state() {
    return {
      ready: Boolean(this.world && this.characterBody),
      grounded: this.grounded,
      physics: this.enabled,
      contactPlanning: true,
      postureOffset: this.postureOffset,
      leftFootPlanted: Boolean(this.footAnchor.left),
      rightFootPlanted: Boolean(this.footAnchor.right),
      owner: 'Rapier + root position + ground contacts + COM balance plan',
      centerOfMass: this.balancePlan?.com || null,
      balance: this.balancePlan ? { ...this.balancePlan } : null,
      solver: 'physics-balance-v2',
    };
  }
}
