import './style.css'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import type { MotionName, NivaAction, SemanticExpression } from './core/types'

type Expression = SemanticExpression
type CuteMotion = MotionName | 'shyCute' | 'heart' | 'peek'
const base = import.meta.env.BASE_URL
const modelUrl = `${base}NIVA.vrm`

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
<main class="shell" data-emotion="neutral">
  <div class="ambient a"></div><div class="ambient b"></div>
  <header class="topbar"><div class="brand"><strong>NIVA</strong><span>DIGITAL LIFE · VRM</span></div><div class="status"><i></i><span id="statusText">LOADING</span></div></header>
  <section class="stage" id="stage"><canvas id="scene"></canvas><div class="floor"></div><div class="load-card" id="loadCard"><strong>正在唤醒 NIVA</strong><span id="loadHint">加载 3D 身体、表情与物理系统…</span><button id="localModel" hidden>载入本地 NIVA.vrm</button><input id="modelFile" type="file" accept=".vrm" hidden></div></section>
  <section class="conversation">
    <div class="dialog"><div id="userLine" class="user-line" hidden></div><div class="niva-line"><b>NIVA</b><span id="speechText">我正在醒来…</span></div></div>
    <form id="composer"><input id="messageInput" maxlength="180" autocomplete="off" placeholder="和 NIVA 说点什么…"><button>发送</button></form>
    <div class="quick"><button data-text="你好">你好</button><button data-text="挥挥手">挥挥手</button><button data-text="我今天有点累">我有点累</button><button data-text="我成功了">我成功了</button></div>
    <div class="quick pose-quick"><button data-cute="wave">招手</button><button data-cute="shyCute">害羞</button><button data-cute="heart">比心</button><button data-cute="peek">歪头</button><button data-cute="happy">开心</button></div>
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
scene.add(new THREE.HemisphereLight(0xdff8ff, 0x0b1021, 2.25))
const key = new THREE.DirectionalLight(0xffffff, 2.9); key.position.set(1.7, 2.8, 2.6); key.castShadow = true; scene.add(key)
const rim = new THREE.DirectionalLight(0x9c7cff, 2.1); rim.position.set(-2.2, 2.0, -1.6); scene.add(rim)
const cyan = new THREE.PointLight(0x60eaff, 16, 5); cyan.position.set(1.5, 1.4, 1.6); scene.add(cyan)

let vrm: any = null
let modelRoot: THREE.Object3D | null = null
let voiceEnabled = true
let activeEmotion: Expression = 'neutral'
let emotionIntensity = .8
let motion: { name: CuteMotion | 'idle'; start: number; duration: number } = { name: 'idle', start: 0, duration: Infinity }
let targetLookX = 0, targetLookY = 0, lookX = 0, lookY = 0
let nextBlink = performance.now() + 2200
let blinkStart = -1
let speakingUntil = 0
let typeTimer = 0
let lastInteraction = performance.now()
let nextAutoCute = performance.now() + 7000

const emotionNames: Record<Expression, string | null> = { neutral: null, happy: 'happy', shy: 'happy', sad: 'sad', angry: 'angry', surprised: 'surprised', thinking: null }

function quat(x = 0, y = 0, z = 0): [number, number, number, number] {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'))
  return [q.x, q.y, q.z, q.w]
}
function fitCamera() {
  if (!modelRoot) return
  const box = new THREE.Box3().setFromObject(modelRoot)
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3())
  const r = stage.getBoundingClientRect(), aspect = Math.max(r.width / Math.max(r.height, 1), .25)
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
new ResizeObserver(resize).observe(stage); resize()

