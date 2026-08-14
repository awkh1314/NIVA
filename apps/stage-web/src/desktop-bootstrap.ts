import './desktop.css'
import { askDeepSeek, installTextModeToggle, isTauri, setupDesktopWindow, startDefaultVoiceInput } from './desktop'
import type { NivaAction } from './core/types'

type NivaRuntime = {
  act(action: NivaAction): void
  send(text: string): void
  readonly ready: boolean
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const runtime = () => (window as unknown as { NIVA?: NivaRuntime }).NIVA

async function waitForNiva(): Promise<NivaRuntime | null> {
  for (let i = 0; i < 100; i++) {
    const niva = runtime()
    if (niva) return niva
    await sleep(50)
  }
  return null
}

function safeAction(action: NivaAction): NivaAction {
  const emotions = new Set(['neutral', 'happy', 'shy', 'sad', 'angry', 'surprised', 'thinking'])
  const motions = new Set(['wave', 'greet', 'thinking', 'happy', 'sad', 'lookAround', 'surprised', 'angry'])
  return {
    text: action.text || '我在。',
    emotion: emotions.has(String(action.emotion)) ? action.emotion : 'neutral',
    expressionIntensity: Math.max(0, Math.min(1, action.expressionIntensity ?? 0.8)),
    motion: motions.has(String(action.motion)) ? action.motion : 'greet',
  }
}

async function bootDesktop() {
  if (!isTauri()) return
  await setupDesktopWindow()
  const niva = await waitForNiva()
  if (!niva) return

  installTextModeToggle()
  const shell = document.querySelector<HTMLElement>('.shell')
  const composer = document.querySelector<HTMLFormElement>('#composer')
  const input = document.querySelector<HTMLInputElement>('#messageInput')
  const userLine = document.querySelector<HTMLElement>('#userLine')
  const statusText = document.querySelector<HTMLElement>('#statusText')

  const sendWithBrain = async (raw: string) => {
    const text = raw.trim()
    if (!text) return
    if (input) input.value = ''
    if (userLine) {
      userLine.hidden = false
      userLine.textContent = text
    }
    shell?.classList.remove('text-open')
    niva.act({ text: '让我想一下…', emotion: 'thinking', motion: 'thinking' })
    try {
      const reply = safeAction(await askDeepSeek(text))
      niva.act(reply)
      if (statusText) statusText.textContent = 'ALIVE · AI'
    } catch (error) {
      console.warn('[NIVA] DeepSeek unavailable, using local behavior', error)
      niva.send(text)
      if (statusText) statusText.textContent = 'ALIVE · LOCAL'
    }
  }

  composer?.addEventListener('submit', (event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
    void sendWithBrain(input?.value ?? '')
  }, true)

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    const button = target?.closest<HTMLButtonElement>('[data-text]')
    if (!button) return
    event.preventDefault()
    event.stopImmediatePropagation()
    void sendWithBrain(button.dataset.text ?? '')
  }, true)

  startDefaultVoiceInput(
    (text) => void sendWithBrain(text),
    (status) => {
      if (!statusText) return
      statusText.textContent = status === 'voice' ? 'ALIVE · VOICE' : status === 'text' ? 'ALIVE · TEXT' : 'ALIVE · LISTENING'
    },
  )
}

void bootDesktop()
