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

const INTENT_MAP = Object.freeze({
  greeting: { gestures:[['wave','r',0.62],['nod','c',0.24]], voice:['bright',0.52] },
  thinking: { gestures:[['think','r',0.42],['tilt','r',0.20]], voice:['serious',0.42] },
  explain: { gestures:[['openArms','c',0.34],['nod','c',0.20]], voice:['warm',0.42] },
  celebrate: { gestures:[['cheer','c',0.58]], voice:['excited',0.60] },
  comfort: { gestures:[['handsTogether','c',0.30],['nod','c',0.18]], voice:['gentle',0.36] },
  acknowledge: { gestures:[['nod','c',0.22]], voice:['warm',0.34] },
});

const EMOTION_SCALE = Object.freeze({
  happy:1.05,
  surprise:1.08,
  angry:0.88,
  sad:0.72,
  shy:0.76,
  thinking:0.78,
  neutral:0.86,
});

export function inferPerformanceIntent(brain = {}) {
  const text = String(brain.text || '').toLowerCase();
  if (brain.emotion === 'thinking' || /思考|想想|分析|think|consider/.test(text)) return 'thinking';
  if (/你好|您好|嗨|hello|\bhi\b|欢迎|见到你/.test(text)) return 'greeting';
  if (/太棒|成功|完成|恭喜|庆祝|great|success|congrat/.test(text)) return 'celebrate';
  if (/难过|别担心|陪着|安慰|抱歉|sad|sorry|comfort/.test(text)) return 'comfort';
  if (/因为|所以|首先|其次|解释|说明|原理|because|explain/.test(text)) return 'explain';
  return 'acknowledge';
}

export function directBrainPerformance(brain = {}) {
  if (brain.performance || brain.gestures?.length) return brain;
  const intent = inferPerformanceIntent(brain);
  const preset = INTENT_MAP[intent] || INTENT_MAP.acknowledge;
  const scale = EMOTION_SCALE[brain.emotion] ?? EMOTION_SCALE.neutral;
  return {
    ...brain,
    gestures:preset.gestures.map(([name,side,intensity])=>[name,side,clamp(intensity*scale,0.15,1)]),
    voice:brain.voice?.style && brain.voice.style !== 'neutral'
      ? brain.voice
      : { style:preset.voice[0], intensity:clamp(preset.voice[1]*scale,0.15,1) },
    directorIntent:intent,
  };
}

const IDLE_PROFILES = Object.freeze({
  happy:[['sway','c',0.23],['tilt','r',0.18],['nod','c',0.18]],
  thinking:[['tilt','r',0.16],['sway','c',0.17]],
  sad:[['sway','c',0.15],['nod','c',0.15]],
  neutral:[['sway','c',0.20],['sway','c',0.24],['tilt','r',0.18],['nod','c',0.18]],
});

export function idleDirectorCue(emotion = 'neutral', variant = 0) {
  const profile = IDLE_PROFILES[emotion] || IDLE_PROFILES.neutral;
  const cue = profile[Math.abs(Number(variant) || 0) % profile.length];
  const [gesture, side, intensity] = cue;
  return [gesture, side, intensity];
}
