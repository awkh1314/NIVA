import './web-debug.css'
import type { MotionName, NivaAction, SemanticExpression } from './core/types'

type NivaDebugApi = {
  act(action: NivaAction): void
  send(text: string): void
  loadModel(url: string): Promise<boolean>
  setEmotion(emotion: SemanticExpression, intensity?: number): void
  setVoiceOutput(enabled: boolean): void
  motion(name?: MotionName): void
  readonly ready: boolean
  readonly voiceOutput: boolean
  readonly speaking: boolean
  readonly mode: string
}

type DebugWindow = Window & { NIVA?: NivaDebugApi }

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const emotions: Array<{ value: SemanticExpression; label: string }> = [
  { value: 'neutral', label: '自然' },
  { value: 'happy', label: '开心' },
  { value: 'shy', label: '害羞' },
  { value: 'thinking', label: '思考' },
  { value: 'sad', label: '低落' },
  { value: 'surprised', label: '惊讶' },
  { value: 'angry', label: '坚定' },
]

const motions: Array<{ value: MotionName; label: string }> = [
  { value: 'idle', label: '待机' },
  { value: 'greet', label: '回应' },
  { value: 'wave', label: '挥手' },
  { value: 'thinking', label: '思考' },
  { value: 'happy', label: '庆祝' },
  { value: 'sad', label: '安慰' },
  { value: 'surprised', label: '惊讶' },
  { value: 'angry', label: '坚定' },
  { value: 'lookAround', label: '观察' },
]

const customReactions: Record<string, NivaAction> = {
  curious: {
    emotion: 'thinking',
    expressionIntensity: .46,
    motion: 'custom',
    customReaction: {
      headYaw: .20,
      headPitch: -.08,
      headTilt: .34,
      bodyLean: .10,
      bodyTurn: .08,
      leftArm: 'down',
      rightArm: 'chest',
      energy: .48,
    },
  },
  open: {
    emotion: 'happy',
    expressionIntensity: .50,
    motion: 'custom',
    customReaction: {
      headTilt: -.12,
      bodyLean: .04,
      leftArm: 'open',
      rightArm: 'open',
      energy: .66,
    },
  },
  cheek: {
    emotion: 'shy',
    expressionIntensity: .40,
    motion: 'custom',
    customReaction: {
      headYaw: -.12,
      headTilt: -.24,
      leftArm: 'down',
      rightArm: 'cheek',
      energy: .42,
    },
  },
}

async function waitForNiva(): Promise<NivaDebugApi | null> {
  const target = window as DebugWindow
  for (let i = 0; i < 120; i += 1) {
    if (target.NIVA) return target.NIVA
    await sleep(50)
  }
  return null
}

function chipButtons(items: Array<{ value: string; label: string }>, attr: string) {
  return items.map((item) => `<button type="button" ${attr}="${item.value}">${item.label}</button>`).join('')
}

function setActiveButton(panel: HTMLElement, selector: string, value: string) {
  panel.querySelectorAll<HTMLButtonElement>(selector).forEach((button) => {
    button.classList.toggle('active', button.dataset.value === value)
  })
}

