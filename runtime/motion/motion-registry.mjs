import { VRMMotionResolver } from './vrm-motion-resolver.mjs';

export class MotionRegistry {
  constructor(vrm) {
    this.resolver = new VRMMotionResolver(vrm);
    this.available = new Set(['idle', 'wave', 'nod']);
  }

  play(name) {
    if (!this.available.has(name)) return false;
    this.resolver.play(name);
    return true;
  }

  update(delta) {
    this.resolver.update(delta);
  }
}
