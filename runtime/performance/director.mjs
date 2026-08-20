import { getPerformance } from './library.mjs';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || lo));

export function expandPerformance(id) {
  const performance = getPerformance(id);
  if (!performance) return [];
  return performance.cues.map((cue, index) => ({
    t: String(cue.text || ''),
    e: cue.emotion || 'neutral',
    ...(cue.gestures?.length ? { g: cue.gestures.map((g) => [g[0], g[1], clamp(g[2], 0.15, 1)]) } : {}),
    v: Array.isArray(cue.voice) ? [cue.voice[0], clamp(cue.voice[1],0.15,1)] : ['neutral',0.5],
    hold: Boolean(cue.hold),
    performanceId: id,
    cueIndex: index,
    cueCount: performance.cues.length,
  }));
}