async function installWebDebugPanel() {
  if (isTauri()) return
  const niva = await waitForNiva()
  if (!niva) return

  document.documentElement.classList.add('niva-web-debug')

  const panel = document.createElement('aside')
  panel.id = 'webDebugPanel'
  panel.className = 'web-debug-panel'
  panel.innerHTML = `
    <div class="web-debug-head">
      <div class="web-debug-title">
        <b>DEBUG CONTROL</b>
        <span>网页调试台 · 直接控制 NIVA</span>
      </div>
      <div class="web-debug-head-actions">
        <span class="web-debug-live" id="webDebugLive">WAKING</span>
        <button type="button" id="webDebugCollapse" aria-label="折叠调试台">–</button>
      </div>
    </div>
    <div class="web-debug-scroll">
      <section class="web-debug-section web-debug-overview">
        <div class="web-debug-kpi"><span>人物</span><b id="webDebugReady">加载中</b></div>
        <div class="web-debug-kpi"><span>表情</span><b id="webDebugEmotionState">neutral</b></div>
        <div class="web-debug-kpi"><span>动作</span><b id="webDebugMotionState">idle</b></div>
      </section>

      <section class="web-debug-section">
        <div class="web-debug-section-head"><h3>表情</h3><output id="webDebugIntensityValue">35%</output></div>
        <input class="web-debug-range" id="webDebugIntensity" type="range" min="0" max="1" step="0.05" value="0.35" />
        <div class="web-debug-chips" id="webDebugEmotions">
          ${chipButtons(emotions.map(({ value, label }) => ({ value, label })), 'data-emotion')}
        </div>
      </section>

      <section class="web-debug-section">
        <div class="web-debug-section-head"><h3>预设动作</h3><span>直接触发</span></div>
        <div class="web-debug-chips" id="webDebugMotions">
          ${chipButtons(motions.map(({ value, label }) => ({ value, label })), 'data-motion')}
        </div>
      </section>

      <section class="web-debug-section">
        <div class="web-debug-section-head"><h3>自定义姿态</h3><span>测试 AI 动作通道</span></div>
        <div class="web-debug-chips">
          <button type="button" data-custom="curious">好奇歪头</button>
          <button type="button" data-custom="open">双手展开</button>
          <button type="button" data-custom="cheek">手贴脸颊</button>
        </div>
      </section>

      <section class="web-debug-section">
        <div class="web-debug-section-head"><h3>视线 / 视角</h3><span>拖拽人物仍可 360°</span></div>
        <div class="web-debug-lookpad">
          <button type="button" data-look="-0.55,-0.30">↖</button>
          <button type="button" data-look="0,-0.36">↑</button>
          <button type="button" data-look="0.55,-0.30">↗</button>
          <button type="button" data-look="-0.62,0">←</button>
          <button type="button" data-look="0,0" class="center">•</button>
          <button type="button" data-look="0.62,0">→</button>
          <button type="button" data-look="-0.55,0.28">↙</button>
          <button type="button" data-look="0,0.34">↓</button>
          <button type="button" data-look="0.55,0.28">↘</button>
        </div>
        <div class="web-debug-inline-actions">
          <button type="button" id="webDebugFront">恢复正面</button>
          <button type="button" id="webDebugReset">恢复默认状态</button>
        </div>
      </section>

      <section class="web-debug-section">
        <div class="web-debug-section-head"><h3>语音测试</h3><label class="web-debug-switch"><input id="webDebugVoice" type="checkbox" checked /><span>语音</span></label></div>
        <div class="web-debug-speak-row">
          <input id="webDebugSpeech" value="你好呀，我在这里。" maxlength="120" />
          <button type="button" id="webDebugSpeak">说这句</button>
        </div>
      </section>

      <section class="web-debug-section">
        <div class="web-debug-section-head"><h3>模型</h3><span>本地 VRM 临时测试</span></div>
        <input id="webDebugModelFile" type="file" accept=".vrm" hidden />
        <div class="web-debug-inline-actions">
          <button type="button" id="webDebugModel">载入本地 VRM</button>
          <button type="button" id="webDebugReload">刷新页面</button>
        </div>
        <p class="web-debug-note" id="webDebugNote">网页调试不会修改 EXE 的本地设置。</p>
      </section>
    </div>
  `

  document.querySelector('.shell')?.appendChild(panel)

  let intensity = .35
  let activeEmotion: SemanticExpression = 'neutral'
  let activeMotion: MotionName = 'idle'

  const live = panel.querySelector<HTMLElement>('#webDebugLive')!
  const ready = panel.querySelector<HTMLElement>('#webDebugReady')!
  const emotionState = panel.querySelector<HTMLElement>('#webDebugEmotionState')!
  const motionState = panel.querySelector<HTMLElement>('#webDebugMotionState')!
  const intensityInput = panel.querySelector<HTMLInputElement>('#webDebugIntensity')!
  const intensityValue = panel.querySelector<HTMLOutputElement>('#webDebugIntensityValue')!
  const voice = panel.querySelector<HTMLInputElement>('#webDebugVoice')!
  const speechInput = panel.querySelector<HTMLInputElement>('#webDebugSpeech')!
  const modelFile = panel.querySelector<HTMLInputElement>('#webDebugModelFile')!
  const note = panel.querySelector<HTMLElement>('#webDebugNote')!

  voice.checked = niva.voiceOutput
  setActiveButton(panel, '[data-emotion]', activeEmotion)
  setActiveButton(panel, '[data-motion]', activeMotion)

  const updateSelection = () => {
    emotionState.textContent = activeEmotion
    motionState.textContent = activeMotion
    setActiveButton(panel, '[data-emotion]', activeEmotion)
    setActiveButton(panel, '[data-motion]', activeMotion)
  }

  panel.querySelectorAll<HTMLButtonElement>('[data-emotion]').forEach((button) => {
    button.dataset.value = button.dataset.emotion ?? ''
    button.addEventListener('click', () => {
      activeEmotion = button.dataset.emotion as SemanticExpression
      niva.setEmotion(activeEmotion, intensity)
      updateSelection()
    })
  })

  panel.querySelectorAll<HTMLButtonElement>('[data-motion]').forEach((button) => {
    button.dataset.value = button.dataset.motion ?? ''
    button.addEventListener('click', () => {
      activeMotion = button.dataset.motion as MotionName
      niva.motion(activeMotion)
      updateSelection()
    })
  })

  intensityInput.addEventListener('input', () => {
    intensity = Number(intensityInput.value)
    intensityValue.value = `${Math.round(intensity * 100)}%`
    niva.setEmotion(activeEmotion, intensity)
  })

  panel.querySelectorAll<HTMLButtonElement>('[data-custom]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = customReactions[button.dataset.custom ?? '']
      if (!action) return
      activeEmotion = action.emotion ?? activeEmotion
      activeMotion = 'custom'
      niva.act(action)
      updateSelection()
    })
  })

  panel.querySelectorAll<HTMLButtonElement>('[data-look]').forEach((button) => {
    button.addEventListener('click', () => {
      const [x, y] = (button.dataset.look ?? '0,0').split(',').map(Number)
      niva.act({ lookTarget: { x, y } })
    })
  })

  voice.addEventListener('change', () => niva.setVoiceOutput(voice.checked))

  panel.querySelector<HTMLButtonElement>('#webDebugSpeak')!.addEventListener('click', () => {
    const text = speechInput.value.trim()
    if (!text) return
    niva.act({ text, emotion: activeEmotion, expressionIntensity: intensity })
  })
  speechInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    panel.querySelector<HTMLButtonElement>('#webDebugSpeak')!.click()
  })

  panel.querySelector<HTMLButtonElement>('#webDebugFront')!.addEventListener('click', () => {
    document.querySelector<HTMLElement>('#stage')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  })

  panel.querySelector<HTMLButtonElement>('#webDebugReset')!.addEventListener('click', () => {
    intensity = .35
    activeEmotion = 'neutral'
    activeMotion = 'idle'
    intensityInput.value = String(intensity)
    intensityValue.value = '35%'
    voice.checked = true
    niva.setVoiceOutput(true)
    niva.setEmotion(activeEmotion, intensity)
    niva.motion(activeMotion)
    niva.act({ lookTarget: { x: 0, y: 0 } })
    document.querySelector<HTMLElement>('#stage')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    updateSelection()
  })

  panel.querySelector<HTMLButtonElement>('#webDebugModel')!.addEventListener('click', () => modelFile.click())
  modelFile.addEventListener('change', async () => {
    const file = modelFile.files?.[0]
    if (!file) return
    note.textContent = `正在载入 ${file.name}…`
    const url = URL.createObjectURL(file)
    try {
      const ok = await niva.loadModel(url)
      note.textContent = ok ? `已载入 ${file.name}（仅当前网页会话）` : `${file.name} 载入失败`
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 5000)
      modelFile.value = ''
    }
  })

  panel.querySelector<HTMLButtonElement>('#webDebugReload')!.addEventListener('click', () => window.location.reload())
  panel.querySelector<HTMLButtonElement>('#webDebugCollapse')!.addEventListener('click', () => {
    const collapsed = document.documentElement.classList.toggle('niva-web-debug-collapsed')
    panel.querySelector<HTMLButtonElement>('#webDebugCollapse')!.textContent = collapsed ? '+' : '–'
  })

  window.setInterval(() => {
    ready.textContent = niva.ready ? '已加载' : '加载中'
    live.textContent = !niva.ready ? 'WAKING' : niva.speaking ? 'SPEAKING' : 'ALIVE'
    live.dataset.state = !niva.ready ? 'waking' : niva.speaking ? 'speaking' : 'alive'
  }, 220)
}

void installWebDebugPanel()
