import './style.css'
import type { MotionName, NivaAction, SemanticExpression } from './core/types'

type Expression = SemanticExpression
type FrameClip = { frames: string[]; fps: number; loop?: boolean }

type MotionState = {
  name: MotionName | 'idle'
  startedAt: number
  duration: number
}

const base = import.meta.env.BASE_URL
const fallbackFrame = `${base}recomposite.png`

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <main class="shell" data-emotion="neutral">
    <div class="ambient ambient-a"></div><div class="ambient ambient-b"></div>
    <header class="topbar">
      <div class="brand"><strong>NIVA</strong><span>数字生命 · 2D FULL-FRAME</span></div>
      <div class="top-actions"><button id="voiceToggle" class="ghost-btn">语音</button><button id="debugToggle" class="ghost-btn">···</button></div>
    </header>

    <section class="stage" id="stage" aria-label="NIVA full-frame stage">
      <div class="halo halo-a"></div><div class="halo halo-b"></div>
      <div class="avatar-shell" id="avatar">
        <canvas id="avatarCanvas" class="avatar-frame" width="540" height="1370" aria-label="NIVA"></canvas>
        <img id="avatarSource" src="${fallbackFrame}" alt="" hidden />
      </div>
      <div class="presence"><i></i><span id="presenceText">正在呼吸</span></div>
    </section>

    <section class="conversation">
      <div class="dialog-stack">
        <div class="user-line" id="userLine" hidden></div>
        <div class="bubble-wrap"><div class="name">NIVA</div><div class="bubble" id="speechText">你好，我在这里。</div></div>
      </div>
      <form class="composer" id="composer"><input id="messageInput" autocomplete="off" maxlength="160" placeholder="和 NIVA 说点什么…" /><button type="submit">发送</button></form>
      <div class="quick"><button data-text="你好">你好</button><button data-text="我今天有点累">我有点累</button><button data-text="我成功了">我成功了</button><button data-text="你在想什么">你在想什么</button></div>
    </section>

    <aside class="debug-panel" id="debugPanel" aria-hidden="true">
      <div class="debug-head"><strong>开发控制</strong><button id="debugClose">关闭</button></div>
      <p class="debug-note">只使用完整人物画面。当前通过整帧 Canvas 形变产生明显动作；有真实完整动画帧时自动优先播放真实帧。</p>
      <label>表情</label><div class="grid" id="expressions"></div>
      <label>动作</label><div class="grid" id="motions"></div>
    </aside>
  </main>`

const shell = document.querySelector<HTMLElement>('.shell')!
const avatar = document.querySelector<HTMLElement>('#avatar')!
const canvas = document.querySelector<HTMLCanvasElement>('#avatarCanvas')!
const source = document.querySelector<HTMLImageElement>('#avatarSource')!
const ctx = canvas.getContext('2d', { alpha: true })!
const stage = document.querySelector<HTMLElement>('#stage')!
const speech = document.querySelector<HTMLElement>('#speechText')!
const userLine = document.querySelector<HTMLElement>('#userLine')!
const presenceText = document.querySelector<HTMLElement>('#presenceText')!
const input = document.querySelector<HTMLInputElement>('#messageInput')!
const composer = document.querySelector<HTMLFormElement>('#composer')!
const voiceButton = document.querySelector<HTMLButtonElement>('#voiceToggle')!
const debugButton = document.querySelector<HTMLButtonElement>('#debugToggle')!
const debugClose = document.querySelector<HTMLButtonElement>('#debugClose')!
const debugPanel = document.querySelector<HTMLElement>('#debugPanel')!

const expressions: Array<[Expression, string]> = [
  ['neutral', '平静'], ['happy', '开心'], ['shy', '害羞'], ['thinking', '思考'],
  ['surprised', '惊讶'], ['sad', '低落'], ['angry', '生气'],
]
const motions: Array<[MotionName, string]> = [
  ['wave', '挥手'], ['greet', '问候'], ['thinking', '思考'], ['happy', '雀跃'],
  ['sad', '安慰'], ['lookAround', '张望'],
]

const clips = new Map<string, FrameClip>()
const imageCache = new Map<string, HTMLImageElement>()

let voiceEnabled = false
let typeTimer = 0
let idleTimer = 0
let lastInteraction = Date.now()
let sourceReady = false
let activeEmotion: Expression = 'neutral'
let activeClip = 'procedural:idle'
let framePlayback: { clip: FrameClip; index: number; nextAt: number; name: string } | null = null
let motionState: MotionState = { name: 'idle', startedAt: performance.now(), duration: Infinity }

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3)
}

function easeInOut(t: number) {
  return -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2
}

function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url)
  if (cached?.complete && cached.naturalWidth) return Promise.resolve(cached)
  return new Promise((resolve, reject) => {
    const img = cached ?? new Image()
    imageCache.set(url, img)
    img.onload = () => resolve(img)
    img.onerror = reject
    if (!img.src) img.src = url
  })
}

function registerFrames(name: string, frames: string[], fps = 10, loop = false) {
  const normalized = frames
    .filter(Boolean)
    .map((f) => f.startsWith('http') || f.startsWith('/') ? f : `${base}${f}`)
  if (!normalized.length) return false
  clips.set(name, { frames: normalized, fps: clamp(fps, 1, 30), loop })
  normalized.forEach((url) => { void loadImage(url) })
  return true
}

function playFrames(name: string) {
  const clip = clips.get(name)
  if (!clip?.frames.length) return false
  activeClip = name
  framePlayback = { clip, index: 0, nextAt: performance.now(), name }
  return true
}

function endFramePlayback() {
  framePlayback = null
  activeClip = 'procedural:idle'
}

function drawRealFrame(now: number) {
  if (!framePlayback) return false
  const state = framePlayback
  if (now < state.nextAt) return true

  const url = state.clip.frames[state.index]
  const img = imageCache.get(url)
  if (img?.complete && img.naturalWidth) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    state.index += 1
    state.nextAt = now + 1000 / state.clip.fps
    if (state.index >= state.clip.frames.length) {
      if (state.clip.loop) state.index = 0
      else endFramePlayback()
    }
  } else {
    void loadImage(url)
    state.nextAt = now + 30
  }
  return true
}

function getMotionProgress(now: number) {
  if (motionState.name === 'idle' || !Number.isFinite(motionState.duration)) return 0
  const elapsed = now - motionState.startedAt
  if (elapsed >= motionState.duration) {
    motionState = { name: 'idle', startedAt: now, duration: Infinity }
    activeClip = 'procedural:idle'
    return 0
  }
  return clamp(elapsed / motionState.duration, 0, 1)
}

function poseFor(now: number) {
  const seconds = now / 1000
  const idleBreath = Math.sin(seconds * Math.PI * 0.72)
  const idleSway = Math.sin(seconds * Math.PI * 0.38)
  const p = getMotionProgress(now)
  const name = motionState.name

  let x = idleSway * 1.8
  let y = -idleBreath * 2.4
  let rotate = idleSway * 0.18
  let scale = 1 + idleBreath * 0.0025
  let upperSway = idleSway * 2.2
  let lowerSway = 0
  let breathe = idleBreath * 1.7

  if (name === 'greet') {
    const wave = Math.sin(p * Math.PI * 2.2) * Math.sin(p * Math.PI)
    x += wave * 12
    rotate += wave * 1.9
    upperSway += wave * 13
    y -= Math.sin(p * Math.PI) * 8
  } else if (name === 'wave') {
    const wave = Math.sin(p * Math.PI * 5) * Math.sin(p * Math.PI)
    x += wave * 15
    rotate += wave * 2.5
    upperSway += wave * 18
    lowerSway -= wave * 4
  } else if (name === 'thinking') {
    const settle = easeOut(Math.min(p * 2, 1)) * (1 - easeOut(Math.max((p - .66) / .34, 0)))
    rotate -= settle * 3.2
    x -= settle * 7
    y += settle * 5
    upperSway -= settle * 8
  } else if (name === 'happy') {
    const jump = Math.sin(p * Math.PI)
    const bounce = Math.sin(p * Math.PI * 3) * (1 - p)
    y -= jump * 38
    scale += jump * .018
    rotate += bounce * 1.2
    upperSway += bounce * 7
  } else if (name === 'sad') {
    const settle = easeInOut(Math.min(p * 1.8, 1)) * (1 - easeOut(Math.max((p - .72) / .28, 0)))
    y += settle * 16
    rotate += settle * 1.8
    scale -= settle * .008
    upperSway += settle * 5
  } else if (name === 'lookAround') {
    const sweep = Math.sin(p * Math.PI * 2) * Math.sin(p * Math.PI)
    x += sweep * 22
    rotate += sweep * 2.1
    upperSway += sweep * 15
  } else if (name === 'surprised') {
    const pop = Math.sin(p * Math.PI)
    y -= pop * 18
    scale += pop * .024
  } else if (name === 'angry') {
    const shake = Math.sin(p * Math.PI * 9) * (1 - p)
    x += shake * 11
    rotate += shake * .7
  }

  return { x, y, rotate, scale, upperSway, lowerSway, breathe }
}

function drawDeformedWholeFrame(now: number) {
  if (!sourceReady) return
  const { x, y, rotate, scale, upperSway, lowerSway, breathe } = poseFor(now)
  const w = canvas.width
  const h = canvas.height

  ctx.clearRect(0, 0, w, h)
  ctx.save()
  ctx.translate(w / 2 + x, h / 2 + y)
  ctx.rotate(rotate * Math.PI / 180)
  ctx.scale(scale, scale)
  ctx.translate(-w / 2, -h / 2)

  // 逐条绘制完整图像的连续扫描带，只做平滑形变，不拆人物部件。
  // 2px 扫描带足够细，不会产生肉眼可见的拼接接缝。
  const strip = 2
  for (let sy = 0; sy < h; sy += strip) {
    const normalizedY = sy / h
    const upperWeight = Math.pow(1 - normalizedY, 1.8)
    const lowerWeight = Math.pow(normalizedY, 2.2)
    const torsoWeight = Math.exp(-Math.pow((normalizedY - .43) / .22, 2))
    const dx = upperSway * upperWeight + lowerSway * lowerWeight
    const breathScale = 1 + (breathe * torsoWeight) / 1000
    const rowW = w * breathScale
    const rowX = dx - (rowW - w) / 2
    ctx.drawImage(source, 0, sy, w, Math.min(strip + 1, h - sy), rowX, sy, rowW, Math.min(strip + 1, h - sy))
  }
  ctx.restore()
}

function render(now: number) {
  if (!drawRealFrame(now)) drawDeformedWholeFrame(now)
  requestAnimationFrame(render)
}
requestAnimationFrame(render)

source.onload = () => {
  canvas.width = source.naturalWidth || 540
  canvas.height = source.naturalHeight || 1370
  sourceReady = true
  imageCache.set(fallbackFrame, source)
  activeClip = 'procedural:idle'
}
if (source.complete && source.naturalWidth) source.onload?.(new Event('load'))

function typeText(text: string) {
  clearInterval(typeTimer)
  speech.textContent = ''
  let i = 0
  typeTimer = window.setInterval(() => {
    speech.textContent = text.slice(0, ++i)
    if (i >= text.length) clearInterval(typeTimer)
  }, 20)
  if (voiceEnabled && 'speechSynthesis' in window) {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'zh-CN'
    u.rate = 1.02
    u.pitch = 1.1
    speechSynthesis.speak(u)
  }
}

function setEmotion(emotion: Expression, intensity = .8) {
  activeEmotion = emotion
  shell.dataset.emotion = emotion
  shell.style.setProperty('--emotion-intensity', String(clamp(intensity, 0, 1)))
  presenceText.textContent = ({
    neutral: '正在呼吸', happy: '心情很好', shy: '有一点害羞', thinking: '正在思考',
    surprised: '被你惊到了', sad: '陪你安静一会儿', angry: '有一点生气',
  } as Record<Expression, string>)[emotion]
  document.querySelectorAll<HTMLButtonElement>('[data-emotion]').forEach((b) => b.classList.toggle('active', b.dataset.emotion === emotion))
  if (clips.has(`emotion:${emotion}`)) playFrames(`emotion:${emotion}`)
}

function playMotion(motion?: MotionName) {
  if (!motion) return
  const clipName = `motion:${motion}`
  if (clips.has(clipName)) {
    playFrames(clipName)
  } else {
    const durations: Partial<Record<MotionName, number>> = {
      greet: 1250, wave: 1500, thinking: 1700, happy: 1200, sad: 1500,
      lookAround: 1800, surprised: 900, angry: 900,
    }
    motionState = { name: motion, startedAt: performance.now(), duration: durations[motion] ?? 1300 }
    activeClip = `procedural:${motion}`
  }
  document.querySelectorAll<HTMLButtonElement>('[data-motion]').forEach((b) => b.classList.toggle('active', b.dataset.motion === motion))
  window.setTimeout(() => {
    document.querySelectorAll<HTMLButtonElement>('[data-motion]').forEach((b) => b.classList.remove('active'))
  }, 1600)
}

function act(action: NivaAction) {
  lastInteraction = Date.now()
  if (action.emotion) setEmotion(action.emotion, action.expressionIntensity ?? .8)
  if (action.motion) playMotion(action.motion)
  if (action.text) typeText(action.text)
  scheduleIdle()
}

function replyFor(text: string): NivaAction {
  const t = text.trim()
  const l = t.toLowerCase()
  if (!t) return { text: '嗯？你可以直接和我说。', emotion: 'happy', motion: 'greet' }
  if (/你好|hello|hi|嗨/.test(l)) return { text: '你好呀，我在。今天想一起做点什么？', emotion: 'happy', motion: 'wave' }
  if (/累|疲惫|困|难受|不舒服/.test(t)) return { text: '那今天就慢一点。把最烦的那件事告诉我，我陪你拆开。', emotion: 'sad', motion: 'sad' }
  if (/成功|完成|搞定|通过|赢了|好了/.test(t)) return { text: '我看到了。做到这一步值得庆祝。', emotion: 'happy', motion: 'happy' }
  if (/想什么|思考|为什么|怎么办|怎么做/.test(t)) return { text: '让我想一下……先抓住真正重要的部分。', emotion: 'thinking', motion: 'thinking' }
  if (/喜欢|可爱|漂亮|好看/.test(t)) return { text: '你这样说，我会有一点不好意思。', emotion: 'shy', motion: 'greet' }
  return { text: `我听到了：“${t}”。现在还是本地演示逻辑，后面接大模型后会真正理解你。`, emotion: 'neutral', motion: 'greet' }
}

function sendMessage(text: string) {
  const t = text.trim()
  if (!t) return
  input.value = ''
  userLine.hidden = false
  userLine.textContent = t
  act({ text: '让我想一下…', emotion: 'thinking', motion: 'thinking' })
  setTimeout(() => act(replyFor(t)), 430)
}

function addButtons<T extends string>(id: string, values: Array<[T, string]>, attr: string, fn: (v: T) => void) {
  const host = document.querySelector<HTMLElement>(`#${id}`)!
  for (const [v, label] of values) {
    const b = document.createElement('button')
    b.textContent = label
    b.dataset[attr] = v
    b.onclick = () => fn(v)
    host.appendChild(b)
  }
}
addButtons('expressions', expressions, 'emotion', setEmotion)
addButtons('motions', motions, 'motion', playMotion)

