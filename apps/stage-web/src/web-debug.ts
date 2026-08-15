import './web-debug.css'
import type { MotionName, NivaAction, SemanticExpression } from './core/types'

type ModelInfo = {
  name: string
  version: string
  expressions: string[]
}

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
  readonly modelInfo: ModelInfo
  readonly mode: string
}

type DebugWindow = Window & { NIVA?: NivaDebugApi }

type MotionProfile = {
  value: MotionName
  label: string
  emotion: SemanticExpression
  intensity: number
}

type StoredModel = {
  key: string
  name: string
  blob: Blob
  updatedAt: number
}

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const MODEL_DB = 'niva-web-debug-assets-v1'
const MODEL_STORE = 'models'
const MODEL_KEY = 'active-vrm'

const emotions: Array<{ value: SemanticExpression; label: string }> = [
  { value: 'neutral', label: '自然' },
  { value: 'happy', label: '开心' },
  { value: 'shy', label: '柔和/害羞' },
  { value: 'sad', label: '难过' },
  { value: 'surprised', label: '惊讶' },
  { value: 'angry', label: '生气' },
]

const motions: MotionProfile[] = [
  { value: 'idle', label: '自然站立', emotion: 'neutral', intensity: .25 },
  { value: 'greet', label: '点头回应', emotion: 'neutral', intensity: .25 },
  { value: 'wave', label: '右手挥手', emotion: 'happy', intensity: .42 },
  { value: 'thinking', label: '托腮思考', emotion: 'thinking', intensity: .30 },
  { value: 'happy', label: '双手庆祝', emotion: 'happy', intensity: .48 },
  { value: 'sad', label: '低头难过', emotion: 'sad', intensity: .38 },
  { value: 'surprised', label: '受惊抬手', emotion: 'surprised', intensity: .42 },
  { value: 'angry', label: '严肃站姿', emotion: 'angry', intensity: .36 },
  { value: 'lookAround', label: '左右观察', emotion: 'neutral', intensity: .25 },
]

const customReactions: Record<string, NivaAction> = {
  curious: {
    emotion: 'thinking',
    expressionIntensity: .30,
    motion: 'custom',
    customReaction: {
      headYaw: .18,
      headPitch: -.04,
      headTilt: .26,
      bodyLean: .06,
      bodyTurn: .06,
      leftArm: 'down',
      rightArm: 'chest',
      energy: .42,
    },
  },
  open: {
    emotion: 'happy',
    expressionIntensity: .42,
    motion: 'custom',
    customReaction: {
      headTilt: -.08,
      bodyLean: .02,
      leftArm: 'open',
      rightArm: 'open',
      energy: .58,
    },
  },
  cheek: {
    emotion: 'shy',
    expressionIntensity: .34,
    motion: 'custom',
    customReaction: {
      headYaw: -.10,
      headTilt: -.18,
      leftArm: 'down',
      rightArm: 'cheek',
      energy: .38,
    },
  },
}

function openModelDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const request = indexedDB.open(MODEL_DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(MODEL_STORE)) db.createObjectStore(MODEL_STORE, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
  })
}

async function saveStoredModel(file: File): Promise<void> {
  const db = await openModelDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MODEL_STORE, 'readwrite')
    const request = tx.objectStore(MODEL_STORE).put({
      key: MODEL_KEY,
      name: file.name,
      blob: file,
      updatedAt: Date.now(),
    } satisfies StoredModel)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('model save failed'))
  })
  db.close()
}

