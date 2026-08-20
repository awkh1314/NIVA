import { HumanoidMotionController } from './humanoid-controller.mjs';

export function createMotionResolver(vrm) {
  const controller = new HumanoidMotionController(vrm);

  return {
    playMotion(motion) {
      if (!motion) return;

      if (motion.bones) {
        controller.applyPose(motion.bones);
      }
    },

    update(delta) {
      controller.update(delta);
    },

    controller,
  };
}
