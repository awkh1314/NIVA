import { createMotionRuntime } from './motion-runtime.mjs';

/**
 * Attach motion control without changing existing NIVA.play contract.
 * Keeps legacy animation pipeline intact while enabling VRM motion runtime.
 */
export function attachNIVAMotionRuntime(niva, vrm) {
  if (!niva || !vrm) return null;

  const runtime = createMotionRuntime(vrm);

  niva.motion = Object.freeze({
    play(name) {
      runtime.play(name);
    },
    update(delta = 1 / 60) {
      runtime.update(delta);
    },
    get current() {
      return runtime.current;
    },
  });

  const legacyPlay = niva.play;
  niva.play = function(payload = {}) {
    if (payload.motion) {
      runtime.play(payload.motion);
    }
    return legacyPlay?.call(this, payload);
  };

  return runtime;
}
