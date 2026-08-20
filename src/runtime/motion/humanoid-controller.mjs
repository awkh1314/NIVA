import * as THREE from 'three';

const DEG = Math.PI / 180;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class HumanoidMotionController {
  constructor(vrm) {
    this.vrm = vrm;
    this.targets = new Map();
  }

  getBone(name) {
    return this.vrm?.humanoid?.getNormalizedBoneNode(name) || null;
  }

  setBoneTarget(name, rotation = {}) {
    const bone = this.getBone(name);
    if (!bone) return false;

    this.targets.set(name, {
      bone,
      x: clamp(Number(rotation.x || 0), -90, 90) * DEG,
      y: clamp(Number(rotation.y || 0), -90, 90) * DEG,
      z: clamp(Number(rotation.z || 0), -90, 90) * DEG,
    });
    return true;
  }

  applyPose(pose = {}) {
    for (const [name, rotation] of Object.entries(pose)) {
      this.setBoneTarget(name, rotation);
    }
  }

  update(delta = 0.016, speed = 8) {
    const alpha = 1 - Math.exp(-speed * delta);

    for (const item of this.targets.values()) {
      item.bone.rotation.x = THREE.MathUtils.lerp(item.bone.rotation.x, item.x, alpha);
      item.bone.rotation.y = THREE.MathUtils.lerp(item.bone.rotation.y, item.y, alpha);
      item.bone.rotation.z = THREE.MathUtils.lerp(item.bone.rotation.z, item.z, alpha);
    }
  }

  clear() {
    this.targets.clear();
  }
}
