import { BODY_REGION_NAMES } from './body-map.mjs';
import { getMotionSpec } from './motion-specs.mjs';

const EMPTY = Object.freeze([]);

/**
 * Motion ownership only. This class never mutates bones, root transforms,
 * physics bodies, expressions or audio. It resolves which lane may control
 * each body region so independent systems cannot fight each other.
 */
export class FullBodyMotionCoordinator {
  constructor() {
    this.continuous = 'idle';
    this.overlay = null;
    this.overlayUntil = 0;
    this.manualRegions = new Set();
  }

  setContinuous(id) {
    const spec = getMotionSpec(id);
    if (!spec || spec.lane !== 'continuous') throw new Error(`invalid continuous motion: ${id}`);
    this.continuous = id;
    return spec;
  }

  triggerOverlay(id, now = performance.now(), durationMs = 1200) {
    const spec = getMotionSpec(id);
    if (!spec || spec.lane !== 'overlay') throw new Error(`invalid overlay motion: ${id}`);
    this.overlay = id;
    this.overlayUntil = now + Math.max(0, durationMs);
    return spec;
  }

  clearOverlay() {
    this.overlay = null;
    this.overlayUntil = 0;
  }

  setManualRegions(regions = EMPTY) {
    this.manualRegions = new Set(regions.filter((r) => BODY_REGION_NAMES.includes(r)));
  }

  resolve(now = performance.now()) {
    if (this.overlay && now >= this.overlayUntil) this.clearOverlay();
    const base = getMotionSpec(this.continuous) || getMotionSpec('idle');
    const over = this.overlay ? getMotionSpec(this.overlay) : null;
    const ownership = {};

    for (const region of BODY_REGION_NAMES) {
      if (this.manualRegions.has(region)) {
        ownership[region] = 'manual';
        continue;
      }
      if (over?.claims?.includes(region)) {
        ownership[region] = `overlay:${over.id}`;
        continue;
      }
      if (base?.claims?.includes(region)) {
        ownership[region] = `continuous:${base.id}`;
        continue;
      }
      ownership[region] = 'life/additive';
    }

    return {
      continuous: base?.id || 'idle',
      overlay: over?.id || null,
      ownership,
      rootOwner: base?.root || null,
      support: base?.support || null,
      invariants: [...(base?.invariants || []), ...(over?.invariants || [])],
    };
  }

  state(now = performance.now()) {
    return this.resolve(now);
  }
}
