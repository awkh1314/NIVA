import './style.css'
import type { MotionName, NivaAction, SemanticExpression } from './core/types'

type Expression = SemanticExpression
type FrameClip = { frames: string[]; fps: number; loop?: boolean }
type PoseFrame = { x?: number; y?: number; scaleX?: number; scaleY?: number; rotate?: number }

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
      <div class="presence"><i></i><span id="presenceText">我在这里</span></div>
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
      <p class="debug-note">完整人物整帧渲染。所有动作都在固定画布内播放，不拆头、手、裙摆或头发。</p>
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

const expressions: Array<[Expression,string]> = [['neutral','平静'],['happy','开心'],['shy','害羞'],['thinking','思考'],['surprised','惊讶'],['sad','低落'],['angry','生气']]
const motions: Array<[MotionName,string]> = [['wave','挥手'],['greet','问候'],['thinking','思考'],['happy','雀跃'],['sad','安慰'],['lookAround','张望']]

const clips = new Map<string, FrameClip>()
const imageCache = new Map<string, HTMLImageElement>()
clips.set('idle', { frames: [fallbackFrame], fps: 6, loop: true })

const procedural: Record<string, PoseFrame[]> = {
  idle: [
    { y:0, scaleY:1 }, { y:-1, scaleY:1.0015 }, { y:-2, scaleY:1.003 },
    { y:-3, scaleY:1.004 }, { y:-2, scaleY:1.003 }, { y:-1, scaleY:1.0015 },
  ],
  greet: [{},{y:-2,rotate:.35},{y:-3,rotate:.6},{y:-2,rotate:.3},{y:0,rotate:-.15},{}],
  wave: [{},{x:-2,rotate:-.35},{x:2,rotate:.4},{x:-2,rotate:-.3},{x:1,rotate:.2},{}],
  thinking: [{},{y:1,rotate:-.35},{y:2,rotate:-.65},{y:2,rotate:-.65},{y:1,rotate:-.3},{}],
  happy: [{},{y:-4,scaleX:1.002,scaleY:1.002},{y:-10,scaleX:1.006,scaleY:1.006},{y:-5,scaleX:1.003,scaleY:1.003},{y:1,scaleY:.999},{}],
  sad: [{},{y:1,rotate:.15},{y:3,rotate:.3},{y:4,rotate:.35},{y:2,rotate:.18},{}],
  lookAround: [{},{x:-3,rotate:-.25},{x:-5,rotate:-.4},{x:4,rotate:.35},{x:2,rotate:.18},{}],
}

let voiceEnabled = false
let typeTimer = 0
let motionTimer = 0
let idleTimer = 0
let frameTimer = 0
let proceduralTimer = 0
let lastInteraction = Date.now()
let activeClip = 'idle'
let sourceReady = false

function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url)
  if (cached?.complete) return Promise.resolve(cached)
  return new Promise((resolve, reject) => {
    const img = cached ?? new Image()
    imageCache.set(url, img)
    img.onload = () => resolve(img)
    img.onerror = reject
    if (!img.src) img.src = url
  })
}

function renderWholeFrame(img: CanvasImageSource, pose: PoseFrame = {}) {
  const w = canvas.width, h = canvas.height
  const x = pose.x ?? 0, y = pose.y ?? 0
  const sx = pose.scaleX ?? 1, sy = pose.scaleY ?? 1
  const r = (pose.rotate ?? 0) * Math.PI / 180
  ctx.clearRect(0,0,w,h)
  ctx.save()
  ctx.translate(w/2 + x, h/2 + y)
  ctx.rotate(r)
  ctx.scale(sx, sy)
  ctx.drawImage(img, -w/2, -h/2, w, h)
  ctx.restore()
}

function stopFramePlayback() {
  clearInterval(frameTimer)
  clearInterval(proceduralTimer)
}

function playProcedural(name: string, loop = false, done?: () => void) {
  const frames = procedural[name]
  if (!frames?.length || !sourceReady) { done?.(); return false }
  stopFramePlayback()
  activeClip = name
  let i = 0
  const draw = () => {
    renderWholeFrame(source, frames[i])
    i += 1
    if (i >= frames.length) {
      if (loop) i = 0
      else {
        clearInterval(proceduralTimer)
        activeClip = 'idle'
        playProcedural('idle', true)
        done?.()
      }
    }
  }
  draw()
  proceduralTimer = window.setInterval(draw, 1000 / (name === 'idle' ? 6 : 9))
  return true
}

