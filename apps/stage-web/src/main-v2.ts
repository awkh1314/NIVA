import './style.css'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { RawMotionController } from './avatar/RawMotionController'
import { isVoiceSpeaking, speakVoice, stopVoice } from './voice-output'
import type { CustomReaction, MotionName, NivaAction, SemanticExpression } from './core/types'

type Expression = SemanticExpression
type LifeState = 'idle' | 'attention' | 'listening' | 'thinking' | 'speaking' | 'backstage'

const base = import.meta.env.BASE_URL
const modelUrl = `${base}NIVA.vrm?v=avatar-sample-a-3`
const DESKTOP_MODE = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
// Web remains a fast motion/debug stage. The packaged product rests quietly.
const DEFAULT_MOTION: MotionName = DESKTOP_MODE ? 'idle' : 'dance'

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
<main class="shell" data-emotion="neutral" data-life-state="idle">
  <div class="ambient ambient-a"></div><div class="ambient ambient-b"></div>
  <header class="topbar">
    <div class="brand"><strong>NIVA</strong><span>DIGITAL LIFE</span></div>
    <div class="status"><i></i><span id="statusText">WAKING</span></div>
  </header>
  <section class="stage" id="stage">
    <canvas id="scene"></canvas>
    <div class="floor"></div>
    <div class="load-card" id="loadCard"><strong>正在唤醒 NIVA</strong><span id="loadHint">加载身体、表情与生命行为…</span><button id="localModel" hidden>载入本地 NIVA.vrm</button><input id="modelFile" type="file" accept=".vrm" hidden></div>
  </section>
  <section class="conversation">
    <div class="dialog"><div id="userLine" class="user-line" hidden></div><div class="niva-line"><b>NIVA</b><span id="speechText">我在。</span></div></div>
    <form id="composer" class="composer"><input id="messageInput" maxlength="240" autocomplete="off" placeholder="和 NIVA 说点什么…"><button>发送</button></form>
    <div class="quick"><button data-text="你好">你好</button><button data-text="跳舞给我看">跳舞</button><button data-text="挥挥手">挥挥手</button><button data-text="我今天有点累">我有点累</button><button data-text="我成功了">我成功了</button></div>
  </section>
