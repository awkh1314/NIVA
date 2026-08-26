import * as THREE from 'three';

export class NivaVrmAdapter {
  constructor(vrm) {
    if (!vrm?.humanoid) throw new Error('NivaVrmAdapter requires a loaded VRM humanoid');
    this.vrm = vrm;
    this.root = vrm.scene;
    this._bones = new Map();
    this._bindQuaternions = new Map();
  }

  bone(name) {
    if (!this._bones.has(name)) {
      this._bones.set(name, this.vrm.humanoid.getNormalizedBoneNode(name) || null);
    }
    return this._bones.get(name);
  }

  captureBindPose(names = []) {
    for (const name of names) {
      const bone = this.bone(name);
      if (bone) this._bindQuaternions.set(name, bone.quaternion.clone());
    }
  }

  bindQuaternion(name) {
    return this._bindQuaternions.get(name)?.clone() || new THREE.Quaternion();
  }

  footWorldPosition(side, out = new THREE.Vector3()) {
    const foot = this.bone(`${side}Foot`);
    if (!foot) return null;
    this.root.updateMatrixWorld(true);
    return foot.getWorldPosition(out);
  }

  modelContract() {
    return {
      rootOwner: 'FacingController + PhysicsBody(position only)',
      boneOwner: 'AnimationController + IKController + HandPose/Face/Gaze',
      coordinateFrame: '+X right / +Y up / +Z forward',
      source: 'NIVA.vrm normalized humanoid',
    };
  }
}
