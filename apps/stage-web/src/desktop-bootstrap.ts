import './desktop.css'
import {
  askDeepSeek,
  getSettings,
  installTextModeToggle,
  isTauri,
  saveSettings,
  setupDesktopWindow,
  startDefaultVoiceInput,
} from './desktop'
import type {
  ArmPose,
  CustomReaction,
  DesktopSettings,
  InteractionMode,
  MotionName,
  NivaAction,
  SemanticExpression,
} from './core/types'

type NivaRuntime = {
  act(action: NivaAction): void
  send(text: string): void
  loadModel(url: string): Promise<boolean>
  setVoiceOutput(enabled: boolean): void
  readonly ready: boolean
  readonly voiceOutput: boolean
}

const BASE = import.meta.env.BASE_URL
const LEARNED_KEY = 'niva.learned-reactions.v1'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const runtime = () => (window as unknown as { NIVA?: NivaRuntime }).NIVA

const presetReactions: Record<string, MotionName> = {
  greet: 'greet',
  hello: 'greet',
  wave: 'wave',
  celebrate: 'happy',
  happy: 'happy',
  comfort: 'sad',
  sad: 'sad',
  think: 'thinking',
  thinking: 'thinking',
  surprise: 'surprised',
  surprised: 'surprised',
  anger: 'angry',
  angry: 'angry',
  'look-around': 'lookAround',
  lookaround: 'lookAround',
  idle: 'idle',
}

const allowedEmotions = new Set<SemanticExpression>(['neutral', 'happy', 'shy', 'sad', 'angry', 'surprised', 'thinking'])
const allowedMotions = new Set<MotionName>(['idle', 'wave', 'greet', 'thinking', 'happy', 'sad', 'lookAround', 'surprised', 'angry', 'custom'])
const allowedArms = new Set<ArmPose>(['down', 'open', 'up', 'cheek', 'forward', 'chest'])

function normalizeKey(key: string | undefined): string {
  return String(key ?? '').trim().toLowerCase().replace(/[_\s]+/g, '-')
}

function clamp(value: unknown, fallback = 0, min = -1, max = 1): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}

function sanitizeCustom(value: CustomReaction | undefined): CustomReaction | undefined {
  if (!value) return undefined
  const leftArm = allowedArms.has(value.leftArm as ArmPose) ? value.leftArm : 'down'
  const rightArm = allowedArms.has(value.rightArm as ArmPose) ? value.rightArm : 'down'
  return {
    headYaw: clamp(value.headYaw),
    headPitch: clamp(value.headPitch),
    headTilt: clamp(value.headTilt),
    bodyLean: clamp(value.bodyLean),
    bodyTurn: clamp(value.bodyTurn),
    leftArm,
    rightArm,
    energy: clamp(value.energy, .65, 0, 1),
  }
}

