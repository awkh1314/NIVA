const PROFILES = Object.freeze({
  neutral:  { speed: 1.00, gain: 1.00 },
  warm:     { speed: 0.99, gain: 1.01 },
  bright:   { speed: 1.05, gain: 1.03 },
  gentle:   { speed: 0.94, gain: 0.94 },
  serious:  { speed: 0.97, gain: 1.01 },
  sad:      { speed: 0.91, gain: 0.92 },
  angry:    { speed: 1.06, gain: 1.08 },
  surprised:{ speed: 1.07, gain: 1.04 },
  excited:  { speed: 1.10, gain: 1.07 },
  whisper:  { speed: 0.93, gain: 0.84 },
});

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export function voiceProsody(style = 'neutral', intensity = 0.5) {
  const target = PROFILES[style] || PROFILES.neutral;
  const k = clamp01(intensity);
  return {
    speed: 1 + (target.speed - 1) * k,
    gain: 1 + (target.gain - 1) * k,
  };
}

export const NIVA_VOICE_STYLES = Object.freeze(Object.keys(PROFILES));