function setExpression(emotion: Expression, intensity = .8) { activeEmotion = emotion; emotionIntensity = intensity; shell.dataset.emotion = emotion }
function playMotion(name?: CuteMotion) {
  if (!name) return
  lastInteraction = performance.now()
  const duration: Partial<Record<CuteMotion, number>> = {
    wave: 2100, greet: 1500, thinking: 2300, happy: 1500, sad: 1900, lookAround: 2200,
    surprised: 1000, angry: 1000, shyCute: 2400, heart: 2600, peek: 1900,
  }
  motion = { name, start: performance.now(), duration: duration[name] ?? 1600 }
}
function typeText(text: string) {
  clearInterval(typeTimer); speech.textContent = ''; let i = 0
  typeTimer = window.setInterval(() => { speech.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(typeTimer) }, 18)
  speakingUntil = performance.now() + Math.max(900, text.length * 85)
  if (voiceEnabled && 'speechSynthesis' in window) {
    speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'zh-CN'; u.rate = 1.04; u.pitch = 1.12; speechSynthesis.speak(u)
  }
}
function act(action: NivaAction) {
  lastInteraction = performance.now()
  if (action.emotion) setExpression(action.emotion, action.expressionIntensity ?? .8)
  if (action.motion) playMotion(action.motion)
  if (action.lookTarget) { targetLookX = THREE.MathUtils.clamp(action.lookTarget.x, -1, 1); targetLookY = THREE.MathUtils.clamp(action.lookTarget.y, -1, 1) }
  if (action.text) typeText(action.text)
}

function replyFor(text: string): NivaAction {
  if (/你好|嗨|hello|hi/i.test(text)) return { text: '你好呀，我在这里。', emotion: 'happy', motion: 'wave' }
  if (/挥|招手|wave/i.test(text)) return { text: '当然可以。', emotion: 'happy', motion: 'wave' }
  if (/累|难受|疲惫|困/.test(text)) return { text: '那今天就慢一点。把最麻烦的事情交给我，我们一件件处理。', emotion: 'sad', motion: 'sad' }
  if (/成功|完成|搞定|赢|通过/.test(text)) return { text: '做到了。这个时候应该好好庆祝一下。', emotion: 'happy', motion: 'happy' }
  if (/想|为什么|怎么办|怎么做/.test(text)) return { text: '让我想一下。先找最关键的问题，再走最短的解决路径。', emotion: 'thinking', motion: 'thinking' }
  if (/漂亮|可爱|喜欢|好看/.test(text)) return { text: '你这么说，我会有一点不好意思。', emotion: 'shy', motion: 'greet' }
  return { text: `我听到了：“${text}”。现在先用本地演示逻辑，下一步再把这里接给 DeepSeek。`, emotion: 'neutral', motion: 'greet' }
}
function send(text: string) {
  const t = text.trim(); if (!t) return
  input.value = ''; userLine.hidden = false; userLine.textContent = t
  act({ text: '让我想一下…', emotion: 'thinking', motion: 'thinking' })
  setTimeout(() => act(replyFor(t)), 420)
}

function updateFace(now: number) {
  const m = vrm?.expressionManager; if (!m) return
  for (const n of ['happy','sad','angry','surprised']) m.setValue(n, 0)
  const mapped = emotionNames[activeEmotion]; if (mapped) m.setValue(mapped, emotionIntensity * (activeEmotion === 'shy' ? .48 : 1))
  if (motion.name === 'shyCute') m.setValue('happy', .5)
  if (motion.name === 'heart') m.setValue('happy', .75)
  if (now >= nextBlink && blinkStart < 0) { blinkStart = now; nextBlink = now + 2600 + Math.random() * 3600 }
  if (blinkStart >= 0) {
    const t = (now - blinkStart) / 150, v = t < .5 ? t * 2 : Math.max(0, 2 - t * 2)
    m.setValue('blink', v); if (t >= 1) { m.setValue('blink', 0); blinkStart = -1 }
  } else m.setValue('blink', 0)
  const speaking = now < speakingUntil
  m.setValue('aa', speaking ? .18 + Math.abs(Math.sin(now * .022)) * .58 : 0)
  m.setValue('ih', speaking ? Math.abs(Math.sin(now * .016 + 1.4)) * .18 : 0)
}

