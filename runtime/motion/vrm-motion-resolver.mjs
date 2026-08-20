export class VRMMotionResolver {
  constructor(vrm) {
    this.vrm = vrm;
    this.humanoid = vrm?.humanoid;
    this.current = null;
    this.clock = 0;
  }

  play(name) {
    this.current = name;
    this.clock = 0;
  }

  update(delta) {
    if (!this.humanoid) return;
    this.clock += delta;

    if (this.current === 'idle') this.idle();
    if (this.current === 'wave') this.wave();
    if (this.current === 'nod') this.nod();
  }

  bone(name) {
    return this.humanoid.getNormalizedBoneNode?.(name);
  }

  idle() {
    const chest = this.bone('chest');
    if (chest) chest.rotation.x = Math.sin(this.clock * 2) * 0.01;
  }

  wave() {
    const arm = this.bone('rightUpperArm');
    const foreArm = this.bone('rightLowerArm');
    if (arm) arm.rotation.z = -0.35;
    if (foreArm) foreArm.rotation.y = Math.sin(this.clock * 8) * 0.35;
  }

  nod() {
    const head = this.bone('head');
    if (head) head.rotation.x = Math.sin(this.clock * 5) * 0.12;
  }
}
