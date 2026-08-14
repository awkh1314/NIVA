import './style.css'
import type { MotionName, NivaAction, SemanticExpression } from './core/types'

const asset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <main class="shell" data-emotion="neutral">
    <div class="ambient ambient-a"></div>
    <div class="ambient ambient-b"></div>
    <header class="topbar glass">
      <div class="brand">
        <strong>NIVA</strong>
        <span>DIGITAL LIFE · 2D COMPANION</span>
      </div>
      <div class="live"><i></i><span>ONLINE</span></div>
    </header>

    <section class="stage" id="stage" aria-label="NIVA 2D stage">
      <div class="orbit orbit-a"></div>
      <div class="orbit orbit-b"></div>
      <div class="avatar" id="avatar">
        <div class="aura"></div>
        <div class="shadow"></div>
        <div class="part body"><img src="${asset('body.png')}" alt="" /></div>
        <div class="part hair"><img src="${asset('hair_left.png')}" alt="" /></div>
        <div class="part arm-left"><img src="${asset('arm_left.png')}" alt="" /></div>
        <div class="part skirt"><img src="${asset('skirt_right.png')}" alt="" /></div>
        <div class="part head">
          <img src="${asset('head.png')}" alt="NIVA" />
          <svg class="face" viewBox="0 0 540 1370" aria-hidden="true">
            <g class="blink-mask">
              <ellipse cx="283" cy="158" rx="19" ry="12" fill="#f4d8d1" />
              <ellipse cx="359" cy="154" rx="19" ry="12" fill="#f4d8d1" />
              <path d="M267 159 Q283 169 299 157" fill="none" stroke="#6f586b" stroke-width="2.6" stroke-linecap="round" />
              <path d="M343 155 Q359 165 375 153" fill="none" stroke="#6f586b" stroke-width="2.6" stroke-linecap="round" />
            </g>
            <g class="blush">
              <ellipse cx="273" cy="184" rx="21" ry="9" fill="#ff8db1" opacity=".22" />
              <ellipse cx="373" cy="179" rx="21" ry="9" fill="#ff8db1" opacity=".22" />
            </g>
          </svg>
        </div>
        <div class="spark spark-1"></div><div class="spark spark-2"></div><div class="spark spark-3"></div>
      </div>
      <div class="stage-label"><span id="emotionLabel">NEUTRAL</span><small>生命感渲染已启用</small></div>
    </section>

    <aside class="controls glass">
      <div class="panel-title"><div><strong>行为控制</strong><small>统一动作协议 · NIVA.act()</small></div><button id="quiet" class="icon-btn" title="切换语音">VOICE</button></div>
      <p class="hint">2D 正式主线：完整立绘 + 微动作 + 表情状态，不再依赖 3D 建模。</p>
      <label>表情</label><div class="grid" id="expressions"></div>
      <label>动作</label><div class="grid" id="motions"></div>
      <label>场景</label><div class="scenarios" id="scenarios"></div>
    </aside>

    <section class="speech glass">
      <div class="portrait">N</div>
      <div class="speech-body"><strong>NIVA</strong><p id="speechText">我在这里。现在开始，以更轻、更稳定的方式陪你一起进化。</p></div>
    </section>
  </main>`

type Expression = SemanticExpression
const shell = document.querySelector<HTMLElement>('.shell')!
const avatar = document.querySelector<HTMLElement>('#avatar')!
const stage = document.querySelector<HTMLElement>('#stage')!
const speech = document.querySelector<HTMLParagraphElement>('#speechText')!
const emotionLabel = document.querySelector<HTMLElement>('#emotionLabel')!
const voiceButton = document.querySelector<HTMLButtonElement>('#quiet')!

const expressions: Array<[Expression, string]> = [
  ['neutral', '平静'], ['happy', '开心'], ['shy', '害羞'], ['thinking', '思考'],
  ['surprised', '惊讶'], ['sad', '低落'], ['angry', '生气'],
]
const motions: Array<[MotionName, string]> = [
  ['wave', '挥手'], ['greet', '问候'], ['thinking', '思考'], ['happy', '雀跃'],
  ['sad', '安慰'], ['lookAround', '张望'],
]
const scenarios: Array<[string, NivaAction]> = [
  ['见面', { text: '你好呀。今天也一起把事情一点点做好。', emotion: 'happy', motion: 'wave' }],
  ['思考', { text: '让我想一想……我会先抓住真正重要的部分。', emotion: 'thinking', motion: 'thinking' }],
  ['庆祝', { text: '完成了。这个结果值得好好记住。', emotion: 'happy', motion: 'happy' }],
  ['陪伴', { text: '今天可以慢一点，我会一直在这里。', emotion: 'sad', motion: 'sad' }],
]

let voiceEnabled = false
let typeTimer = 0
let motionTimer = 0

function typeText(text: string) {
  window.clearInterval(typeTimer)
  speech.textContent = ''
  let i = 0
  typeTimer = window.setInterval(() => {
    speech.textContent = text.slice(0, ++i)
    if (i >= text.length) window.clearInterval(typeTimer)
  }, 28)
  if (voiceEnabled && 'speechSynthesis' in window) {
    speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 1.03
    utterance.pitch = 1.12
    speechSynthesis.speak(utterance)
  }
}

function setEmotion(emotion: Expression, intensity = .8) {
  shell.dataset.emotion = emotion
  shell.style.setProperty('--emotion-intensity', String(Math.max(0, Math.min(1, intensity))))
  emotionLabel.textContent = emotion.toUpperCase()
  document.querySelectorAll<HTMLButtonElement>('[data-emotion]').forEach((b) => b.classList.toggle('active', b.dataset.emotion === emotion))
}

function playMotion(motion?: MotionName) {
  if (!motion) return
  window.clearTimeout(motionTimer)
  avatar.classList.remove(...Array.from(avatar.classList).filter((c) => c.startsWith('motion-')))
  void avatar.offsetWidth
  avatar.classList.add(`motion-${motion}`)
  document.querySelectorAll<HTMLButtonElement>('[data-motion]').forEach((b) => b.classList.toggle('active', b.dataset.motion === motion))
  motionTimer = window.setTimeout(() => {
    avatar.classList.remove(`motion-${motion}`)
    document.querySelectorAll<HTMLButtonElement>('[data-motion]').forEach((b) => b.classList.remove('active'))
  }, 1500)
}

function act(action: NivaAction) {
  if (action.emotion) setEmotion(action.emotion, action.expressionIntensity ?? .8)
  if (action.motion) playMotion(action.motion)
  if (action.text) typeText(action.text)
  if (action.lookTarget) {
    avatar.style.setProperty('--look-x', `${Math.max(-1, Math.min(1, action.lookTarget.x)) * 5}px`)
    avatar.style.setProperty('--look-y', `${Math.max(-1, Math.min(1, action.lookTarget.y)) * 3}px`)
  }
}

function addButtons<T extends string>(hostId: string, values: Array<[T, string]>, attr: string, handler: (value: T) => void) {
  const host = document.querySelector<HTMLElement>(`#${hostId}`)!
  for (const [value, label] of values) {
    const button = document.createElement('button')
    button.textContent = label
    button.dataset[attr] = value
    button.addEventListener('click', () => handler(value))
    host.appendChild(button)
  }
}
addButtons('expressions', expressions, 'emotion', (emotion) => setEmotion(emotion))
addButtons('motions', motions, 'motion', (motion) => playMotion(motion))

