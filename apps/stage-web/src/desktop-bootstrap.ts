import './desktop.css'
import {
  askDeepSeek,
  clearConversation,
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
  readonly speaking: boolean
}

type ModelEntry = { id: string; name: string; local?: boolean }
type StoredModel = { id: string; name: string; blob: Blob; updatedAt: number }

const BASE = import.meta.env.BASE_URL
const LEARNED_KEY = 'niva.learned-reactions.v1'
const MODEL_DB = 'niva-models-v1'
const MODEL_STORE = 'models'
const LOCAL_PREFIX = 'local:'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const runtime = () => (window as unknown as { NIVA?: NivaRuntime }).NIVA

const presetReactions: Record<string, MotionName> = {
  greet: 'greet',
  hello: 'greet',
  wave: 'wave',
  dance: 'dance',
  dancing: 'dance',
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
const allowedMotions = new Set<MotionName>(['idle', 'dance', 'wave', 'greet', 'thinking', 'happy', 'sad', 'lookAround', 'surprised', 'angry', 'custom'])
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
  if (preset) return { ...action, motion: preset, customReaction: undefined }

  const learned = loadLearned()
  if (key && learned[key]) return { ...action, motion: 'custom', customReaction: learned[key] }

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

async function loadModelCatalog(): Promise<ModelEntry[]> {
  try {
    const response = await fetch(`${BASE}models.json`, { cache: 'no-store' })
    if (!response.ok) throw new Error(String(response.status))
    const list = await response.json() as ModelEntry[]
    const valid = list.filter((item) => item?.id?.toLowerCase().endsWith('.vrm'))
    return valid.length ? valid : [{ id: 'NIVA.vrm', name: 'NIVA · 主模型' }]
  } catch {
    return [{ id: 'NIVA.vrm', name: 'NIVA · 主模型' }]
  }
}

function openModelDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MODEL_DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(MODEL_STORE)) db.createObjectStore(MODEL_STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开本地模型库'))
  })
}

async function listStoredModels(): Promise<ModelEntry[]> {
  try {
    const db = await openModelDb()
    const rows = await new Promise<StoredModel[]>((resolve, reject) => {
      const tx = db.transaction(MODEL_STORE, 'readonly')
      const request = tx.objectStore(MODEL_STORE).getAll()
      request.onsuccess = () => resolve(request.result as StoredModel[])
      request.onerror = () => reject(request.error)
    })
    db.close()
    return rows
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((row) => ({ id: row.id, name: `${row.name} · 本地`, local: true }))
  } catch (error) {
    console.warn('[NIVA] local model catalog unavailable', error)
    return []
  }
}

async function saveStoredModel(file: File): Promise<ModelEntry> {
  const cleanName = file.name.replace(/\.vrm$/i, '') || 'Local VRM'
  const id = `${LOCAL_PREFIX}${file.name}`
  const row: StoredModel = { id, name: cleanName, blob: file, updatedAt: Date.now() }
  const db = await openModelDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MODEL_STORE, 'readwrite')
    tx.objectStore(MODEL_STORE).put(row)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
  db.close()
  return { id, name: `${cleanName} · 本地`, local: true }
}

