import './desktop-product.css'
import { isTauri } from './desktop'
import type { NivaAction } from './core/types'

type LifeState = 'idle' | 'attention' | 'listening' | 'thinking' | 'speaking' | 'backstage'

type NivaRuntime = {
  act(action: NivaAction): void
  setLifeState(state: LifeState): void
  readonly ready: boolean
  readonly speaking: boolean
  readonly lifeState: LifeState
}

const FIRST_RUN_KEY = 'niva.product.first-run.v1'
const FIRST_RUN_AT_KEY = 'niva.product.first-run-at.v1'
const FIRST_SESSION_COACH_KEY = 'niva.product.first-session-coach.v1'
const LAST_SEEN_KEY = 'niva.product.last-seen.v1'
const HEARTBEAT_MS = 60_000
const RETURN_GREETING_AFTER_MS = 8 * 60 * 60 * 1000
const LONG_ABSENCE_MS = 72 * 60 * 60 * 1000
const FIRST_SESSION_WINDOW_MS = 5 * 60 * 1000
const runtime = () => (window as unknown as { NIVA?: NivaRuntime }).NIVA
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

function productizeBackstage(): boolean {
  const panel = document.querySelector<HTMLElement>('#nivaBackstage')
  if (!panel || panel.dataset.productized === 'true') return !!panel
  panel.dataset.productized = 'true'
  panel.classList.add('niva-product-settings')

  const title = panel.querySelector<HTMLElement>('.backstage-head b')
  const subtitle = panel.querySelector<HTMLElement>('.backstage-head span')
  if (title) title.textContent = 'NIVA 设置'
  if (subtitle) subtitle.textContent = '日常互动、声音与记忆'

  const interaction = panel.querySelector<HTMLSelectElement>('#interactionMode')
  const voiceOutput = panel.querySelector<HTMLInputElement>('#voiceOutput')
  const interactionLabel = interaction?.closest('label')
  const voiceLabel = voiceOutput?.closest('label')
  interactionLabel?.querySelector('span')?.replaceChildren('和 NIVA 交流')
  voiceLabel?.querySelector('span')?.replaceChildren('让 NIVA 说话')

  const grid = panel.querySelector<HTMLElement>('.backstage-grid')
  if (grid) {
    const intro = document.createElement('section')
    intro.className = 'product-settings-intro'
    intro.innerHTML = `
      <strong>她会保留少量重要记忆</strong>
      <span>近期聊天和长期记忆分开保存，你可以随时单独清除。</span>
    `
    grid.before(intro)
  }

  const modelSelect = panel.querySelector<HTMLSelectElement>('#deepseekModel')
  const apiKey = panel.querySelector<HTMLInputElement>('#deepseekKey')
  const activeModel = panel.querySelector<HTMLSelectElement>('#activeModel')
  const modelLabel = modelSelect?.closest('label')
  const apiLabel = apiKey?.closest('label')
  const activeModelLabel = activeModel?.closest('label')

  modelLabel?.querySelector('span')?.replaceChildren('AI 模型')
  apiLabel?.querySelector('span')?.replaceChildren('DeepSeek API Key')
  activeModelLabel?.querySelector('span')?.replaceChildren('角色模型')

  const advanced = document.createElement('details')
  advanced.className = 'product-advanced'
  advanced.innerHTML = `
    <summary><span>开发者设置</span><small>测试版 / BYOK</small></summary>
    <div class="product-advanced-note">正式消费版会隐藏这些技术配置。当前测试版仍保留 API 与模型入口，方便继续研发。</div>
    <div class="product-advanced-grid"></div>
    <div class="product-advanced-actions"></div>
  `

  const advancedGrid = advanced.querySelector<HTMLElement>('.product-advanced-grid')!
  for (const label of [modelLabel, apiLabel, activeModelLabel]) {
    if (label) advancedGrid.appendChild(label)
  }

  const actions = panel.querySelector<HTMLElement>('.backstage-actions')
  const chooseModel = panel.querySelector<HTMLButtonElement>('#chooseLocalModel')
  const resetLearned = panel.querySelector<HTMLButtonElement>('#resetLearned')
  const advancedActions = advanced.querySelector<HTMLElement>('.product-advanced-actions')!
  if (chooseModel) {
    chooseModel.textContent = '导入测试 VRM'
    advancedActions.appendChild(chooseModel)
  }
  if (resetLearned) {
    resetLearned.textContent = '清空测试动作'
    advancedActions.appendChild(resetLearned)
  }

  if (grid) grid.after(advanced)
  else actions?.before(advanced)

  const clearRecent = panel.querySelector<HTMLButtonElement>('#clearConversation')
  const clearLongTerm = panel.querySelector<HTMLButtonElement>('#clearLongTermMemory')
  const save = panel.querySelector<HTMLButtonElement>('#saveBackstage')
  if (clearRecent) clearRecent.textContent = '忘掉最近聊天'
  if (clearLongTerm) clearLongTerm.textContent = '清除长期记忆'
  if (save) save.textContent = '完成'

  // During the BYOK development phase a brand-new install still needs an API key.
  // Open the technical section only in that case; returning users see the simple UI.
  if (apiKey && !apiKey.placeholder.includes('已保存')) advanced.open = true

  return true
}

