import * as THREE from 'three';

/**
 * Single source of truth for NIVA character-space directions.
 * Contract for NIVA.vrm/runtime:
 *   local +X = character right
 *   local +Y = character up
 *   local +Z = character forward
 *
 * No animated bone may participate in deriving this frame.
 */
export class CharacterFrame {
  constructor(root) {
    if (!root) throw new Error('CharacterFrame requires a VRM root Object3D');
    this.root = root;
    this.localForward = new THREE.Vector3(0, 0, 1);
    this.localRight = new THREE.Vector3(1, 0, 0);
    this.localUp = new THREE.Vector3(0, 1, 0);
    this._forward = new THREE.Vector3(0, 0, 1);
    this._right = new THREE.Vector3(1, 0, 0);
    this._up = new THREE.Vector3(0, 1, 0);
  }

  yaw() {
    return this.root.rotation.y;
  }

  basis() {
    const yaw = this.yaw();
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    this._forward.set(s, 0, c).normalize();
    this._right.set(c, 0, -s).normalize();
    this._up.set(0, 1, 0);
    return {
      forward: this._forward.clone(),
      right: this._right.clone(),
      up: this._up.clone(),
      yaw,
    };
  }

  forward(out = new THREE.Vector3()) {
    const { forward } = this.basis();
    return out.copy(forward);
  }

  right(out = new THREE.Vector3()) {
    const { right } = this.basis();
    return out.copy(right);
  }

  up(out = new THREE.Vector3()) {
    return out.set(0, 1, 0);
  }

  directionFromLocal(x, y, z, out = new THREE.Vector3()) {
    const { right, up, forward } = this.basis();
    return out.set(0, 0, 0)
      .addScaledVector(right, x)
      .addScaledVector(up, y)
      .addScaledVector(forward, z);
  }

  describe() {
    const { forward, right, up, yaw } = this.basis();
    const f = (v) => v.toArray().map((n) => Number(n.toFixed(3)));
    return {
      contract: '+X right / +Y up / +Z forward',
      yaw,
      forward: f(forward),
      right: f(right),
      up: f(up),
    };
  }
}