function updateBody(now: number) {
  if (!vrm?.humanoid) return
  const t = now / 1000, breath = Math.sin(t * 2.0), sway = Math.sin(t * .72), micro = Math.sin(t * .31)
  lookX += (targetLookX - lookX) * .075; lookY += (targetLookY - lookY) * .075

  // 直接用 VRM 的 normalized pose 写完整姿态；它是相对 T-Pose 的标准化姿势。
  let hips = [0, sway * .012, -.025 + micro * .007] as [number,number,number]
  let spine = [breath * .008, -sway * .008, .018 + micro * .004] as [number,number,number]
  let chest = [breath * .015, sway * .014, .022 + micro * .006] as [number,number,number]
  let head = [-lookY * .11 + breath * .006, lookX * .16 + sway * .012, -.035 + sway * .014] as [number,number,number]

  // A-Pose / relaxed idle: arms sit clearly below the shoulders instead of staying horizontal.
  let lua = [.08, -.12, 1.32 + sway * .016] as [number,number,number]
  let lla = [.04, .03, .24 + breath * .012] as [number,number,number]
  let rua = [.08, .12, -1.32 - sway * .016] as [number,number,number]
  let rla = [.04, -.03, -.24 - breath * .012] as [number,number,number]
  let lul = [0, 0, .035] as [number,number,number]
  let rul = [0, 0, -.035] as [number,number,number]
  let lll = [0, 0, 0] as [number,number,number]
  let rll = [0, 0, 0] as [number,number,number]

  const p = Number.isFinite(motion.duration) ? THREE.MathUtils.clamp((now - motion.start) / motion.duration, 0, 1) : 0
  if (p >= 1 && motion.name !== 'idle') {
    motion = { name: 'idle', start: now, duration: Infinity }
    nextAutoCute = now + 6500 + Math.random() * 4500
  }
  const e = Math.sin(Math.PI * p)

  if (motion.name === 'wave') {
    const w = Math.sin(p * Math.PI * 7) * e
    rua = [-.1, .02, -2.35 + .45 * (1-e)]
    rla = [.12, -.05, -1.05 + w * .38]
    head[2] -= .08 * e; chest[2] += .04 * e
  } else if (motion.name === 'greet') {
    head[0] += .16 * e; head[2] += .06 * e; chest[0] += .035 * e
  } else if (motion.name === 'thinking') {
    head[2] -= .13 * e; head[1] -= .1 * e
    rua = [.18, .04, -1.62]; rla = [.12, -.08, -1.12 * e - .3]
  } else if (motion.name === 'happy') {
    const bounce = Math.sin(p * Math.PI * 4) * e
    chest[0] -= .04 * e; chest[2] += bounce * .05
    lua = [.02,-.08,1.78]; rua = [.02,.08,-1.78]
    lla = [-.12,.03,.48]; rla = [-.12,-.03,-.48]
    head[0] -= .09 * e
  } else if (motion.name === 'sad') {
    head[0] += .2 * e; chest[0] += .09 * e; chest[2] -= .035 * e
    lua[2] -= .1 * e; rua[2] += .1 * e
  } else if (motion.name === 'lookAround') {
    head[1] += Math.sin(p * Math.PI * 3) * .3 * e
  } else if (motion.name === 'surprised') {
    head[0] -= .12 * e; lua[2] += .18 * e; rua[2] -= .18 * e
  } else if (motion.name === 'angry') {
    head[1] += Math.sin(p * Math.PI * 10) * (1-p) * .08
  } else if (motion.name === 'shyCute') {
    head[0] += .08 * e; head[2] -= .15 * e; chest[2] -= .06 * e
    lua = [.15,-.08,1.72]; lla = [-.05,.02,.95]
    rua = [.15,.08,-1.72]; rla = [-.05,-.02,-.95]
  } else if (motion.name === 'heart') {
    head[0] -= .045 * e; chest[0] -= .025 * e
    lua = [.08,-.15,1.72]; rua = [.08,.15,-1.72]
    lla = [-.08,-.2,.92]; rla = [-.08,.2,-.92]
  } else if (motion.name === 'peek') {
    head[2] -= .22 * e; chest[2] -= .08 * e; hips[2] += .045 * e
    lua[2] += .08 * e; rua[2] += .08 * e
  }

  const pose: any = {
    hips: { rotation: quat(...hips) }, spine: { rotation: quat(...spine) },
    chest: { rotation: quat(...chest) }, upperChest: { rotation: quat(chest[0]*.45, chest[1]*.45, chest[2]*.45) },
    head: { rotation: quat(...head) },
    leftUpperArm: { rotation: quat(...lua) }, leftLowerArm: { rotation: quat(...lla) },
    rightUpperArm: { rotation: quat(...rua) }, rightLowerArm: { rotation: quat(...rla) },
    leftUpperLeg: { rotation: quat(...lul) }, rightUpperLeg: { rotation: quat(...rul) },
    leftLowerLeg: { rotation: quat(...lll) }, rightLowerLeg: { rotation: quat(...rll) },
  }
  vrm.humanoid.setNormalizedPose(pose)

  // 没有操作时也会偶尔自己做一个小动作，避免像静态模型。
  if (motion.name === 'idle' && now > nextAutoCute && now - lastInteraction > 4500) {
    const pool: CuteMotion[] = ['peek', 'shyCute', 'wave', 'happy']
    playMotion(pool[Math.floor(Math.random() * pool.length)])
  }
}