function ensureBackstageProductLayer() {
  if (productizeBackstage()) return
  const observer = new MutationObserver(() => {
    if (!productizeBackstage()) return
    observer.disconnect()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  window.setTimeout(() => observer.disconnect(), 10000)
}

async function waitForRuntime(): Promise<NivaRuntime | null> {
  for (let i = 0; i < 120; i++) {
    const niva = runtime()
    if (niva?.ready) return niva
    await sleep(80)
  }
  return null
}

function firstRunCompleted(): boolean {
  try {
    return localStorage.getItem(FIRST_RUN_KEY) === 'done'
  } catch {
    return false
  }
}

function firstRunStartedAt(): number | null {
  try {
    const value = Number(localStorage.getItem(FIRST_RUN_AT_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

function markFirstRunCompleted() {
  try {
    localStorage.setItem(FIRST_RUN_KEY, 'done')
    if (!firstRunStartedAt()) localStorage.setItem(FIRST_RUN_AT_KEY, String(Date.now()))
  } catch {
    // Onboarding remains non-critical if WebView storage is unavailable.
  }
}

function firstSessionCoachCompleted(): boolean {
  try {
    return localStorage.getItem(FIRST_SESSION_COACH_KEY) === 'done'
  } catch {
    return true
  }
}

function markFirstSessionCoachCompleted() {
  try {
    localStorage.setItem(FIRST_SESSION_COACH_KEY, 'done')
  } catch {
    // Guidance is optional.
  }
}

function readLastSeen(): number | null {
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY)
    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

function writeLastSeen(at = Date.now()) {
  try {
    localStorage.setItem(LAST_SEEN_KEY, String(at))
  } catch {
    // Presence history is optional; the product still works without localStorage.
  }
}

function installPresenceHeartbeat() {
  writeLastSeen()
  const timer = window.setInterval(() => writeLastSeen(), HEARTBEAT_MS)
  window.addEventListener('pagehide', () => {
    writeLastSeen()
    clearInterval(timer)
  }, { once: true })
}

function showCoachToast(text: string, duration = 6200) {
  const shell = document.querySelector<HTMLElement>('.shell')
  if (!shell || shell.classList.contains('backstage-open')) return
  document.querySelector('#nivaCoachToast')?.remove()

  const toast = document.createElement('div')
  toast.id = 'nivaCoachToast'
  toast.className = 'niva-coach-toast'
  toast.textContent = text
  shell.appendChild(toast)
  requestAnimationFrame(() => toast.classList.add('visible'))
  window.setTimeout(() => {
    toast.classList.remove('visible')
    window.setTimeout(() => toast.remove(), 220)
  }, duration)
}

function installFirstFiveMinuteExperience(niva: NivaRuntime) {
  const startedAt = firstRunStartedAt()
  if (!startedAt || firstSessionCoachCompleted()) return

  const elapsed = Date.now() - startedAt
  if (elapsed < 0 || elapsed >= FIRST_SESSION_WINDOW_MS) {
    markFirstSessionCoachCompleted()
    return
  }

  const stage = document.querySelector<HTMLElement>('#stage')
  const shell = document.querySelector<HTMLElement>('.shell')
  if (!stage || !shell || shell.dataset.firstSessionCoach === 'true') return
  shell.dataset.firstSessionCoach = 'true'

  let userTouches = 0
  let backstageSeen = shell.classList.contains('backstage-open')
  const timers: number[] = []

  const noteTouch = () => { userTouches += 1 }
  stage.addEventListener('pointerdown', noteTouch, { passive: true })

  const shellObserver = new MutationObserver(() => {
    if (shell.classList.contains('backstage-open')) backstageSeen = true
  })
  shellObserver.observe(shell, { attributes: true, attributeFilter: ['class'] })

  const scheduleAt = (at: number, task: () => void) => {
    timers.push(window.setTimeout(task, Math.max(80, at - elapsed)))
  }

  scheduleAt(35_000, () => {
    if (document.querySelector('#nivaFirstRun')) return
    if (niva.lifeState !== 'idle') return
    if (userTouches >= 2) return
    showCoachToast('试试点一下我，或者直接叫“NIVA”。')
  })

  scheduleAt(145_000, () => {
    if (document.querySelector('#nivaFirstRun')) return
    if (niva.lifeState !== 'idle') return
    if (backstageSeen) return
    showCoachToast('双击我可以调整声音和记忆。')
  })

  scheduleAt(295_000, () => {
    markFirstSessionCoachCompleted()
    shellObserver.disconnect()
    stage.removeEventListener('pointerdown', noteTouch)
    for (const timer of timers) clearTimeout(timer)
  })
}

function createFirstRunCard(niva: NivaRuntime) {
  if (firstRunCompleted() || document.querySelector('#nivaFirstRun')) return
  const shell = document.querySelector<HTMLElement>('.shell')
  if (!shell) return

  const card = document.createElement('section')
  card.id = 'nivaFirstRun'
  card.className = 'niva-first-run'
  card.setAttribute('aria-label', '认识 NIVA')
  card.innerHTML = `
    <div class="niva-first-run-kicker">WELCOME TO NIVA</div>
    <strong>你好，我是 NIVA。</strong>
    <p>我会待在你的桌面。你可以直接和我说话，或者用文字告诉我你在想什么。</p>
    <div class="niva-first-run-hints">
      <span>直接说话</span>
      <span>右键拖动 · 移动</span>
      <span>双击 · 设置</span>
    </div>
    <button type="button" id="nivaFirstRunStart">开始</button>
  `
  shell.appendChild(card)

  window.setTimeout(() => {
    if (!card.isConnected || niva.speaking) return
    niva.setLifeState('attention')
    niva.act({ emotion: 'happy', expressionIntensity: .30, motion: 'wave' })
  }, 650)

  card.querySelector<HTMLButtonElement>('#nivaFirstRunStart')!.onclick = () => {
    markFirstRunCompleted()
    writeLastSeen()
    card.classList.add('closing')
    niva.setLifeState('attention')
    niva.act({
      text: '好。以后我会待在这里，想说话的时候直接叫我。',
      emotion: 'happy',
      expressionIntensity: .32,
      motion: 'greet',
    })
    window.setTimeout(() => {
      card.remove()
      installFirstFiveMinuteExperience(niva)
    }, 220)
  }
}

function returnGreeting(lastSeen: number | null): NivaAction | null {
  if (!lastSeen) return null
  const now = Date.now()
  const gap = Math.max(0, now - lastSeen)
  if (gap < RETURN_GREETING_AFTER_MS) return null

  if (gap >= LONG_ABSENCE_MS) {
    return {
      text: '好久不见。你回来啦。',
      emotion: 'happy',
      expressionIntensity: .28,
      motion: 'wave',
    }
  }

  const hour = new Date().getHours()
  if (hour >= 5 && hour < 11) {
    return { text: '早。你回来啦。', emotion: 'happy', expressionIntensity: .24, motion: 'greet' }
  }
  if (hour >= 11 && hour < 18) {
    return { text: '下午好。又见面了。', emotion: 'happy', expressionIntensity: .22, motion: 'greet' }
  }
  if (hour >= 18 || hour < 1) {
    return { text: '晚上好。你回来啦。', emotion: 'happy', expressionIntensity: .24, motion: 'greet' }
  }
  return { text: '这么晚还在呀。', emotion: 'shy', expressionIntensity: .18, motion: 'greet' }
}

function lifeStateFromStatus(text: string): LifeState {
  const value = text.toUpperCase()
  if (value.includes('THINKING')) return 'thinking'
  if (value.includes('LISTENING')) return 'listening'
  return 'idle'
}

function installLifeStateBridge(niva: NivaRuntime) {
  const shell = document.querySelector<HTMLElement>('.shell')
  const status = document.querySelector<HTMLElement>('#statusText')
  if (!shell || !status || status.dataset.lifeBridge === 'true') return
  status.dataset.lifeBridge = 'true'

  let lastApplied: LifeState | null = null
  const apply = () => {
    let next: LifeState
    if (shell.classList.contains('backstage-open')) next = 'backstage'
    else if (niva.speaking) next = 'speaking'
    else next = lifeStateFromStatus(status.textContent ?? '')

    if (next === lastApplied) return
    lastApplied = next
    niva.setLifeState(next)
  }

  const statusObserver = new MutationObserver(apply)
  statusObserver.observe(status, { childList: true, characterData: true, subtree: true })

  const shellObserver = new MutationObserver(apply)
  shellObserver.observe(shell, { attributes: true, attributeFilter: ['class'] })

  // Speech synthesis finishing does not necessarily mutate status text, so a small
  // poll keeps the effective state correct without coupling the product layer to TTS.
  const timer = window.setInterval(apply, 180)
  window.addEventListener('pagehide', () => {
    clearInterval(timer)
    statusObserver.disconnect()
    shellObserver.disconnect()
  }, { once: true })

  apply()
}

function installNaturalAttention(niva: NivaRuntime) {
  const stage = document.querySelector<HTMLElement>('#stage')
  const shell = document.querySelector<HTMLElement>('.shell')
  if (!stage || !shell || stage.dataset.productAttention === 'true') return
  stage.dataset.productAttention = 'true'

  let lastUserTouch = performance.now()
  let lastAcknowledgement = performance.now()
  let attentionTimer = 0

  const noteTouch = () => { lastUserTouch = performance.now() }
  stage.addEventListener('pointerdown', noteTouch, { passive: true })
  stage.addEventListener('dblclick', noteTouch, { passive: true })

  stage.addEventListener('pointerenter', () => {
    clearTimeout(attentionTimer)
    attentionTimer = window.setTimeout(() => {
      const now = performance.now()
      if (!stage.matches(':hover')) return
      if (shell.classList.contains('backstage-open')) return
      if (document.querySelector('#nivaFirstRun')) return
      if (niva.speaking) return
      if (niva.lifeState !== 'idle' && niva.lifeState !== 'attention') return
      if (now - lastUserTouch < 12000) return
      if (now - lastAcknowledgement < 45000) return

      // No speech here. Presence should feel aware, not needy.
      lastAcknowledgement = now
      lastUserTouch = now
      niva.setLifeState('attention')
      niva.act({ emotion: 'happy', expressionIntensity: .16, motion: 'greet' })
      window.setTimeout(() => {
        if (!niva.speaking && niva.lifeState === 'attention') niva.setLifeState('idle')
      }, 1900)
    }, 260)
  })

  stage.addEventListener('pointerleave', () => clearTimeout(attentionTimer), { passive: true })
}

function installTouchFeedback(niva: NivaRuntime) {
  const stage = document.querySelector<HTMLElement>('#stage')
  const shell = document.querySelector<HTMLElement>('.shell')
  if (!stage || !shell || stage.dataset.productTouch === 'true') return
  stage.dataset.productTouch = 'true'

  let pointerId = -1
  let startX = 0
  let startY = 0
  let startAt = 0
  let moved = false
  let touchIndex = 0
  let lastSpokenTouch = -Infinity
  let touchTimer = 0

  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    pointerId = event.pointerId
    startX = event.clientX
    startY = event.clientY
    startAt = performance.now()
    moved = false
  }, { capture: true })

  stage.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    if (dx * dx + dy * dy > 64) moved = true
  }, { capture: true })

  stage.addEventListener('pointerup', (event) => {
    if (event.pointerId !== pointerId) return
    const wasTap = !moved && performance.now() - startAt < 520
    pointerId = -1
    if (!wasTap) return

    // The renderer's generic click reply was useful during prototyping but becomes
    // repetitive in a product. Own desktop taps here while a synthetic cancel releases
    // the rotation controller's internal drag state.
    event.preventDefault()
    event.stopImmediatePropagation()
    try {
      stage.dispatchEvent(new PointerEvent('pointercancel', {
        bubbles: true,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
      }))
    } catch {
      // Pointer capture is also released automatically by the browser after pointerup.
    }

    clearTimeout(touchTimer)
    touchTimer = window.setTimeout(() => {
      if (shell.classList.contains('backstage-open')) return
      if (document.querySelector('#nivaFirstRun')) return
      if (niva.lifeState === 'thinking' || niva.lifeState === 'speaking' || niva.lifeState === 'backstage') return

      const now = performance.now()
      const canSpeak = now - lastSpokenTouch >= 28_000
      const variant = touchIndex++ % 4
      const action: NivaAction = variant === 0
        ? { emotion: 'happy', expressionIntensity: .18, motion: 'greet' }
        : variant === 1
          ? { emotion: 'shy', expressionIntensity: .18, motion: 'greet', lookTarget: { x: -.08, y: .04 } }
          : variant === 2
            ? { emotion: 'surprised', expressionIntensity: .16, motion: 'surprised' }
            : { emotion: 'happy', expressionIntensity: .20, motion: 'wave' }

      if (canSpeak) {
        const lines = ['嗯？', '我在。', '怎么啦？']
        action.text = lines[Math.floor(touchIndex / 4) % lines.length]
        lastSpokenTouch = now
      }

      niva.setLifeState('attention')
      niva.act(action)
      window.setTimeout(() => {
        if (!niva.speaking && niva.lifeState === 'attention') niva.setLifeState('idle')
      }, 1900)
    }, 245)
  }, { capture: true })

  stage.addEventListener('pointercancel', (event) => {
    if (event.pointerId === pointerId) pointerId = -1
  }, { capture: true })

  stage.addEventListener('dblclick', () => clearTimeout(touchTimer), { capture: true })
}

async function bootPresenceLayer() {
  const previousLastSeen = readLastSeen()
  const niva = await waitForRuntime()
  if (!niva) return

  installLifeStateBridge(niva)
  installNaturalAttention(niva)
  installTouchFeedback(niva)
  installPresenceHeartbeat()

  if (!firstRunCompleted()) {
    await sleep(900)
    createFirstRunCard(niva)
    return
  }

  installFirstFiveMinuteExperience(niva)

  const greeting = returnGreeting(previousLastSeen)
  if (!greeting) return

  await sleep(1200)
  const shell = document.querySelector<HTMLElement>('.shell')
  if (shell?.classList.contains('backstage-open') || niva.speaking) return
  niva.setLifeState('attention')
  niva.act(greeting)
}

function bootProductLayer() {
  if (!isTauri()) return
  ensureBackstageProductLayer()
  void bootPresenceLayer()
}

bootProductLayer()
