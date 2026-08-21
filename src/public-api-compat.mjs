const MOTION_MAP = Object.freeze({
  wave:[['wave','r',0.65]],
  nod:[['nod','c',0.35]],
  idle:[['sway','c',0.20]],
  think:[['think','r',0.40],['tilt','r',0.18]],
  celebrate:[['cheer','c',0.55]],
});

function normalizeMotion(motion) {
  if (Array.isArray(motion)) return motion;
  if (typeof motion === 'string') return MOTION_MAP[motion] || [[motion,'c',0.35]];
  return undefined;
}

function install() {
  const api = window.NIVA;
  if (!api?.enqueue || api.play) return Boolean(api?.play);
  window.NIVA = Object.freeze({
    ...api,
    play({ text = '', emotion = 'neutral', motion, gestures, voice } = {}) {
      const resolvedGestures = Array.isArray(gestures) ? gestures : normalizeMotion(motion);
      return api.enqueue({
        text:String(text || '').trim() || ' ',
        emotion,
        ...(resolvedGestures?.length ? { gestures:resolvedGestures } : {}),
        ...(voice ? { voice } : {}),
      });
    },
  });
  return true;
}

if (!install()) {
  const timer = setInterval(() => {
    if (install()) clearInterval(timer);
  }, 50);
  setTimeout(() => clearInterval(timer), 10000);
}