async function loadStoredModel(): Promise<StoredModel | null> {
  const db = await openModelDb()
  const value = await new Promise<StoredModel | null>((resolve, reject) => {
    const tx = db.transaction(MODEL_STORE, 'readonly')
    const request = tx.objectStore(MODEL_STORE).get(MODEL_KEY)
    request.onsuccess = () => resolve((request.result as StoredModel | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('model read failed'))
  })
  db.close()
  return value
}

async function clearStoredModel(): Promise<void> {
  const db = await openModelDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MODEL_STORE, 'readwrite')
    const request = tx.objectStore(MODEL_STORE).delete(MODEL_KEY)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('model delete failed'))
  })
  db.close()
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
        <div class="web-debug-section-head"><h3>动作</h3><span>动作与对应表情一起触发</span></div>
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
        <div class="web-debug-section-head"><h3>模型</h3><span>载入一次，浏览器自动记住</span></div>
        <input id="webDebugModelFile" type="file" accept=".vrm" hidden />
        <div class="web-debug-inline-actions">
          <button type="button" id="webDebugModel">载入并记住 VRM</button>
          <button type="button" id="webDebugClearModel">清除本地模型</button>
          <button type="button" id="webDebugReload">刷新页面</button>
        </div>
        <p class="web-debug-note" id="webDebugNote">在线模型仅作兼容回退。请载入你本机的 AvatarSample_A.vrm；成功后以后刷新会自动恢复这个文件。</p>
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

  const setIntensity = (value: number) => {
    intensity = value
    intensityInput.value = String(value)
    intensityValue.value = `${Math.round(value * 100)}%`
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
      const profile = motions.find((item) => item.value === button.dataset.motion)
      if (!profile) return
      activeMotion = profile.value
      activeEmotion = profile.emotion
      setIntensity(profile.intensity)
      niva.act({
        motion: profile.value,
        emotion: profile.emotion,
        expressionIntensity: profile.intensity,
      })
      updateSelection()
    })
  })

  intensityInput.addEventListener('input', () => {
    setIntensity(Number(intensityInput.value))
    niva.setEmotion(activeEmotion, intensity)
  })

  panel.querySelectorAll<HTMLButtonElement>('[data-custom]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = customReactions[button.dataset.custom ?? '']
      if (!action) return
      activeEmotion = action.emotion ?? activeEmotion
      activeMotion = 'custom'
      setIntensity(action.expressionIntensity ?? intensity)
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
    activeEmotion = 'neutral'
    activeMotion = 'idle'
    setIntensity(.25)
    voice.checked = true
    niva.setVoiceOutput(true)
    niva.act({ emotion: 'neutral', expressionIntensity: .25, motion: 'idle', lookTarget: { x: 0, y: 0 } })
    document.querySelector<HTMLElement>('#stage')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    updateSelection()
  })

  panel.querySelector<HTMLButtonElement>('#webDebugModel')!.addEventListener('click', () => modelFile.click())
  modelFile.addEventListener('change', async () => {
    const file = modelFile.files?.[0]
    if (!file) return
    note.textContent = `正在校验并载入 ${file.name}…`
    const url = URL.createObjectURL(file)
    try {
      const ok = await niva.loadModel(url)
      if (!ok) {
        note.textContent = `${file.name} 载入失败，没有保存。`
        return
      }
      try {
        await saveStoredModel(file)
        const info = niva.modelInfo
        note.textContent = `已载入并记住 ${file.name} · VRM${info.version}。之后刷新网页会自动恢复。`
      } catch (error) {
        console.warn(error)
        note.textContent = `已载入 ${file.name}，但浏览器未能持久保存；本次会话仍可测试。`
      }
      activeEmotion = 'neutral'
      activeMotion = 'idle'
      setIntensity(.25)
      niva.act({ emotion: 'neutral', expressionIntensity: .25, motion: 'idle' })
      updateSelection()
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 5000)
      modelFile.value = ''
    }
  })

  panel.querySelector<HTMLButtonElement>('#webDebugClearModel')!.addEventListener('click', async () => {
    try {
      await clearStoredModel()
      note.textContent = '已清除浏览器保存的本地模型。刷新后会回到在线兼容模型。'
    } catch (error) {
      console.warn(error)
      note.textContent = '清除失败：当前浏览器不允许访问本地模型存储。'
    }
  })

  panel.querySelector<HTMLButtonElement>('#webDebugReload')!.addEventListener('click', () => window.location.reload())
  panel.querySelector<HTMLButtonElement>('#webDebugCollapse')!.addEventListener('click', () => {
    const collapsed = document.documentElement.classList.toggle('niva-web-debug-collapsed')
    panel.querySelector<HTMLButtonElement>('#webDebugCollapse')!.textContent = collapsed ? '+' : '–'
  })

  const restoreStoredModel = async () => {
    try {
      const stored = await loadStoredModel()
      if (!stored) {
        const info = niva.modelInfo
        note.textContent = `当前在线兼容模型：${info.name} · VRM${info.version}。建议载入你本机的 AvatarSample_A.vrm 作为实际调试模型。`
        return
      }
      note.textContent = `正在恢复浏览器保存的 ${stored.name}…`
      const url = URL.createObjectURL(stored.blob)
      try {
        const ok = await niva.loadModel(url)
        if (!ok) {
          note.textContent = `${stored.name} 恢复失败，请重新选择文件。`
          return
        }
        const info = niva.modelInfo
        note.textContent = `已自动恢复 ${stored.name} · VRM${info.version}。这是当前调试模型。`
        niva.act({ emotion: 'neutral', expressionIntensity: .25, motion: 'idle' })
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 5000)
      }
    } catch (error) {
      console.warn(error)
      const info = niva.modelInfo
      note.textContent = `当前模型：${info.name} · VRM${info.version}。本地模型自动恢复不可用。`
    }
  }

  window.setInterval(() => {
    const info = niva.modelInfo
    ready.textContent = niva.ready ? `${info.name} · VRM${info.version}` : '加载中'
    live.textContent = !niva.ready ? 'WAKING' : niva.speaking ? 'SPEAKING' : 'ALIVE'
    live.dataset.state = !niva.ready ? 'waking' : niva.speaking ? 'speaking' : 'alive'
  }, 220)

  void restoreStoredModel()
}

void installWebDebugPanel()
