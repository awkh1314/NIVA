import { VRMMotionResolver } from './vrm-motion-resolver.mjs';
import { MOTIONS } from './motion-registry.mjs';

export function createMotionRuntime(vrm) {
  const resolver = new VRMMotionResolver(vrm);

  return {
    play(name) {
      if (!MOTIONS.includes(name)) return false;
      resolver.play(name);
      return true;
    },
    update(delta) {
      resolver.update(delta);
    },
    get current() {
      return resolver.current;
    },
  };
}