async function readStoredModel(id: string): Promise<StoredModel | null> {
  if (!id.startsWith(LOCAL_PREFIX)) return null
  try {
    const db = await openModelDb()
    const row = await new Promise<StoredModel | undefined>((resolve, reject) => {
      const tx = db.transaction(MODEL_STORE, 'readonly')
      const request = tx.objectStore(MODEL_STORE).get(id)
      request.onsuccess = () => resolve(request.result as StoredModel | undefined)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return row ?? null
  } catch {
    return null
  }
}

async function allModels(): Promise<ModelEntry[]> {
  const [packaged, local] = await Promise.all([loadModelCatalog(), listStoredModels()])
  const seen = new Set<string>()
  return [...packaged, ...local].filter((entry) => {
    if (seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })
}

async function loadModelById(niva: NivaRuntime, id: string): Promise<boolean> {
  if (!id.startsWith(LOCAL_PREFIX)) return niva.loadModel(`${BASE}${id}`)
  const stored = await readStoredModel(id)
  if (!stored) return false
  const url = URL.createObjectURL(stored.blob)
  try {
    return await niva.loadModel(url)
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
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
        <select id="activeModel"><option value="NIVA.vrm">NIVA · 主模型</option></select>
      </label>
      <label class="toggle-row">
        <span>语音输出</span>
        <input id="voiceOutput" type="checkbox">
      </label>
    </div>
    <div class="backstage-actions">
      <button type="button" id="chooseLocalModel">导入本地 VRM</button>
      <button type="button" id="clearConversation">清除对话记忆</button>
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
  voiceOutput.checked = settings.voiceOutput

  return { panel, interaction, model, apiKey, activeModel, voiceOutput, status }
}

function fillModelSelect(select: HTMLSelectElement, models: ModelEntry[], active: string) {
  select.replaceChildren()
  for (const entry of models) {
    const option = document.createElement('option')
    option.value = entry.id
    option.textContent = entry.name
    select.appendChild(option)
  }
  select.value = models.some((entry) => entry.id === active) ? active : models[0]?.id ?? 'NIVA.vrm'
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
  let models = await allModels()
  fillModelSelect(backstage.activeModel, models, settings.activeModel)

  let currentMode: InteractionMode = settings.interactionMode
  let stopVoice: (() => void) | null = null
  let backstageOpen = false
  let brainBusy = false
  let activeInput = ''
  let interactionEpoch = 0
  const pendingInputs: string[] = []

  const setStatus = (text: string) => { statusText.textContent = text }
  const idleStatus = () => currentMode === 'voice'
    ? (settings.hasApiKey ? 'ALIVE · VOICE' : 'VOICE · LOCAL')
    : (settings.hasApiKey ? 'ALIVE · TEXT' : 'TEXT · LOCAL')

  const waitUntilSpeechEnds = async (epoch: number) => {
    const started = performance.now()
    while (niva.speaking && epoch === interactionEpoch && !backstageOpen && performance.now() - started < 18000) {
      await sleep(120)
    }
    if (epoch === interactionEpoch && !backstageOpen) await sleep(220)
  }

  const runBrainQueue = async () => {
    if (brainBusy || backstageOpen) return
    brainBusy = true
    try {
      while (pendingInputs.length && !backstageOpen) {
        const text = pendingInputs.shift()!
        activeInput = text
        const epoch = interactionEpoch

        input.value = ''
        userLine.hidden = false
        userLine.textContent = text
        shell.classList.remove('text-open')
        niva.act({ emotion: 'thinking', motion: 'thinking' })
        setStatus(pendingInputs.length ? `THINKING · +${pendingInputs.length}` : 'THINKING')

        try {
          const reply = safeAction(await askDeepSeek(text))
          if (epoch !== interactionEpoch) continue
          if (!backstageOpen) {
            niva.act(reply)
            setStatus(reply.motion === 'custom' ? 'ALIVE · LEARNING' : 'ALIVE · AI')
            backstage.status.textContent = `预设动作优先 · 已学习 ${learnedCount()} 个自定义反应`
            await waitUntilSpeechEnds(epoch)
          }
        } catch (error) {
          if (epoch !== interactionEpoch) continue
          console.warn('[NIVA] DeepSeek unavailable, using local behavior', error)
          if (!backstageOpen) {
            niva.send(text)
            setStatus(settings.hasApiKey ? 'ALIVE · LOCAL' : 'LOCAL · 双击配置 AI')
            await sleep(450)
            await waitUntilSpeechEnds(epoch)
          }
        } finally {
          activeInput = ''
        }
      }
    } finally {
      brainBusy = false
      if (!backstageOpen) setStatus(idleStatus())
      if (pendingInputs.length && !backstageOpen) void runBrainQueue()
    }
  }

  const enqueueBrain = (raw: string) => {
    const text = raw.trim()
    if (!text || backstageOpen) return
    if (text === activeInput || pendingInputs[pendingInputs.length - 1] === text) return
    pendingInputs.push(text)
    if (brainBusy) setStatus(`THINKING · +${pendingInputs.length}`)
    void runBrainQueue()
  }

  const startVoice = () => {
    stopVoice?.()
    stopVoice = null
    if (currentMode !== 'voice' || backstageOpen) return
    stopVoice = startDefaultVoiceInput(
      enqueueBrain,
      (status) => {
        if (brainBusy) return
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
      setStatus(idleStatus())
    } else {
      shell.classList.remove('text-open')
      startVoice()
    }
  }

  const openBackstage = () => {
    backstageOpen = true
    interactionEpoch += 1
    pendingInputs.length = 0
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
    enqueueBrain(input.value)
  }, true)

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    const button = target?.closest<HTMLButtonElement>('[data-text]')
    if (!button) return
    event.preventDefault()
    event.stopImmediatePropagation()
    enqueueBrain(button.dataset.text ?? '')
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
  backstage.panel.querySelector<HTMLButtonElement>('#clearConversation')!.onclick = async () => {
    interactionEpoch += 1
    pendingInputs.length = 0
    backstage.status.textContent = '正在清除对话记忆…'
    try {
      await clearConversation()
      userLine.hidden = true
      userLine.textContent = ''
      backstage.status.textContent = '对话记忆已清除。人物设置和已学习动作保持不变。'
    } catch (error) {
      console.error(error)
      backstage.status.textContent = '清除对话记忆失败。'
    }
  }
  backstage.panel.querySelector<HTMLButtonElement>('#resetLearned')!.onclick = () => {
    localStorage.removeItem(LEARNED_KEY)
    backstage.status.textContent = '已清空学习动作；下一次遇到新反应会重新学习。'
  }

  modelFile.addEventListener('change', async () => {
    const file = modelFile.files?.[0]
    if (!file) return
    backstage.status.textContent = `正在导入 ${file.name}…`
    try {
      const entry = await saveStoredModel(file)
      models = await allModels()
      fillModelSelect(backstage.activeModel, models, entry.id)
      const ok = await loadModelById(niva, entry.id)
      backstage.status.textContent = ok
        ? `已导入并切换到 ${entry.name}；点击保存后下次启动继续使用。`
        : '模型已保存，但载入失败，请确认是有效 VRM。'
    } catch (error) {
      console.error(error)
      backstage.status.textContent = '导入失败，请检查 VRM 文件。'
    } finally {
      modelFile.value = ''
    }
  }, true)

  backstage.activeModel.addEventListener('change', async () => {
    backstage.status.textContent = '正在切换人物模型…'
    const ok = await loadModelById(niva, backstage.activeModel.value)
    backstage.status.textContent = ok ? `已切换：${backstage.activeModel.selectedOptions[0]?.textContent ?? backstage.activeModel.value}` : '模型切换失败。'
  })

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
      await loadModelById(niva, settings.activeModel)
      setTimeout(closeBackstage, 350)
    } catch (error) {
      console.error(error)
      backstage.status.textContent = '保存失败，请检查配置。'
    }
  }

  niva.setVoiceOutput(settings.voiceOutput)
  if (settings.activeModel !== 'NIVA.vrm' && models.some((entry) => entry.id === settings.activeModel)) {
    await loadModelById(niva, settings.activeModel)
  }
  if (!settings.hasApiKey) setStatus('LOCAL · 双击配置 AI')
  applyMode(settings.interactionMode)
}

void bootDesktop()