const scenarioHost = document.querySelector<HTMLElement>('#scenarios')!
for (const [label, action] of scenarios) {
  const button = document.createElement('button')
  button.innerHTML = `<span>${label}</span><small>${action.text}</small>`
  button.addEventListener('click', () => act(action))
  scenarioHost.appendChild(button)
}

function blink() {
  avatar.classList.add('blinking')
  window.setTimeout(() => avatar.classList.remove('blinking'), 130)
}
function scheduleBlink() {
  window.setTimeout(() => { blink(); scheduleBlink() }, 2300 + Math.random() * 3100)
}
scheduleBlink()

stage.addEventListener('pointermove', (event) => {
  const rect = stage.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width - .5) * 2
  const y = ((event.clientY - rect.top) / rect.height - .5) * 2
  avatar.style.setProperty('--look-x', `${x * 4}px`)
  avatar.style.setProperty('--look-y', `${y * 2.5}px`)
  avatar.style.setProperty('--parallax-x', `${x * 5}px`)
})
stage.addEventListener('pointerleave', () => {
  avatar.style.setProperty('--look-x', '0px')
  avatar.style.setProperty('--look-y', '0px')
  avatar.style.setProperty('--parallax-x', '0px')
})
stage.addEventListener('pointerdown', () => {
  blink()
  act({ text: '嗯？我在听。', emotion: 'happy', motion: 'greet' })
})

voiceButton.addEventListener('click', () => {
  voiceEnabled = !voiceEnabled
  voiceButton.classList.toggle('active', voiceEnabled)
  voiceButton.textContent = voiceEnabled ? 'VOICE ON' : 'VOICE'
})

Object.assign(window, {
  NIVA: {
    act,
    setEmotion,
    motion: playMotion,
    blink,
    get ready() { return true },
    get mode() { return '2d-official' as const },
  },
})

declare global {
  interface Window {
    NIVA: {
      act(action: NivaAction): void
      setEmotion(emotion: Expression, intensity?: number): void
      motion(motion?: MotionName): void
      blink(): void
      readonly ready: boolean
      readonly mode: '2d-official'
    }
  }
}

setEmotion('neutral')
window.setTimeout(() => act({ text: 'NIVA 2D 正式舞台已就绪。', emotion: 'happy', motion: 'greet' }), 650)
