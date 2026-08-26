import * as THREE from 'three';

const dampAngle = (current, target, lambda, dt) => {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * (1 - Math.exp(-lambda * dt));
};

/** Exclusive owner of VRM root yaw. */
export class FacingController {
  constructor(root) {
    if (!root) throw new Error('FacingController requires root');
    this.root = root;
    this.manualBaseYaw = 0;
    this.lockedYaw = null;
  }

  setManualYawDegrees(degrees = 0) {
    this.manualBaseYaw = THREE.MathUtils.degToRad(Number(degrees) || 0);
    if (this.lockedYaw == null) this.root.rotation.y = this.manualBaseYaw;
  }

  faceDirection(direction, dt, lambda = 7) {
    if (this.lockedYaw != null) {
      this.root.rotation.y = this.lockedYaw;
      return this.lockedYaw;
    }
    if (!direction || direction.lengthSq() < 1e-8) return this.root.rotation.y;
    // CharacterFrame forward is local +Z.
    const target = this.manualBaseYaw + Math.atan2(direction.x, direction.z);
    this.root.rotation.y = dampAngle(this.root.rotation.y, target, lambda, dt);
    return this.root.rotation.y;
  }

  lockCurrent() {
    this.lockedYaw = this.root.rotation.y;
    return this.lockedYaw;
  }

  unlock() {
    this.lockedYaw = null;
  }

  tick() {
    if (this.lockedYaw != null) this.root.rotation.y = this.lockedYaw;
  }

  state() {
    return { yaw: this.root.rotation.y, locked: this.lockedYaw != null, baseYaw: this.manualBaseYaw };
  }
}
