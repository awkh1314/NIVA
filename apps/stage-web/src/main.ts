import './style.css'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import type { MotionName, NivaAction, SemanticExpression } from './core/types'

type Expression = SemanticExpression
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
let motion: { name: MotionName | 'idle'; start: number; duration: number } = { name: 'idle', start: 0, duration: Infinity }
let targetLookX = 0, targetLookY = 0, lookX = 0, lookY = 0
let nextBlink = performance.now() + 2200
let blinkStart = -1
let speakingUntil = 0
let typeTimer = 0
const rest = new Map<string, THREE.Quaternion>()

const emotionNames: Record<Expression, string | null> = { neutral: null, happy: 'happy', shy: 'happy', sad: 'sad', angry: 'angry', surprised: 'surprised', thinking: null }
const bone = (name: string) => vrm?.humanoid?.getNormalizedBoneNode(name) as THREE.Object3D | null

function rememberBones() {
  rest.clear()
  for (const n of ['hips','spine','chest','upperChest','neck','head','leftUpperArm','leftLowerArm','rightUpperArm','rightLowerArm']) {
    const b = bone(n); if (b) rest.set(n, b.quaternion.clone())
  }
}
function applyBone(name: string, x = 0, y = 0, z = 0) {
  const b = bone(name), q0 = rest.get(name); if (!b || !q0) return
  const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'))
  b.quaternion.copy(q0).multiply(dq)
}
function fitCamera() {
  if (!modelRoot) return
  const box = new THREE.Box3().setFromObject(modelRoot), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3())
  const h = Math.max(size.y, 1)
  camera.position.set(center.x, center.y + h * .02, center.z + h * 1.15)
  camera.lookAt(center.x, center.y + h * .02, center.z)
  camera.near = Math.max(.01, h / 100); camera.far = h * 20; camera.updateProjectionMatrix()
}
function resize() {
  const r = stage.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(r.height, 1); camera.updateProjectionMatrix()
}
new ResizeObserver(resize).observe(stage); resize()

function setExpression(emotion: Expression, intensity = .8) {
  activeEmotion = emotion; emotionIntensity = intensity; shell.dataset.emotion = emotion
}
function playMotion(name?: MotionName) {
  if (!name) return
  const duration: Partial<Record<MotionName, number>> = { wave: 1800, greet: 1350, thinking: 2200, happy: 1350, sad: 1900, lookAround: 2200, surprised: 1000, angry: 1000 }
  motion = { name, start: performance.now(), duration: duration[name] ?? 1500 }
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
  if (action.emotion) setExpression(action.emotion, action.expressionIntensity ?? .8)
  if (action.motion) playMotion(action.motion)
  if (action.lookTarget) { targetLookX = THREE.MathUtils.clamp(action.lookTarget.x, -1, 1); targetLookY = THREE.MathUtils.clamp(action.lookTarget.y, -1, 1) }
  if (action.text) typeText(action.text)
}

function replyFor(text: string): NivaAction {
  if (/你好|嗨|hello|hi/i.test(text)) return { text: '你好呀，我在这里。现在我终于不是一张卡片了。', emotion: 'happy', motion: 'wave' }
  if (/挥|招手|wave/i.test(text)) return { text: '看到我真的动起来了吗？', emotion: 'happy', motion: 'wave' }
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
  if (now >= nextBlink && blinkStart < 0) { blinkStart = now; nextBlink = now + 2600 + Math.random() * 3600 }
  if (blinkStart >= 0) {
    const t = (now - blinkStart) / 150; const v = t < .5 ? t * 2 : Math.max(0, 2 - t * 2); m.setValue('blink', v); if (t >= 1) { m.setValue('blink', 0); blinkStart = -1 }
  } else m.setValue('blink', 0)
  const speaking = now < speakingUntil
  const mouth = speaking ? .18 + Math.abs(Math.sin(now * .022)) * .58 : 0
  m.setValue('aa', mouth); m.setValue('ih', speaking ? Math.abs(Math.sin(now * .016 + 1.4)) * .18 : 0)
}