function scheduleIdle() {
  clearTimeout(idleTimer)
  idleTimer = window.setTimeout(() => {
    if (Date.now() - lastInteraction < 12000) return scheduleIdle()
    const pool: NivaAction[] = [
      { text: '我还在这里。', emotion: 'neutral', motion: 'lookAround' },
      { text: '刚刚安静了一会儿，我在等你。', emotion: 'shy', motion: 'greet' },
    ]
    act(pool[Math.floor(Math.random() * pool.length)])
  }, 15000)
}
scheduleIdle()

stage.addEventListener('pointerdown', () => {
  act({ text: '嗯？我在听。', emotion: 'happy', motion: 'greet' })
  input.focus()
})
composer.addEventListener('submit', (event) => {
  event.preventDefault()
  sendMessage(input.value)
})
document.querySelectorAll<HTMLButtonElement>('[data-text]').forEach((button) => {
  button.onclick = () => sendMessage(button.dataset.text ?? '')
})
voiceButton.onclick = () => {
  voiceEnabled = !voiceEnabled
  voiceButton.classList.toggle('active', voiceEnabled)
  voiceButton.textContent = voiceEnabled ? '语音 ON' : '语音'
}
function setDebug(open: boolean) {
  debugPanel.classList.toggle('open', open)
  debugPanel.setAttribute('aria-hidden', String(!open))
}
debugButton.onclick = () => setDebug(!debugPanel.classList.contains('open'))
debugClose.onclick = () => setDebug(false)

Object.assign(window, {
  NIVA: {
    act,
    setEmotion,
    motion: playMotion,
    send: sendMessage,
    registerFrames,
    playFrames,
    get ready() { return sourceReady },
    get mode() { return '2d-full-frame' as const },
    get clip() { return activeClip },
    get emotion() { return activeEmotion },
  },
})

declare global {
  interface Window {
    NIVA: {
      act(action: NivaAction): void
      setEmotion(emotion: Expression, intensity?: number): void
      motion(motion?: MotionName): void
      send(text: string): void
      registerFrames(name: string, frames: string[], fps?: number, loop?: boolean): boolean
      playFrames(name: string): boolean
      readonly ready: boolean
      readonly mode: '2d-full-frame'
      readonly clip: string
      readonly emotion: Expression
    }
  }
}

setEmotion('neutral')
setTimeout(() => act({ text: '这次你应该能明显看到我动起来了。', emotion: 'happy', motion: 'wave' }), 700)