function preload(urls: string[]) { urls.forEach(url => { void loadImage(url) }) }

function registerFrames(name: string, frames: string[], fps = 10, loop = false) {
  const normalized = frames.filter(Boolean).map(f => f.startsWith('http') || f.startsWith('/') ? f : `${base}${f}`)
  if (!normalized.length) return false
  clips.set(name, { frames: normalized, fps: Math.max(1, Math.min(30, fps)), loop })
  preload(normalized)
  return true
}

function playFrames(name: string, done?: () => void) {
  const clip = clips.get(name)
  if (!clip || !clip.frames.length) return playProcedural(name.replace(/^motion:/,''), name === 'idle', done)
  if (name === 'idle' && clip.frames.length === 1 && clip.frames[0] === fallbackFrame) return playProcedural('idle', true, done)
  stopFramePlayback()
  activeClip = name
  let index = 0
  let busy = false
  const draw = async () => {
    if (busy) return
    busy = true
    try {
      const img = await loadImage(clip.frames[index])
      renderWholeFrame(img)
      index += 1
      if (index >= clip.frames.length) {
        if (clip.loop) index = 0
        else {
          stopFramePlayback(); activeClip = 'idle'; playFrames('idle'); done?.()
        }
      }
    } finally { busy = false }
  }
  void draw()
  frameTimer = window.setInterval(() => { void draw() }, 1000 / clip.fps)
  return true
}

source.onload = () => {
  canvas.width = source.naturalWidth || 540
  canvas.height = source.naturalHeight || 1370
  sourceReady = true
  imageCache.set(fallbackFrame, source)
  playProcedural('idle', true)
}
if (source.complete && source.naturalWidth) source.onload?.(new Event('load'))

function typeText(text:string){
  clearInterval(typeTimer); speech.textContent=''; let i=0
  typeTimer=window.setInterval(()=>{speech.textContent=text.slice(0,++i); if(i>=text.length) clearInterval(typeTimer)},20)
  if(voiceEnabled && 'speechSynthesis' in window){speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang='zh-CN'; u.rate=1.02; u.pitch=1.1; speechSynthesis.speak(u)}
}

function setEmotion(emotion:Expression,intensity=.8){
  shell.dataset.emotion=emotion
  shell.style.setProperty('--emotion-intensity',String(Math.max(0,Math.min(1,intensity))))
  presenceText.textContent=({neutral:'我在这里',happy:'心情很好',shy:'有一点害羞',thinking:'正在思考',surprised:'被你惊到了',sad:'陪你安静一会儿',angry:'有一点生气'} as Record<Expression,string>)[emotion]
  document.querySelectorAll<HTMLButtonElement>('[data-emotion]').forEach(b=>b.classList.toggle('active',b.dataset.emotion===emotion))
  if (clips.has(`emotion:${emotion}`)) playFrames(`emotion:${emotion}`)
}

function playMotion(motion?:MotionName){
  if(!motion)return
  clearTimeout(motionTimer)
  const clipName = `motion:${motion}`
  if (clips.has(clipName)) playFrames(clipName)
  else playProcedural(motion, false)
  document.querySelectorAll<HTMLButtonElement>('[data-motion]').forEach(b=>b.classList.toggle('active',b.dataset.motion===motion))
  motionTimer=window.setTimeout(()=>{
    document.querySelectorAll<HTMLButtonElement>('[data-motion]').forEach(b=>b.classList.remove('active'))
  },1500)
}

function act(action:NivaAction){
  lastInteraction=Date.now()
  if(action.emotion)setEmotion(action.emotion,action.expressionIntensity??.8)
  if(action.motion)playMotion(action.motion)
  if(action.text)typeText(action.text)
  scheduleIdle()
}