</main>`

const shell = document.querySelector<HTMLElement>('.shell')!
const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const stage = document.querySelector<HTMLElement>('#stage')!
const statusText = document.querySelector<HTMLElement>('#statusText')!
const loadCard = document.querySelector<HTMLElement>('#loadCard')!
const loadHint = document.querySelector<HTMLElement>('#loadHint')!
const localModel = document.querySelector<HTMLButtonElement>('#localModel')!
const modelFile = document.querySelector<HTMLInputElement>('#modelFile')!
const speech = document.querySelector<HTMLElement>('#speechText')!
const userLine = document.querySelector<HTMLElement>('#userLine')!
const composer = document.querySelector<HTMLFormElement>('#composer')!
const input = document.querySelector<HTMLInputElement>('#messageInput')!

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100)
const clock = new THREE.Clock()
const rawMotion = new RawMotionController()

scene.add(new THREE.HemisphereLight(0xdff8ff, 0x0b1021, 2.2))
const key = new THREE.DirectionalLight(0xffffff, 2.7); key.position.set(1.7, 2.8, 2.6); key.castShadow = true; scene.add(key)
const rim = new THREE.DirectionalLight(0x9c7cff, 2.0); rim.position.set(-2.2, 2.0, -1.6); scene.add(rim)
const cyan = new THREE.PointLight(0x60eaff, 14, 5); cyan.position.set(1.5, 1.4, 1.6); scene.add(cyan)

let vrm: any = null
let modelRoot: THREE.Object3D | null = null
let activeEmotion: Expression = DESKTOP_MODE ? 'neutral' : 'happy'
let emotionIntensity = DESKTOP_MODE ? 0 : .42
let motion: { name: MotionName; start: number; duration: number } = { name: DEFAULT_MOTION, start: performance.now(), duration: Infinity }
let activeCustomReaction: CustomReaction | null = null
let lookX = 0, lookY = 0, targetLookX = 0, targetLookY = 0
let pointerAttentionUntil = 0
let explicitLookUntil = 0
let nextGazeShift = performance.now() + 3600
let nextBlink = performance.now() + 4800
let blinkStart = -1
let faceWarmupUntil = performance.now() + 2600
let speakingUntil = 0
let typeTimer = 0
let lastInteraction = performance.now()
let nextAutonomy = performance.now() + (DESKTOP_MODE ? 28000 : 9000)
let voiceEnabled = true
let lifeState: LifeState = 'idle'
let tapPointerId = -1
let tapStartX = 0
let tapStartY = 0
let tapStartAt = 0
let tapMoved = false
let tapTimer = 0

// three-vrm normalizes most VRM0 preset names, but older samples can still expose
// legacy/custom aliases. Test available expressions instead of assuming one spelling.
const expressionCandidates: Record<Expression, string[]> = {
  neutral: ['neutral', 'Neutral'],
  happy: ['happy', 'joy', 'Joy'],
  shy: ['relaxed', 'fun', 'Fun', 'happy', 'joy', 'Joy'],
  sad: ['sad', 'sorrow', 'Sorrow'],
  angry: ['angry', 'Angry'],
  surprised: ['surprised', 'Surprised'],
  thinking: [],
}

const emotionScale: Record<Expression, number> = {
  neutral: 0,
  happy: .38,
  shy: .26,
  sad: .32,
  angry: .30,
  surprised: .30,
  thinking: 0,
}

function fitCamera() {
  if (!modelRoot) return
  modelRoot.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(modelRoot)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const r = stage.getBoundingClientRect()
  const aspect = Math.max(r.width / Math.max(r.height, 1), .25)
  camera.aspect = aspect
  const vFov = THREE.MathUtils.degToRad(camera.fov)
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
  const distanceY = (size.y * .5) / Math.tan(vFov / 2)
  const distanceX = (size.x * .5) / Math.tan(hFov / 2)
  const distance = Math.max(distanceX, distanceY, .5) * 1.18
  camera.position.set(center.x, center.y + size.y * .015, center.z + distance)
  camera.lookAt(center.x, center.y + size.y * .015, center.z)
  camera.near = Math.max(.01, distance / 100)
  camera.far = distance + Math.max(size.z, size.y) * 8
  camera.updateProjectionMatrix()
}

function resize() {
  const r = stage.getBoundingClientRect()
  renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false)
  camera.aspect = r.width / Math.max(r.height, 1)
  if (modelRoot) fitCamera(); else camera.updateProjectionMatrix()
}
new ResizeObserver(resize).observe(stage)
resize()

function setExpression(emotion: Expression, intensity = .8) {
  activeEmotion = emotion
  emotionIntensity = THREE.MathUtils.clamp(intensity, 0, 1)
  shell.dataset.emotion = emotion
}

function setLifeState(state: LifeState) {
  if (lifeState === state) return
  const previous = lifeState
  lifeState = state
  shell.dataset.lifeState = state

  // Deliberate interaction states own the body. Autonomous micro-actions wait until
  // the user-facing activity has settled instead of firing over listening/thinking.
  if (state !== 'idle' && state !== 'attention') {
    nextAutonomy = Math.max(nextAutonomy, performance.now() + 16000)
  }
  if (state === 'listening') {
    targetLookX = 0
    targetLookY = 0
    explicitLookUntil = performance.now() + 1600
  }
  if (DESKTOP_MODE && state === 'idle' && previous !== 'idle' && motion.name === 'idle') {
    setExpression('neutral', 0)
  }
}

function effectiveLifeState(now: number): LifeState {
  if (now < speakingUntil || isVoiceSpeaking()) return 'speaking'
  return lifeState
}

function playMotion(name?: MotionName) {
  if (!name) return
  lastInteraction = performance.now()
  if (name !== 'custom') activeCustomReaction = null
  const duration: Partial<Record<MotionName, number>> = {
    idle: Infinity,
    dance: Infinity,
    wave: 2200,
    greet: 1500,
    thinking: 3000,
    happy: 1900,
    sad: 2300,
    lookAround: 2600,
    surprised: 1200,
    angry: 1400,
    custom: 2300,
  }
  motion = { name, start: performance.now(), duration: duration[name] ?? 1800 }
}

function setVoiceOutput(enabled: boolean) {
  voiceEnabled = enabled
  if (!enabled) {
    speakingUntil = 0
    stopVoice()
  }
}

function speakText(text: string) {
  clearInterval(typeTimer)
  speech.textContent = ''
  let i = 0
  typeTimer = window.setInterval(() => {
    speech.textContent = text.slice(0, ++i)
    if (i >= text.length) clearInterval(typeTimer)
  }, 16)
  speakingUntil = performance.now() + Math.max(900, text.length * 82)

  if (voiceEnabled) {
    void speakVoice(text, { lang: 'zh-CN', rate: .96, pitch: 1.04 })
  }
}

function act(action: NivaAction) {
  lastInteraction = performance.now()
  if (action.emotion) setExpression(action.emotion, action.expressionIntensity ?? .8)
  if (action.customReaction) activeCustomReaction = action.customReaction
  if (action.motion) playMotion(action.motion)
  if (action.lookTarget) {
    targetLookX = THREE.MathUtils.clamp(action.lookTarget.x, -1, 1)
    targetLookY = THREE.MathUtils.clamp(action.lookTarget.y, -1, 1)
    explicitLookUntil = performance.now() + 2600
  }
  if (action.text) speakText(action.text)
}

function localReply(text: string): NivaAction {
  if (/跳舞|舞蹈|dance/i.test(text)) return { text: '好呀，看我跳一段。', emotion: 'happy', expressionIntensity: .42, motion: 'dance' }
  if (/你好|嗨|hello|hi/i.test(text)) return { text: '你好，我在。刚刚还在想你什么时候会叫我。', emotion: 'happy', motion: 'wave' }
  if (/挥|招手|wave/i.test(text)) return { text: '看到啦。', emotion: 'happy', motion: 'wave' }
  if (/累|难受|疲惫|困/.test(text)) return { text: '那就把节奏放慢一点。我陪你把眼前这件事处理完。', emotion: 'sad', motion: 'greet' }
  if (/成功|完成|搞定|赢|通过/.test(text)) return { text: '很好。这个值得开心一下。', emotion: 'happy', motion: 'happy' }
  if (/想|为什么|怎么办|怎么做/.test(text)) return { text: '我在想。先抓最关键的变量，再决定下一步。', emotion: 'thinking', motion: 'thinking' }
  if (/漂亮|可爱|喜欢|好看/.test(text)) return { text: '嗯……这句话我记住了。', emotion: 'shy', motion: 'greet' }
  return { text: `我听到了：“${text}”。DeepSeek 接通后，我会真正理解并继续回答。`, emotion: 'neutral', motion: 'greet' }
}

function send(text: string) {
  const t = text.trim()
  if (!t) return
  input.value = ''
  userLine.hidden = false
  userLine.textContent = t
  act({ text: '让我想一下…', emotion: 'thinking', motion: 'thinking' })
  window.setTimeout(() => act(localReply(t)), 420)
}

function setFirstAvailableExpression(manager: any, candidates: string[], value: number) {
  for (const name of candidates) {
    if (manager.getExpression?.(name)) {
      manager.setValue(name, value)
      return name
    }
  }
  return null
}

function updateFace(now: number) {
  const manager = vrm?.expressionManager
  if (!manager) return

  // Reset every registered expression, including legacy/custom aliases. This prevents
  // an old expression from leaking into the next debug selection.
  manager.resetValues?.()

  const candidates = expressionCandidates[activeEmotion]
  if (candidates.length) {
    setFirstAvailableExpression(manager, candidates, emotionIntensity * emotionScale[activeEmotion])
  }

  // Hold the eyes open just after a model load so startup cannot freeze on a blink.
  if (now >= faceWarmupUntil) {
    if (now >= nextBlink && blinkStart < 0) {
      blinkStart = now
      nextBlink = now + 3600 + Math.random() * 4800
    }
    if (blinkStart >= 0) {
      const t = (now - blinkStart) / 118
      const v = t < .5 ? t * 2 : Math.max(0, 2 - t * 2)
      setFirstAvailableExpression(manager, ['blink', 'Blink'], v * .78)
      if (t >= 1) blinkStart = -1
    }
  }

  // Subtle lip sync only; use aliases so VRM0 a/i and VRM1 aa/ih both work.
  if (now < speakingUntil || isVoiceSpeaking()) {
    const aa = .028 + Math.abs(Math.sin(now * .017)) * .070
    const ih = Math.abs(Math.sin(now * .011 + .8)) * .016
    setFirstAvailableExpression(manager, ['aa', 'a', 'A'], aa)
    setFirstAvailableExpression(manager, ['ih', 'i', 'I'], ih)
  }
}

function updateLife(now: number) {
  const state = effectiveLifeState(now)
  shell.dataset.lifeState = state

  // Gaze cadence is stateful: attentive/listening states stay with the user, speaking
  // makes tiny conversational glances, while idle wanders slowly instead of darting.
  if (state === 'listening' || state === 'attention') {
    if (now > pointerAttentionUntil && now > explicitLookUntil) {
      targetLookX = 0
      targetLookY = 0
    }
  } else if (state === 'thinking') {
    if (now > pointerAttentionUntil && now > explicitLookUntil && now > nextGazeShift) {
      targetLookX = -.10 + (Math.random() * 2 - 1) * .10
      targetLookY = -.04 + (Math.random() * 2 - 1) * .06
      nextGazeShift = now + 4200 + Math.random() * 2800
    }
  } else if (state === 'speaking') {
    if (now > pointerAttentionUntil && now > explicitLookUntil && now > nextGazeShift) {
      const meetEyes = Math.random() < .72
      targetLookX = meetEyes ? 0 : (Math.random() * 2 - 1) * .12
      targetLookY = meetEyes ? 0 : (Math.random() * 2 - 1) * .06
      nextGazeShift = now + 3000 + Math.random() * 2600
    }
  } else if (state !== 'backstage' && now > pointerAttentionUntil && now > explicitLookUntil && now > nextGazeShift) {
    const returnToUser = Math.random() < .56
    targetLookX = returnToUser ? 0 : (Math.random() * 2 - 1) * .28
    targetLookY = returnToUser ? 0 : (Math.random() * 2 - 1) * .13
    nextGazeShift = now + 4600 + Math.random() * 5000
  }

  lookX += (targetLookX - lookX) * .065
  lookY += (targetLookY - lookY) * .065

  // A short explicit reaction can end while NIVA is still speaking or thinking. In
  // that case return only the body to idle and keep the expression until the state ends.
  if (Number.isFinite(motion.duration) && now - motion.start >= motion.duration) {
    activeCustomReaction = null
    motion = { name: DEFAULT_MOTION, start: now, duration: Infinity }
    if (!DESKTOP_MODE) {
      setExpression('happy', .42)
    } else if (state === 'idle' || state === 'attention') {
      setExpression('neutral', 0)
    }
  }

  // Desktop autonomy is deliberately sparse. Breathing, weight shift and gaze are
  // continuous; only occasionally layer a small acknowledgement or look-around action.
  const passiveState = state === 'idle' || state === 'attention'
  const quietFor = now - lastInteraction
  if (passiveState && motion.name === 'idle' && now > nextAutonomy && quietFor > (DESKTOP_MODE ? 10000 : 5000)) {
    let chosen: MotionName
    if (DESKTOP_MODE) {
      chosen = Math.random() < .68 ? 'lookAround' : 'greet'
      setExpression('neutral', 0)
      nextAutonomy = now + 28000 + Math.random() * 38000
    } else {
      const pool: MotionName[] = ['lookAround', 'lookAround', 'greet', 'thinking']
      chosen = pool[Math.floor(Math.random() * pool.length)]
      setExpression('neutral', 0)
      nextAutonomy = now + 14000 + Math.random() * 18000
    }
    playMotion(chosen)
  }

  rawMotion.update(now, motion, lookX, lookY, activeCustomReaction, state)
}

function animate() {
  const dt = Math.min(clock.getDelta(), .05)
  const now = performance.now()
  updateLife(now)
  updateFace(now)
  vrm?.update(dt)
  renderer.render(scene, camera)
}
renderer.setAnimationLoop(animate)

const loader = new GLTFLoader()
loader.register((parser) => new VRMLoaderPlugin(parser, { autoUpdateHumanBones: false }))

async function loadVrm(url: string) {
  loadCard.classList.remove('hidden')
  loadHint.textContent = '加载身体、表情与生命行为…'
  localModel.hidden = true
  statusText.textContent = 'WAKING'
  try {
    const gltf = await loader.loadAsync(url)
    if (modelRoot) scene.remove(modelRoot)
    vrm = gltf.userData.vrm
    if (!vrm) throw new Error('文件不是有效 VRM')
    VRMUtils.removeUnnecessaryVertices(vrm.scene)
    VRMUtils.combineSkeletons(vrm.scene)
    modelRoot = vrm.scene
    scene.add(modelRoot)
    modelRoot.traverse((object: any) => {
      if (object.isMesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })

    rawMotion.attach(vrm)
    activeCustomReaction = null
    const now = performance.now()
    faceWarmupUntil = now + 2600
    nextBlink = faceWarmupUntil + 2200 + Math.random() * 1800
    blinkStart = -1
    pointerAttentionUntil = 0
    explicitLookUntil = 0
    nextGazeShift = now + 3200
    targetLookX = 0
    targetLookY = 0
    setLifeState('idle')

    if (DESKTOP_MODE) {
      // A short silent acknowledgement makes launch feel intentional. Product-level
      // onboarding/return logic decides whether NIVA actually speaks.
      setExpression('happy', .28)
      motion = { name: 'greet', start: now, duration: 1500 }
    } else {
      setExpression('happy', .42)
      motion = { name: DEFAULT_MOTION, start: now, duration: Infinity }
    }

    updateLife(now)
    vrm.update(0)
    fitCamera()
    loadCard.classList.add('hidden')
    statusText.textContent = DESKTOP_MODE ? 'ALIVE' : 'ALIVE · DANCE'
    nextAutonomy = now + (DESKTOP_MODE ? 28000 + Math.random() * 16000 : 8500)
    if (!DESKTOP_MODE) speakText('我在。')
    return true
  } catch (error) {
    console.error(error)
    statusText.textContent = 'MODEL NEEDED'
    loadHint.textContent = '没有找到 NIVA.vrm。你也可以直接载入本地模型。'
    localModel.hidden = false
    return false
  }
}
void loadVrm(modelUrl)

stage.addEventListener('pointermove', (event) => {
  const r = stage.getBoundingClientRect()
  targetLookX = ((event.clientX - r.left) / r.width - .5) * 2
  targetLookY = ((event.clientY - r.top) / r.height - .5) * 2
  pointerAttentionUntil = performance.now() + 900

  if (event.pointerId === tapPointerId) {
    const dx = event.clientX - tapStartX
    const dy = event.clientY - tapStartY
    if (dx * dx + dy * dy > 64) tapMoved = true
  }
})
stage.addEventListener('pointerleave', () => {
  pointerAttentionUntil = 0
  nextGazeShift = Math.min(nextGazeShift, performance.now() + 420)
})
stage.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  tapPointerId = event.pointerId
  tapStartX = event.clientX
  tapStartY = event.clientY
  tapStartAt = performance.now()
  tapMoved = false
})
stage.addEventListener('pointerup', (event) => {
  if (event.pointerId !== tapPointerId) return
  const wasTap = !tapMoved && performance.now() - tapStartAt < 520
  tapPointerId = -1
  if (!wasTap || !vrm) return

  clearTimeout(tapTimer)
  tapTimer = window.setTimeout(() => {
    if (shell.classList.contains('backstage-open')) return
    lastInteraction = performance.now()
    act({ text: '嗯？我在听。', emotion: 'happy', motion: 'greet' })
  }, 230)
})
stage.addEventListener('pointercancel', (event) => {
  if (event.pointerId === tapPointerId) tapPointerId = -1
})
stage.addEventListener('dblclick', () => {
  clearTimeout(tapTimer)
})
composer.addEventListener('submit', (event) => { event.preventDefault(); send(input.value) })
document.querySelectorAll<HTMLButtonElement>('[data-text]').forEach((button) => {
  button.onclick = () => send(button.dataset.text ?? '')
})
localModel.onclick = () => modelFile.click()
modelFile.onchange = () => {
  const file = modelFile.files?.[0]
  if (!file) return
  const url = URL.createObjectURL(file)
  loadVrm(url).finally(() => window.setTimeout(() => URL.revokeObjectURL(url), 5000))
}

function currentModelInfo() {
  const metaVersion = String(vrm?.meta?.metaVersion ?? vrm?.metaVersion ?? '?')
  const name = String(vrm?.meta?.name ?? vrm?.meta?.title ?? 'VRM')
  const expressions = Object.keys(vrm?.expressionManager?.expressionMap ?? {})
  return { name, version: metaVersion, expressions }
}

Object.assign(window, {
  NIVA: {
    act,
    send,
    loadModel: loadVrm,
    setEmotion: setExpression,
    setVoiceOutput,
    setLifeState,
    motion: playMotion,
    get ready() { return !!vrm },
    get voiceOutput() { return voiceEnabled },
    get speaking() { return performance.now() < speakingUntil || isVoiceSpeaking() },
    get lifeState() { return effectiveLifeState(performance.now()) },
    get modelInfo() { return currentModelInfo() },
    get mode() { return 'vrm-raw-motion' as const },
  },
})