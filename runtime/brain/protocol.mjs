export const NIVA_EMOTIONS = Object.freeze(['neutral','happy','shy','thinking','sad','angry','surprise']);
export const NIVA_VOICE_STYLES = Object.freeze(['neutral','warm','bright','gentle','serious','sad','angry','surprised','excited','whisper']);
export const NIVA_GESTURES = Object.freeze(['nod','shake','tilt','wave','openArms','point','think','bow','cheer','step','sway','handsTogether','taiChiRaise','taiChiBall','taiChiCloud','taiChiPush','taiChiClose']);
export const NIVA_PERFORMANCES = Object.freeze(['welcome_home','tai_chi_beginner','thinking_demo']);

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || lo));
const cleanText = (value, max = 1600) => String(value || '').trim().slice(0, max);

function normalizeGesture(item) {
  if (!Array.isArray(item) || !NIVA_GESTURES.includes(item[0])) return null;
  const side = ['l','r','c'].includes(item[1]) ? item[1] : 'c';
  return [item[0], side, clamp(item[2] ?? 0.5, 0.15, 1)];
}

export function normalizeBrainResponse(value) {
  const src = typeof value === 'string' ? JSON.parse(value) : (value || {});
  const text = cleanText(src.text ?? src.t);
  const emotionCandidate = src.emotion ?? src.e;
  const emotion = NIVA_EMOTIONS.includes(emotionCandidate) ? emotionCandidate : 'neutral';
  const performanceCandidate = cleanText(src.performance, 80);
  const performance = NIVA_PERFORMANCES.includes(performanceCandidate) ? performanceCandidate : undefined;
  const rawGestures = src.gestures ?? src.g;
  const gestures = Array.isArray(rawGestures) ? rawGestures.slice(0,4).map(normalizeGesture).filter(Boolean) : [];
  const rawVoice = src.voice ?? src.v;
  let voice = { style: 'neutral', intensity: 0.5 };
  if (Array.isArray(rawVoice) && NIVA_VOICE_STYLES.includes(rawVoice[0])) {
    voice = { style: rawVoice[0], intensity: clamp(rawVoice[1] ?? 0.5, 0.15, 1) };
  } else if (rawVoice && typeof rawVoice === 'object' && NIVA_VOICE_STYLES.includes(rawVoice.style)) {
    voice = { style: rawVoice.style, intensity: clamp(rawVoice.intensity ?? 0.5, 0.15, 1) };
  }
  const type = performance ? 'performance' : 'conversation';
  if (!text && !performance) throw new Error('NIVA Brain response requires text or performance');
  return { type, text, emotion, ...(performance ? { performance } : {}), ...(gestures.length ? { gestures } : {}), voice };
}

export function brainToStageCue(value, extra = {}) {
  const brain = value?.type ? value : normalizeBrainResponse(value);
  return {
    t: brain.text || '',
    e: brain.emotion || 'neutral',
    ...(brain.gestures?.length ? { g: brain.gestures } : {}),
    v: [brain.voice?.style || 'neutral', brain.voice?.intensity ?? 0.5],
    ...extra,
  };
}

export function buildBrainSystemPrompt() {
  return `你是 NIVA Brain，只输出一行 JSON，不要 markdown。\n职责：决定回答、情绪、必要动作，或选择一个本地表演；禁止输出骨骼角度、坐标、逐帧时间轴。\n最省 token 格式：{"text":"回答","emotion":"happy","gestures":[["wave","r",0.6]],"voice":["bright",0.5]}。\n如果适合调用完整表演，用：{"performance":"tai_chi_beginner","text":"我来演示一遍。","emotion":"neutral","voice":["gentle",0.4]}。\nperformance 仅允许 welcome_home|tai_chi_beginner|thinking_demo。\ngestures 最多4项，仅允许 ${NIVA_GESTURES.join('|')}，方向仅 l|r|c，强度0.15~1。\nemotion 仅允许 ${NIVA_EMOTIONS.join('|')}。voice 风格仅允许 ${NIVA_VOICE_STYLES.join('|')}。\n用户说“打太极/太极演示”时优先 performance=tai_chi_beginner；欢迎回归可用 welcome_home；要求展示思考过程可用 thinking_demo。`;
}

export function buildChatPayload(userText, model = 'deepseek-chat') {
  return {
    model,
    temperature: 0.45,
    max_tokens: 480,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildBrainSystemPrompt() },
      { role: 'user', content: cleanText(userText, 4000) },
    ],
  };
}

export function fallbackBrainResponse(text) {
  const s = cleanText(text, 4000);
  if (/太极|tai\s*chi/i.test(s)) return normalizeBrainResponse({ performance:'tai_chi_beginner', text:'好，我按动作名给你演示一遍。', emotion:'neutral', voice:['gentle',0.45] });
  if (/欢迎|回来|回家/.test(s)) return normalizeBrainResponse({ performance:'welcome_home', text:'', emotion:'happy', voice:['bright',0.55] });
  if (/思考|想想|分析/.test(s)) return normalizeBrainResponse({ performance:'thinking_demo', text:'', emotion:'thinking', voice:['serious',0.45] });
  if (/你好|hi|hello/i.test(s)) return normalizeBrainResponse({ text:'你好，我是 NIVA。很高兴见到你。', emotion:'happy', gestures:[['wave','r',0.7],['nod','c',0.25]], voice:['bright',0.55] });
  return normalizeBrainResponse({ text:s ? `我收到你的输入：“${s.slice(0,80)}”。当前网页体验模式会使用本地编排；桌面版接入 Brain API 后可由模型实时生成。` : '我在。', emotion:'neutral', gestures:[['nod','c',0.22]], voice:['warm',0.35] });
}
