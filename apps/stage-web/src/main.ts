import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import './style.css'
import { AvatarRuntime } from './avatar/AvatarRuntime'
import { MotionController } from './avatar/MotionController'
import { NivaController } from './core/NivaController'
import type { MotionName, NivaAction, SemanticExpression } from './core/types'

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div class="shell">
    <div id="stage"></div>
    <div class="topbar">
      <div class="brand"><b>NIVA / DIGITAL LIFE</b><small>3D STAGE · VRM 1.0</small></div>
      <div class="status" id="status">INITIALIZING</div>
    </div>
    <div class="fps" id="fps">FPS: --</div>
    <aside class="panel">
      <h2>NIVA</h2>
      <p class="muted">功能冻结版：只保留表情、动作、生命感和统一控制契约。</p>
      <div class="label">Expression</div>
      <div class="buttons" id="expressions"></div>
      <div class="label">Motion</div>
      <div class="buttons" id="motions"></div>
      <div class="label">Scenario</div>
      <div class="scenario" id="scenarios"></div>
    </aside>
    <div class="speech" id="speech">正在唤醒 NIVA…</div>
  </div>`

const stage = document.querySelector<HTMLDivElement>('#stage')!
const speech = document.querySelector<HTMLDivElement>('#speech')!
const status = document.querySelector<HTMLDivElement>('#status')!
const fpsEl = document.querySelector<HTMLDivElement>('#fps')!

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x070a15)
scene.fog = new THREE.FogExp2(0x070a15, .035)

const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, .05, 100)
camera.position.set(0, 1.42, 4.7)

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
stage.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 1.25, 0)
controls.enableDamping = true
controls.enablePan = false
controls.minDistance = 3.0
controls.maxDistance = 6.2
controls.minPolarAngle = Math.PI * .30
controls.maxPolarAngle = Math.PI * .58

scene.add(new THREE.HemisphereLight(0xe8f9ff, 0x151525, 2.1))
const key = new THREE.DirectionalLight(0xf3fbff, 3.0)
key.position.set(2.8, 4.2, 3.5)
key.castShadow = true
scene.add(key)
const rim = new THREE.PointLight(0x8f6cff, 10, 7, 2)
rim.position.set(-2.2, 2.4, -1.5)
scene.add(rim)
const fill = new THREE.PointLight(0x50e8ff, 7, 6, 2)
fill.position.set(2.2, 1.3, 2.0)
scene.add(fill)

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(1.8, 96),
  new THREE.MeshStandardMaterial({ color: 0x111728, roughness: .72, metalness: .08 }),
)
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
scene.add(floor)

const avatar = new AvatarRuntime(scene)
const motions = new MotionController()
const niva = new NivaController(avatar, motions, (text) => { speech.textContent = text })

const expressionNames: SemanticExpression[] = ['neutral', 'happy', 'shy', 'sad', 'angry', 'surprised', 'thinking']
const motionNames: MotionName[] = ['wave', 'greet', 'thinking', 'happy', 'sad', 'lookAround']
const scenarios: Array<[string, NivaAction]> = [
  ['你好', { text: '你好呀，我一直在这里。', emotion: 'happy', motion: 'wave' }],
  ['你在想什么', { text: '我在想，下次还能学会什么。', emotion: 'thinking', motion: 'thinking' }],
  ['我成功了', { text: '太棒了！这个值得庆祝。', emotion: 'happy', motion: 'happy' }],
  ['我今天有点累', { text: '那今天就慢一点，我陪着你。', emotion: 'sad', motion: 'sad' }],
]

function addButtons<T extends string>(id: string, values: T[], onClick: (value: T) => void) {
  const host = document.querySelector<HTMLDivElement>(`#${id}`)!
  for (const value of values) {
    const button = document.createElement('button')
    button.textContent = value
    button.addEventListener('click', () => onClick(value))
    host.appendChild(button)
  }
}
addButtons('expressions', expressionNames, (emotion) => niva.act({ emotion }))
addButtons('motions', motionNames, (motion) => niva.act({ motion }))
const scenarioHost = document.querySelector<HTMLDivElement>('#scenarios')!
for (const [label, action] of scenarios) {
  const button = document.createElement('button')
  button.textContent = label
  button.addEventListener('click', () => niva.act(action))
  scenarioHost.appendChild(button)
}

renderer.domElement.addEventListener('pointermove', (event) => {
  const rect = renderer.domElement.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
  avatar.setLookTarget(x, y)
})
renderer.domElement.addEventListener('pointerleave', () => avatar.setLookTarget(0, 0))

async function boot() {
  try {
    status.textContent = 'LOADING AVATAR'
    await avatar.load('/avatar/NIVA.vrm')
    if (!avatar.vrm) throw new Error('VRM failed to initialize')
    motions.attach(avatar.vrm)

    const files: Partial<Record<MotionName, string>> = {
      idle: '/motions/idle.vrma',
      wave: '/motions/wave.vrma',
      greet: '/motions/greet.vrma',
      thinking: '/motions/thinking.vrma',
      happy: '/motions/happy.vrma',
      sad: '/motions/sad.vrma',
      surprised: '/motions/surprised.vrma',
      angry: '/motions/angry.vrma',
      lookAround: '/motions/lookAround.vrma',
    }
    await Promise.all(Object.entries(files).map(async ([name, url]) => {
      try { await motions.load(name as MotionName, url, avatar.vrm!) }
      catch (error) { console.warn(`Motion skipped: ${name}`, error) }
    }))
    motions.play('idle', .1)
    status.textContent = 'READY'
    speech.textContent = 'NIVA 已就绪。现在只专注把这个“人”做漂亮、做自然。'
  } catch (error) {
    console.error(error)
    status.textContent = 'ASSET NEEDED'
    status.classList.add('error')
    speech.innerHTML = '缺少 <code>public/avatar/NIVA.vrm</code>。代码骨架已经就绪，把正式 VRM 放进去即可接管身体。'
  }
}
boot()

Object.assign(window, { NIVA: { act: (action: NivaAction) => niva.act(action), get ready() { return !!avatar.vrm } } })

declare global {
  interface Window {
    NIVA: { act(action: NivaAction): void; readonly ready: boolean }
  }
}

const clock = new THREE.Clock()
let frames = 0
let fpsClock = performance.now()
function render() {
  requestAnimationFrame(render)
  const dt = Math.min(clock.getDelta(), .033)
  controls.update()
  niva.update(dt)
  renderer.render(scene, camera)

  frames++
  const now = performance.now()
  if (now - fpsClock >= 1000) {
    fpsEl.textContent = `FPS: ${frames}`
    frames = 0
    fpsClock = now
  }
}
render()

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})