function animate() {
  const dt = Math.min(clock.getDelta(), .05), now = performance.now()
  updateBody(now); updateFace(now); vrm?.update(dt); renderer.render(scene, camera)
}
renderer.setAnimationLoop(animate)

const loader = new GLTFLoader(); loader.register((parser) => new VRMLoaderPlugin(parser))
async function loadVrm(url: string) {
  loadCard.classList.remove('hidden'); loadHint.textContent = '加载 3D 身体、表情与物理系统…'; localModel.hidden = true; statusText.textContent = 'LOADING'
  try {
    const gltf = await loader.loadAsync(url)
    if (modelRoot) scene.remove(modelRoot)
    vrm = gltf.userData.vrm
    if (!vrm) throw new Error('文件不是有效 VRM')
    VRMUtils.removeUnnecessaryVertices(vrm.scene); VRMUtils.combineSkeletons(vrm.scene)
    modelRoot = vrm.scene; scene.add(modelRoot)
    modelRoot.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    updateBody(performance.now()); vrm.update(0); fitCamera()
    loadCard.classList.add('hidden'); statusText.textContent = 'ALIVE'
    nextAutoCute = performance.now() + 6000
    act({ text: '你好，我在这里。', emotion: 'happy', motion: 'greet' })
  } catch (e) {
    console.error(e); statusText.textContent = 'MODEL NEEDED'; loadHint.textContent = '在线模型尚未放入部署目录。可以先直接载入你本地的 NIVA.vrm 体验。'; localModel.hidden = false
  }
}
loadVrm(modelUrl)

stage.addEventListener('pointermove', (e) => { const r = stage.getBoundingClientRect(); targetLookX = ((e.clientX-r.left)/r.width-.5)*2; targetLookY = ((e.clientY-r.top)/r.height-.5)*2 })
stage.addEventListener('pointerleave', () => { targetLookX = 0; targetLookY = 0 })
stage.addEventListener('pointerdown', () => { lastInteraction = performance.now(); if (vrm) act({ text: '嗯？我在听。', emotion: 'happy', motion: 'greet' }); input.focus() })
composer.addEventListener('submit', (e) => { e.preventDefault(); send(input.value) })
document.querySelectorAll<HTMLButtonElement>('[data-text]').forEach((b) => b.onclick = () => send(b.dataset.text ?? ''))
document.querySelectorAll<HTMLButtonElement>('[data-cute]').forEach((b) => b.onclick = () => {
  const name = b.dataset.cute as CuteMotion
  if (name === 'shyCute') setExpression('shy', .75)
  else if (name === 'heart' || name === 'happy' || name === 'wave') setExpression('happy', .85)
  playMotion(name)
})
localModel.onclick = () => modelFile.click()
modelFile.onchange = () => { const f = modelFile.files?.[0]; if (!f) return; const u = URL.createObjectURL(f); loadVrm(u).finally(() => setTimeout(() => URL.revokeObjectURL(u), 5000)) }

Object.assign(window, { NIVA: { act, send, setEmotion: setExpression, motion: playMotion, playCute: playMotion, get ready(){ return !!vrm }, get mode(){ return 'vrm-3d' as const } } })
declare global { interface Window { NIVA: { act(a:NivaAction):void; send(t:string):void; setEmotion(e:Expression,i?:number):void; motion(m?:MotionName):void; playCute(m:CuteMotion):void; readonly ready:boolean; readonly mode:'vrm-3d' } } }