function loadLearned(): Record<string, CustomReaction> {
  try {
    const raw = localStorage.getItem(LEARNED_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveLearned(map: Record<string, CustomReaction>) {
  localStorage.setItem(LEARNED_KEY, JSON.stringify(map))
}

function learnedCount(): number {
  return Object.keys(loadLearned()).length
}

function resolveReaction(action: NivaAction): NivaAction {
  const key = normalizeKey(action.reactionKey)
  const preset = presetReactions[key]
  if (preset) {
    return { ...action, motion: preset, customReaction: undefined }
  }

  const learned = loadLearned()
  if (key && learned[key]) {
    return { ...action, motion: 'custom', customReaction: learned[key] }
  }

  if (action.motion === 'custom') {
    const safe = sanitizeCustom(action.customReaction)
    if (safe) {
      if (key) {
        learned[key] = safe
        saveLearned(learned)
      }
      return { ...action, motion: 'custom', customReaction: safe }
    }
  }

  const requested = action.motion as MotionName | undefined
  return { ...action, motion: requested && allowedMotions.has(requested) ? requested : 'greet', customReaction: undefined }
}

function safeAction(action: NivaAction): NivaAction {
  const emotion = allowedEmotions.has(action.emotion as SemanticExpression) ? action.emotion : 'neutral'
  return resolveReaction({
    ...action,
    text: action.text || '我在。',
    emotion,
    expressionIntensity: clamp(action.expressionIntensity, .8, 0, 1),
  })
}

async function waitForNiva(): Promise<NivaRuntime | null> {
  for (let i = 0; i < 100; i++) {
    const niva = runtime()
    if (niva) return niva
    await sleep(50)
  }
  return null
}

function createBackstage(settings: DesktopSettings) {
  const shell = document.querySelector<HTMLElement>('.shell')!
  const panel = document.createElement('aside')
  panel.id = 'nivaBackstage'
  panel.className = 'niva-backstage'
  panel.innerHTML = `
    <div class="backstage-head">
      <div><b>NIVA 后台</b><span>双击人物进入 / Esc 返回</span></div>
      <button type="button" id="backstageClose">×</button>
    </div>
    <div class="backstage-grid">
      <label>
        <span>默认交互</span>
        <select id="interactionMode">
          <option value="voice">语音交互</option>
          <option value="text">文本交互</option>
        </select>
      </label>
      <label>
        <span>DeepSeek 模型</span>
        <select id="deepseekModel">
          <option value="deepseek-v4-flash">V4 Flash · 默认</option>
          <option value="deepseek-v4-pro">V4 Pro</option>
        </select>
      </label>
      <label class="backstage-wide">
        <span>DeepSeek API Key</span>
        <input id="deepseekKey" type="password" autocomplete="off" placeholder="${settings.hasApiKey ? '已保存；留空表示不修改' : '粘贴 API Key'}">
      </label>
      <label>
        <span>人物模型</span>
        <select id="activeModel">
          <option value="NIVA.vrm">NIVA · 主模型</option>
        </select>
      </label>
      <label class="toggle-row">
        <span>语音输出</span>
        <input id="voiceOutput" type="checkbox">
      </label>
    </div>
    <div class="backstage-actions">
      <button type="button" id="chooseLocalModel">临时载入本地 VRM</button>
      <button type="button" id="resetLearned">清空已学习动作</button>
      <button type="button" class="primary" id="saveBackstage">保存</button>
    </div>
    <div class="backstage-foot"><span id="backstageStatus">预设动作优先 · 已学习 ${learnedCount()} 个自定义反应</span></div>
  `
  shell.appendChild(panel)

  const interaction = panel.querySelector<HTMLSelectElement>('#interactionMode')!
  const model = panel.querySelector<HTMLSelectElement>('#deepseekModel')!
  const apiKey = panel.querySelector<HTMLInputElement>('#deepseekKey')!
  const activeModel = panel.querySelector<HTMLSelectElement>('#activeModel')!
  const voiceOutput = panel.querySelector<HTMLInputElement>('#voiceOutput')!
  const status = panel.querySelector<HTMLElement>('#backstageStatus')!

  interaction.value = settings.interactionMode
  model.value = settings.deepseekModel
  activeModel.value = settings.activeModel === 'NIVA.vrm' ? settings.activeModel : 'NIVA.vrm'
  voiceOutput.checked = settings.voiceOutput

  return { panel, interaction, model, apiKey, activeModel, voiceOutput, status }
}

async function bootDesktop() {
  if (!isTauri()) return
  await setupDesktopWindow()
  const niva = await waitForNiva()
  if (!niva) return

  installTextModeToggle()
  let settings = await getSettings().catch((): DesktopSettings => ({
    interactionMode: 'voice',
    deepseekModel: 'deepseek-v4-flash',
    activeModel: 'NIVA.vrm',
    voiceOutput: true,
    hasApiKey: false,
  }))

  const shell = document.querySelector<HTMLElement>('.shell')!
  const stage = document.querySelector<HTMLElement>('#stage')!
  const composer = document.querySelector<HTMLFormElement>('#composer')!
  const input = document.querySelector<HTMLInputElement>('#messageInput')!
  const userLine = document.querySelector<HTMLElement>('#userLine')!
  const statusText = document.querySelector<HTMLElement>('#statusText')!
  const modelFile = document.querySelector<HTMLInputElement>('#modelFile')!
  const backstage = createBackstage(settings)

  let currentMode: InteractionMode = settings.interactionMode
  let stopVoice: (() => void) | null = null
  let backstageOpen = false

  const setStatus = (text: string) => { statusText.textContent = text }

  const sendWithBrain = async (raw: string) => {
    const text = raw.trim()
    if (!text || backstageOpen) return
    input.value = ''
    userLine.hidden = false
    userLine.textContent = text
    shell.classList.remove('text-open')
    niva.act({ text: '让我想一下…', emotion: 'thinking', motion: 'thinking' })
    try {
      const reply = safeAction(await askDeepSeek(text))
      niva.act(reply)
      setStatus(reply.motion === 'custom' ? 'ALIVE · LEARNING' : 'ALIVE · AI')
      backstage.status.textContent = `预设动作优先 · 已学习 ${learnedCount()} 个自定义反应`
    } catch (error) {
      console.warn('[NIVA] DeepSeek unavailable, using local behavior', error)
      niva.send(text)
      setStatus(settings.hasApiKey ? 'ALIVE · LOCAL' : 'LOCAL · 双击配置 AI')
    }
  }

  const startVoice = () => {
    stopVoice?.()
    stopVoice = null
    if (currentMode !== 'voice' || backstageOpen) return
    stopVoice = startDefaultVoiceInput(
      (text) => void sendWithBrain(text),
      (status) => {
        if (status === 'voice') setStatus(settings.hasApiKey ? 'ALIVE · VOICE' : 'VOICE · LOCAL')
        else if (status === 'text') {
          currentMode = 'text'
          shell.classList.add('text-open')
          setStatus('ALIVE · TEXT')
        } else setStatus('ALIVE · LISTENING')
      },
    )
  }

  const applyMode = (mode: InteractionMode) => {
    currentMode = mode
    if (mode === 'text') {
      stopVoice?.()
      stopVoice = null
      shell.classList.add('text-open')
      setTimeout(() => input.focus(), 80)
      setStatus(settings.hasApiKey ? 'ALIVE · TEXT' : 'TEXT · LOCAL')
    } else {
      shell.classList.remove('text-open')
      startVoice()
    }
  }

  const openBackstage = () => {
    backstageOpen = true
    stopVoice?.()
    stopVoice = null
    backstage.panel.classList.add('open')
    shell.classList.add('backstage-open')
    setTimeout(() => backstage.interaction.focus(), 50)
  }

  const closeBackstage = () => {
    backstageOpen = false
    backstage.panel.classList.remove('open')
    shell.classList.remove('backstage-open')
    applyMode(currentMode)
  }

  composer.addEventListener('submit', (event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
    void sendWithBrain(input.value)
  }, true)

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    const button = target?.closest<HTMLButtonElement>('[data-text]')
    if (!button) return
    event.preventDefault()
    event.stopImmediatePropagation()
    void sendWithBrain(button.dataset.text ?? '')
  }, true)

  stage.addEventListener('dblclick', (event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
    openBackstage()
  }, true)

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && backstageOpen) {
      event.preventDefault()
      closeBackstage()
    }
  })

  backstage.panel.querySelector<HTMLButtonElement>('#backstageClose')!.onclick = closeBackstage
  backstage.panel.querySelector<HTMLButtonElement>('#chooseLocalModel')!.onclick = () => modelFile.click()
  backstage.panel.querySelector<HTMLButtonElement>('#resetLearned')!.onclick = () => {
    localStorage.removeItem(LEARNED_KEY)
    backstage.status.textContent = '已清空学习动作；下一次遇到新反应会重新学习。'
  }

  modelFile.addEventListener('change', async () => {
    const file = modelFile.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    backstage.status.textContent = `正在载入 ${file.name}…`
    const ok = await niva.loadModel(url)
    backstage.status.textContent = ok ? `已临时切换到 ${file.name}` : '模型载入失败，请使用 VRM 文件。'
    window.setTimeout(() => URL.revokeObjectURL(url), 5000)
  }, true)

  backstage.panel.querySelector<HTMLButtonElement>('#saveBackstage')!.onclick = async () => {
    backstage.status.textContent = '正在保存…'
    try {
      settings = await saveSettings({
        interactionMode: backstage.interaction.value as InteractionMode,
        deepseekModel: backstage.model.value as 'deepseek-v4-flash' | 'deepseek-v4-pro',
        activeModel: backstage.activeModel.value,
        voiceOutput: backstage.voiceOutput.checked,
        apiKey: backstage.apiKey.value.trim() || undefined,
      })
      backstage.apiKey.value = ''
      backstage.apiKey.placeholder = settings.hasApiKey ? '已保存；留空表示不修改' : '粘贴 API Key'
      niva.setVoiceOutput(settings.voiceOutput)
      currentMode = settings.interactionMode
      backstage.status.textContent = `已保存 · ${settings.deepseekModel} · 已学习 ${learnedCount()} 个动作`
      if (settings.activeModel === 'NIVA.vrm') await niva.loadModel(`${BASE}NIVA.vrm`)
      setTimeout(closeBackstage, 350)
    } catch (error) {
      console.error(error)
      backstage.status.textContent = '保存失败，请检查配置。'
    }
  }

  niva.setVoiceOutput(settings.voiceOutput)
  if (!settings.hasApiKey) setStatus('LOCAL · 双击配置 AI')
  applyMode(settings.interactionMode)
}

void bootDesktop()
