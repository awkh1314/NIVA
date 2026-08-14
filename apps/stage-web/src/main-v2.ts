import './style.css'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { RawMotionController } from './avatar/RawMotionController'
import type { MotionName, NivaAction, SemanticExpression } from './core/types'

type Expression = SemanticExpression
const base = import.meta.env.BASE_URL
const modelUrl = `${base}NIVA.vrm`

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
<main class="shell" data-emotion="thinking">
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
    <div class="dialog"><div id="userLine" class="user-line" hidden></div><div class="niva-line"><b>NIVA</b><span id="speechText">我在想一件事情…</span></div></div>
    <form id="composer" class="composer"><input id="messageInput" maxlength="240" autocomplete="off" placeholder="和 NIVA 说点什么…"><button>发送</button></form>
    <div class="quick"><button data-text="你好">你好</button><button data-text="挥挥手">挥挥手</button><button data-text="我今天有点累">我有点累</button><button data-text="我成功了">我成功了</button></div>
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
let activeEmotion: Expression = 'thinking'
let emotionIntensity = .8
let motion: { name: MotionName; start: number; duration: number } = { name: 'thinking', start: performance.now(), duration: 6500 }
let lookX = 0, lookY = 0, targetLookX = 0, targetLookY = 0
let nextBlink = performance.now() + 2800
let blinkStart = -1
let speakingUntil = 0
let typeTimer = 0
let lastInteraction = performance.now()
let nextAutonomy = performance.now() + 9000
let voiceEnabled = true

const emotionNames: Record<Expression, string | null> = {
  neutral: null, happy: 'happy', shy: 'happy', sad: 'sad', angry: 'angry', surprised: 'surprised', thinking: null,
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

function playMotion(name?: MotionName) {
  if (!name) return
  lastInteraction = performance.now()
  const duration: Partial<Record<MotionName, number>> = {
    idle: Infinity,
    wave: 2200,
    greet: 1500,
    thinking: 3000,
    happy: 1900,
    sad: 2300,
    lookAround: 2600,
    surprised: 1200,
    angry: 1200,
  }
  motion = { name, start: performance.now(), duration: duration[name] ?? 1800 }
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

  if (voiceEnabled && 'speechSynthesis' in window) {
    speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 1.03
    utterance.pitch = 1.10
    speechSynthesis.speak(utterance)
  }
}

function act(action: NivaAction) {
  lastInteraction = performance.now()
  if (action.emotion) setExpression(action.emotion, action.expressionIntensity ?? .8)
  if (action.motion) playMotion(action.motion)
  if (action.lookTarget) {
    targetLookX = THREE.MathUtils.clamp(action.lookTarget.x, -1, 1)
    targetLookY = THREE.MathUtils.clamp(action.lookTarget.y, -1, 1)
  }
  if (action.text) speakText(action.text)
}

function localReply(text: string): NivaAction {
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

function updateFace(now: number) {
  const manager = vrm?.expressionManager
  if (!manager) return
  for (const name of ['happy','sad','angry','surprised','blink','aa','ih']) manager.setValue(name, 0)

  const mapped = emotionNames[activeEmotion]
  if (mapped) manager.setValue(mapped, emotionIntensity * (activeEmotion === 'shy' ? .55 : 1))
  if (activeEmotion === 'thinking') manager.setValue('surprised', .16)

  if (now >= nextBlink && blinkStart < 0) {
    blinkStart = now
    nextBlink = now + 2800 + Math.random() * 4200
  }
  if (blinkStart >= 0) {
    const t = (now - blinkStart) / 145
    const v = t < .5 ? t * 2 : Math.max(0, 2 - t * 2)
    manager.setValue('blink', v)
    if (t >= 1) blinkStart = -1
  }

  if (now < speakingUntil) {
    manager.setValue('aa', .16 + Math.abs(Math.sin(now * .021)) * .52)
    manager.setValue('ih', Math.abs(Math.sin(now * .015 + 1.2)) * .16)
  }
}

function updateLife(now: number) {
  lookX += (targetLookX - lookX) * .075
  lookY += (targetLookY - lookY) * .075

  if (Number.isFinite(motion.duration) && now - motion.start >= motion.duration) {
    motion = { name: 'idle', start: now, duration: Infinity }
    nextAutonomy = now + 5500 + Math.random() * 5000
  }

  if (motion.name === 'idle' && now > nextAutonomy && now - lastInteraction > 4000) {
    const pool: MotionName[] = ['lookAround', 'thinking', 'greet', 'happy']
    const chosen = pool[Math.floor(Math.random() * pool.length)]
    if (chosen === 'happy') setExpression('happy', .72)
    else if (chosen === 'thinking') setExpression('thinking', .72)
    else setExpression('neutral', .7)
    playMotion(chosen)
  }

  rawMotion.update(now, motion, lookX, lookY)
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
    setExpression('thinking', .76)
    motion = { name: 'thinking', start: performance.now(), duration: 6500 }
    updateLife(performance.now())
    vrm.update(0)
    fitCamera()
    loadCard.classList.add('hidden')
    statusText.textContent = 'ALIVE'
    nextAutonomy = performance.now() + 8500
    speakText('我在。')
  } catch (error) {
    console.error(error)
    statusText.textContent = 'MODEL NEEDED'
    loadHint.textContent = '没有找到 NIVA.vrm。你也可以直接载入本地模型。'
    localModel.hidden = false
  }
}
void loadVrm(modelUrl)

stage.addEventListener('pointermove', (event) => {
  const r = stage.getBoundingClientRect()
  targetLookX = ((event.clientX - r.left) / r.width - .5) * 2
  targetLookY = ((event.clientY - r.top) / r.height - .5) * 2
})
stage.addEventListener('pointerleave', () => { targetLookX = 0; targetLookY = 0 })
stage.addEventListener('pointerdown', () => {
  lastInteraction = performance.now()
  if (vrm) act({ text: '嗯？我在听。', emotion: 'happy', motion: 'greet' })
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

Object.assign(window, {
  NIVA: {
    act,
    send,
    setEmotion: setExpression,
    motion: playMotion,
    get ready() { return !!vrm },
    get mode() { return 'vrm-raw-motion' as const },
  },
})
