import { MotionRegistry } from '../motion/motion-registry.mjs';

export class PerformanceDirectorBridge {
  constructor(vrm) {
    this.motion = new MotionRegistry(vrm);
  }

  execute(command = {}) {
    if (command.motion) {
      this.motion.play(command.motion);
    }
  }

  update(delta) {
    this.motion.update(delta);
  }
}
