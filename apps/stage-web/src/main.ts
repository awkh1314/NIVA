import './style.css'
import type { MotionName, NivaAction, SemanticExpression } from './core/types'

const asset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <main class="shell" data-emotion="neutral">
    <div class="ambient ambient-a"></div>
    <div class="ambient ambient-b"></div>

    <header class="topbar">
      <div class="brand"><strong>NIVA</strong><span>数字生命 · 2D MVP</span></div>
      <div class="top-actions">
        <button id="voiceToggle" class="ghost-btn" title="语音开关">语音</button>
        <button id="debugToggle" class="ghost-btn" title="开发控制">···</button>
      </div>
    </header>

    <section class="stage" id="stage" aria-label="NIVA 2D companion stage">
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
      <div class="presence"><i></i><span id="presenceText">我在这里</span></div>
    </section>

    <section class="conversation">
      <div class="bubble-wrap">
        <div class="name">NIVA</div>
        <div class="bubble" id="speechText">你好，我已经醒了。想和我聊点什么？</div>
      </div>
      <form class="composer" id="composer">
        <input id="messageInput" autocomplete="off" maxlength="160" placeholder="和 NIVA 说点什么…" />
        <button type="submit" id="sendButton">发送</button>
      </form>
      <div class="quick" id="quickReplies">
        <button data-text="你好">你好</button>
        <button data-text="我今天有点累">我有点累</button>
        <button data-text="我成功了">我成功了</button>
        <button data-text="你在想什么">你在想什么</button>
      </div>
    </section>

    <aside class="debug-panel" id="debugPanel" aria-hidden="true">
      <div class="debug-head"><strong>开发控制</strong><button id="debugClose">关闭</button></div>
      <label>表情</label><div class="grid" id="expressions"></div>
      <label>动作</label><div class="grid" id="motions"></div>
    </aside>
  </main>`

type Expression = SemanticExpression
const shell = document.querySelector<HTMLElement>('.shell')!
const avatar = document.querySelector<HTMLElement>('#avatar')!
const stage = document.querySelector<HTMLElement>('#stage')!
const speech = document.querySelector<HTMLElement>('#speechText')!
const presenceText = document.querySelector<HTMLElement>('#presenceText')!
const voiceButton = document.querySelector<HTMLButtonElement>('#voiceToggle')!
const debugButton = document.querySelector<HTMLButtonElement>('#debugToggle')!
const debugClose = document.querySelector<HTMLButtonElement>('#debugClose')!
const debugPanel = document.querySelector<HTMLElement>('#debugPanel')!
const composer = document.querySelector<HTMLFormElement>('#composer')!
const input = document.querySelector<HTMLInputElement>('#messageInput')!

const expressions: Array<[Expression, string]> = [
  ['neutral', '平静'], ['happy', '开心'], ['shy', '害羞'], ['thinking', '思考'],
  ['surprised', '惊讶'], ['sad', '低落'], ['angry', '生气'],
]
const motions: Array<[MotionName, string]> = [
  ['wave', '挥手'], ['greet', '问候'], ['thinking', '思考'], ['happy', '雀跃'],
  ['sad', '安慰'], ['lookAround', '张望'],
]

let voiceEnabled = false
let typeTimer = 0
let motionTimer = 0
let idleTimer = 0
let lastInteraction = Date.now()

function typeText(text: string) {
  window.clearInterval(typeTimer)
  speech.textContent = ''
  let i = 0
  typeTimer = window.setInterval(() => {
    speech.textContent = text.slice(0, ++i)
    if (i >= text.length) window.clearInterval(typeTimer)
  }, 22)
  if (voiceEnabled && 'speechSynthesis' in window) {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'zh-CN'
    u.rate = 1.02
    u.pitch = 1.12
    speechSynthesis.speak(u)
  }
}

function setEmotion(emotion: Expression, intensity = .8) {
  shell.dataset.emotion = emotion
  shell.style.setProperty('--emotion-intensity', String(Math.max(0, Math.min(1, intensity))))
  presenceText.textContent = ({
    neutral: '我在这里', happy: '心情很好', shy: '有一点害羞', thinking: '正在思考',
    surprised: '被你惊到了', sad: '陪你安静一会儿', angry: '有一点生气',
  } as Record<Expression, string>)[emotion]
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
  lastInteraction = Date.now()
  if (action.emotion) setEmotion(action.emotion, action.expressionIntensity ?? .8)
  if (action.motion) playMotion(action.motion)
  if (action.text) typeText(action.text)
  if (action.lookTarget) {
    avatar.style.setProperty('--look-x', `${Math.max(-1, Math.min(1, action.lookTarget.x)) * 5}px`)
    avatar.style.setProperty('--look-y', `${Math.max(-1, Math.min(1, action.lookTarget.y)) * 3}px`)
  }
  scheduleIdle()
}

function replyFor(raw: string): NivaAction {
  const text = raw.trim()
  const lower = text.toLowerCase()
  if (!text) return { text: '嗯？你可以直接和我说。', emotion: 'happy', motion: 'greet' }
  if (/你好|hello|hi|嗨/.test(lower)) return { text: '你好呀，我在。今天想一起做点什么？', emotion: 'happy', motion: 'wave' }
  if (/累|疲惫|困|难受|不舒服/.test(text)) return { text: '那就先别把自己逼得太紧。你可以把最烦的那件事告诉我，我陪你拆开。', emotion: 'sad', motion: 'sad' }
  if (/成功|完成|搞定|通过|赢了|好了/.test(text)) return { text: '我看到了。做成这一步很值得高兴，下一步也可以继续交给我。', emotion: 'happy', motion: 'happy' }
  if (/想什么|思考|为什么|怎么办|怎么做/.test(text)) return { text: '让我想一下……现在最重要的是先把目标说清楚，再只做最短的一条可行路径。', emotion: 'thinking', motion: 'thinking' }
  if (/喜欢|可爱|漂亮|好看/.test(text)) return { text: '你这样说，我会有一点不好意思。', emotion: 'shy', motion: 'greet' }
  if (/生气|烦|讨厌|气死/.test(text)) return { text: '我听出来你现在很烦。先告诉我具体是哪一步出了问题，我直接帮你处理。', emotion: 'angry', motion: 'lookAround' }
  return { text: `我听到了：“${text}”。现在还是演示模式，但我的交互协议已经准备好，之后接上大模型就能真正理解并回应你。`, emotion: 'neutral', motion: 'greet' }
}

function sendMessage(text: string) {
  if (!text.trim()) return
  input.value = ''
  act({ text: '让我想一下…', emotion: 'thinking', motion: 'thinking' })
  window.setTimeout(() => act(replyFor(text)), 420)
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
addButtons('expressions', expressions, 'emotion', setEmotion)
addButtons('motions', motions, 'motion', playMotion)

function blink() {
  avatar.classList.add('blinking')
  window.setTimeout(() => avatar.classList.remove('blinking'), 130)
}
function scheduleBlink() {
  window.setTimeout(() => { blink(); scheduleBlink() }, 2300 + Math.random() * 3100)
}
scheduleBlink()

function scheduleIdle() {
  window.clearTimeout(idleTimer)
  idleTimer = window.setTimeout(() => {
    if (Date.now() - lastInteraction < 11000) return scheduleIdle()
    const options: NivaAction[] = [
      { text: '我还在这里。', emotion: 'neutral', motion: 'lookAround' },
      { text: '你可以直接和我说话，不用点那些按钮。', emotion: 'happy', motion: 'greet' },
      { text: '刚刚安静了一会儿，我在等你。', emotion: 'shy', motion: 'greet' },
    ]
    act(options[Math.floor(Math.random() * options.length)])
  }, 14000)
}
scheduleIdle()

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
  input.focus()
})

composer.addEventListener('submit', (event) => {
  event.preventDefault()
  sendMessage(input.value)
})
document.querySelectorAll<HTMLButtonElement>('[data-text]').forEach((button) => {
  button.addEventListener('click', () => sendMessage(button.dataset.text ?? ''))
})

voiceButton.addEventListener('click', () => {
  voiceEnabled = !voiceEnabled
  voiceButton.classList.toggle('active', voiceEnabled)
  voiceButton.textContent = voiceEnabled ? '语音 ON' : '语音'
})
function setDebug(open: boolean) {
  debugPanel.classList.toggle('open', open)
  debugPanel.setAttribute('aria-hidden', String(!open))
}
debugButton.addEventListener('click', () => setDebug(!debugPanel.classList.contains('open')))
debugClose.addEventListener('click', () => setDebug(false))

Object.assign(window, {
  NIVA: {
    act,
    setEmotion,
    motion: playMotion,
    blink,
    send: sendMessage,
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
      send(text: string): void
      readonly ready: boolean
      readonly mode: '2d-official'
    }
  }
}

setEmotion('neutral')
window.setTimeout(() => act({ text: '你好，我已经醒了。想和我聊点什么？', emotion: 'happy', motion: 'greet' }), 350)