function updateBody(now: number) {
  if (!vrm) return
  const t = now / 1000, breath = Math.sin(t * 2.1), sway = Math.sin(t * .85)
  lookX += (targetLookX - lookX) * .08; lookY += (targetLookY - lookY) * .08
  let headX = -lookY * .11 + breath * .008, headY = lookX * .16 + sway * .015, headZ = sway * .01
  let chestX = breath * .015, chestY = sway * .018, chestZ = 0
  let rua = [0,0,0] as [number,number,number], rla = [0,0,0] as [number,number,number]
  let lua = [0,0,0] as [number,number,number], lla = [0,0,0] as [number,number,number]
  const p = Number.isFinite(motion.duration) ? THREE.MathUtils.clamp((now - motion.start) / motion.duration, 0, 1) : 0
  if (p >= 1 && motion.name !== 'idle') motion = { name: 'idle', start: now, duration: Infinity }
  if (motion.name === 'wave') { const e = Math.sin(Math.PI * p), w = Math.sin(p * Math.PI * 6); rua = [-.15, 0, -1.18 * e]; rla = [0, -.15, -.75 * e + w * .28 * e]; headZ -= .08 * e }
  if (motion.name === 'greet') { const e = Math.sin(Math.PI * p); headX += .15 * e; headZ += .05 * e }
  if (motion.name === 'thinking') { const e = Math.sin(Math.PI * p); headZ -= .12 * e; headY -= .11 * e; chestZ -= .04 * e; rua = [0,0,-.18*e]; rla = [0,0,-.52*e] }
  if (motion.name === 'happy') { const e = Math.sin(Math.PI * p), w = Math.sin(p*Math.PI*4)*e; chestZ += w*.045; lua = [0,0,.3*e]; rua=[0,0,-.3*e]; headX -= .08*e }
  if (motion.name === 'sad') { const e = Math.sin(Math.PI * p); headX += .18*e; chestX += .08*e; lua=[0,0,.08*e]; rua=[0,0,-.08*e] }
  if (motion.name === 'lookAround') { const e = Math.sin(Math.PI * p); headY += Math.sin(p*Math.PI*3)*.28*e }
  if (motion.name === 'surprised') headX -= Math.sin(Math.PI*p)*.12
  if (motion.name === 'angry') headY += Math.sin(p*Math.PI*10)*(1-p)*.08
  applyBone('chest', chestX, chestY, chestZ); applyBone('upperChest', chestX*.5, chestY*.5, chestZ*.5); applyBone('head', headX, headY, headZ)
  applyBone('rightUpperArm', ...rua); applyBone('rightLowerArm', ...rla); applyBone('leftUpperArm', ...lua); applyBone('leftLowerArm', ...lla)
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
    rememberBones(); fitCamera(); loadCard.classList.add('hidden'); statusText.textContent = 'ALIVE'
    act({ text: '你好，我已经醒了。', emotion: 'happy', motion: 'wave' })
  } catch (e) {
    console.error(e); statusText.textContent = 'MODEL NEEDED'; loadHint.textContent = '在线模型尚未放入部署目录。可以先直接载入你本地的 NIVA.vrm 体验。'; localModel.hidden = false
  }
}
loadVrm(modelUrl)

stage.addEventListener('pointermove', (e) => { const r = stage.getBoundingClientRect(); targetLookX = ((e.clientX-r.left)/r.width-.5)*2; targetLookY = ((e.clientY-r.top)/r.height-.5)*2 })
stage.addEventListener('pointerleave', () => { targetLookX = 0; targetLookY = 0 })
stage.addEventListener('pointerdown', () => { if (vrm) act({ text: '嗯？我在听。', emotion: 'happy', motion: 'greet' }); input.focus() })
composer.addEventListener('submit', (e) => { e.preventDefault(); send(input.value) })
document.querySelectorAll<HTMLButtonElement>('[data-text]').forEach((b) => b.onclick = () => send(b.dataset.text ?? ''))
localModel.onclick = () => modelFile.click()
modelFile.onchange = () => { const f = modelFile.files?.[0]; if (!f) return; const u = URL.createObjectURL(f); loadVrm(u).finally(() => setTimeout(() => URL.revokeObjectURL(u), 5000)) }

Object.assign(window, { NIVA: { act, send, setEmotion: setExpression, motion: playMotion, get ready(){ return !!vrm }, get mode(){ return 'vrm-3d' as const } } })
declare global { interface Window { NIVA: { act(a:NivaAction):void; send(t:string):void; setEmotion(e:Expression,i?:number):void; motion(m?:MotionName):void; readonly ready:boolean; readonly mode:'vrm-3d' } } }
