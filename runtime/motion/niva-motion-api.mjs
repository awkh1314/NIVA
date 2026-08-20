import { createMotionRuntime } from './motion-runtime.mjs';

export function attachNIVAMotionAPI(target, vrm) {
  const runtime = createMotionRuntime(vrm);

  target.motion = Object.freeze({
    play(name) {
      return runtime.play(name);
    },
    update(delta) {
      return runtime.update(delta);
    },
    get current() {
      return runtime.current;
    },
  });

  return runtime;
}
