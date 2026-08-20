import { createNIVAMotionAPI } from './niva-motion-api.mjs';

/**
 * Attach motion runtime after VRM loading.
 * Keeps existing main.js rendering flow unchanged.
 */
export function attachNIVAMotion(vrm, options = {}) {
  const api = createNIVAMotionAPI(vrm, options);

  if (typeof window !== 'undefined') {
    window.NIVA = window.NIVA || {};
    window.NIVA.motion = api;

    const previousPlay = window.NIVA.play;
    window.NIVA.play = (payload = {}) => {
      if (payload.motion) api.play(payload.motion);
      return previousPlay?.(payload);
    };
  }

  return api;
}
