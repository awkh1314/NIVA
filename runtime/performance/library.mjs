const cue = (text, emotion, gesture, voice, hold = true) => ({
  text,
  emotion,
  ...(gesture ? { gestures: [gesture] } : {}),
  voice,
  hold,
});

export const NIVA_PERFORMANCE_LIBRARY = Object.freeze({
  welcome_home: Object.freeze({
    id: 'welcome_home',
    label: '欢迎回归',
    description: '看向用户、挥手、点头，两段连续欢迎。',
    cues: Object.freeze([
      cue('你回来啦。', 'happy', ['wave','r',0.72], ['bright',0.62], true),
      cue('今天想让我陪你做什么？', 'happy', ['nod','c',0.28], ['warm',0.46], false),
    ]),
  }),
  tai_chi_beginner: Object.freeze({
    id: 'tai_chi_beginner',
    label: '太极演绎',
    description: '动作与动作名逐段同步：起式、抱球、云手、推掌、收式。',
    cues: Object.freeze([
      cue('起式。', 'neutral', ['taiChiRaise','c',0.58], ['gentle',0.38], true),
      cue('抱球。', 'neutral', ['taiChiBall','l',0.56], ['gentle',0.38], true),
      cue('云手。', 'neutral', ['taiChiCloud','r',0.62], ['gentle',0.40], true),
      cue('推掌。', 'neutral', ['taiChiPush','c',0.62], ['serious',0.38], true),
      cue('收式。', 'neutral', ['taiChiClose','c',0.52], ['gentle',0.34], false),
    ]),
  }),
  thinking_demo: Object.freeze({
    id: 'thinking_demo',
    label: '思考演绎',
    description: '托腮、侧看、点头形成完整思考节奏。',
    cues: Object.freeze([
      cue('让我想一下。', 'thinking', ['think','r',0.46], ['serious',0.42], true),
      cue('先看目标。', 'thinking', ['tilt','l',0.22], ['serious',0.40], true),
      cue('再看限制。', 'thinking', ['tilt','r',0.20], ['serious',0.40], true),
      cue('然后找最短的可行路径。', 'happy', ['nod','c',0.32], ['warm',0.42], false),
    ]),
  }),
});

export const NIVA_PERFORMANCE_IDS = Object.freeze(Object.keys(NIVA_PERFORMANCE_LIBRARY));
export function getPerformance(id) { return NIVA_PERFORMANCE_LIBRARY[id] || null; }
export function listPerformances() { return NIVA_PERFORMANCE_IDS.map((id) => NIVA_PERFORMANCE_LIBRARY[id]); }