function replyFor(text:string):NivaAction{
  const t=text.trim(), l=t.toLowerCase()
  if(!t)return{text:'嗯？你可以直接和我说。',emotion:'happy',motion:'greet'}
  if(/你好|hello|hi|嗨/.test(l))return{text:'你好呀，我在。今天想一起做点什么？',emotion:'happy',motion:'greet'}
  if(/累|疲惫|困|难受|不舒服/.test(t))return{text:'那今天就慢一点。把最烦的那件事告诉我，我陪你拆开。',emotion:'sad',motion:'sad'}
  if(/成功|完成|搞定|通过|赢了|好了/.test(t))return{text:'我看到了。做到这一步值得庆祝。',emotion:'happy',motion:'happy'}
  if(/想什么|思考|为什么|怎么办|怎么做/.test(t))return{text:'让我想一下……先抓住真正重要的部分。',emotion:'thinking',motion:'thinking'}
  if(/喜欢|可爱|漂亮|好看/.test(t))return{text:'你这样说，我会有一点不好意思。',emotion:'shy',motion:'greet'}
  return{text:`我听到了：“${t}”。现在还是本地演示逻辑，后面接大模型后会真正理解你。`,emotion:'neutral',motion:'greet'}
}

function sendMessage(text:string){
  const t=text.trim(); if(!t)return
  input.value=''; userLine.hidden=false; userLine.textContent=t
  act({text:'让我想一下…',emotion:'thinking',motion:'thinking'})
  setTimeout(()=>act(replyFor(t)),380)
}

function addButtons<T extends string>(id:string,values:Array<[T,string]>,attr:string,fn:(v:T)=>void){
  const host=document.querySelector<HTMLElement>(`#${id}`)!
  for(const [v,label] of values){const b=document.createElement('button'); b.textContent=label; b.dataset[attr]=v; b.onclick=()=>fn(v); host.appendChild(b)}
}
addButtons('expressions',expressions,'emotion',setEmotion)
addButtons('motions',motions,'motion',playMotion)

function scheduleIdle(){
  clearTimeout(idleTimer)
  idleTimer=window.setTimeout(()=>{
    if(Date.now()-lastInteraction<12000)return scheduleIdle()
    const pool:NivaAction[]=[{text:'我还在这里。',emotion:'neutral',motion:'lookAround'},{text:'刚刚安静了一会儿，我在等你。',emotion:'shy',motion:'greet'}]
    act(pool[Math.floor(Math.random()*pool.length)])
  },15000)
}
scheduleIdle()

stage.addEventListener('pointerdown',()=>{act({text:'嗯？我在听。',emotion:'happy',motion:'greet'}); input.focus()})
composer.addEventListener('submit',e=>{e.preventDefault();sendMessage(input.value)})
document.querySelectorAll<HTMLButtonElement>('[data-text]').forEach(b=>b.onclick=()=>sendMessage(b.dataset.text??''))
voiceButton.onclick=()=>{voiceEnabled=!voiceEnabled;voiceButton.classList.toggle('active',voiceEnabled);voiceButton.textContent=voiceEnabled?'语音 ON':'语音'}
function setDebug(open:boolean){debugPanel.classList.toggle('open',open);debugPanel.setAttribute('aria-hidden',String(!open))}
debugButton.onclick=()=>setDebug(!debugPanel.classList.contains('open')); debugClose.onclick=()=>setDebug(false)

Object.assign(window,{NIVA:{
  act,setEmotion,motion:playMotion,send:sendMessage,registerFrames,playFrames,
  get ready(){return sourceReady},get mode(){return '2d-full-frame-canvas' as const},get clip(){return activeClip}
}})

declare global{interface Window{NIVA:{
  act(action:NivaAction):void; setEmotion(emotion:Expression,intensity?:number):void; motion(motion?:MotionName):void; send(text:string):void;
  registerFrames(name:string,frames:string[],fps?:number,loop?:boolean):boolean; playFrames(name:string):boolean;
  readonly ready:boolean; readonly mode:'2d-full-frame-canvas'; readonly clip:string
}}}

setEmotion('neutral')
setTimeout(()=>act({text:'你好，我已经醒了。现在所有动作都在完整人物画面里播放。',emotion:'happy',motion:'greet'}),300)
