import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow, currentMonitor, PhysicalPosition } from '@tauri-apps/api/window'
import type { DesktopSettings, InteractionMode, NivaAction } from './core/types'

type SpeechRecognitionCtor = new () => {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: any) => void) | null
  onend: (() => void) | null
  onerror: ((event: any) => void) | null
  start(): void
  stop(): void
}

type DesktopStatus = 'voice' | 'text' | 'offline'

export interface SettingsSaveInput {
  interactionMode: InteractionMode
  deepseekModel: 'deepseek-v4-flash' | 'deepseek-v4-pro'
  activeModel: string
  voiceOutput: boolean
  apiKey?: string
}

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export async function setupDesktopWindow(): Promise<void> {
  if (!isTauri()) return
  document.documentElement.classList.add('niva-desktop')
  try {
    const win = getCurrentWindow()
    await win.setAlwaysOnTop(true)
    const monitor = await currentMonitor()
    const size = await win.outerSize()
    if (monitor) {
      const area = monitor.workArea
      const margin = 20 * monitor.scaleFactor
      await win.setPosition(new PhysicalPosition(
        Math.round(area.position.x + area.size.width - size.width - margin),
        Math.round(area.position.y + area.size.height - size.height - margin),
      ))
    }
  } catch (error) {
    console.warn('[NIVA desktop] window setup failed', error)
  }
}

export async function askDeepSeek(message: string): Promise<NivaAction> {
  if (!isTauri()) throw new Error('DeepSeek desktop bridge is unavailable')
  return invoke<NivaAction>('deepseek_chat', { message })
}

export async function getSettings(): Promise<DesktopSettings> {
  if (!isTauri()) {
    return {
      interactionMode: 'text',
      deepseekModel: 'deepseek-v4-flash',
      activeModel: 'NIVA.vrm',
      voiceOutput: false,
      hasApiKey: false,
    }
  }
  return invoke<DesktopSettings>('get_settings')
}

export async function saveSettings(settings: SettingsSaveInput): Promise<DesktopSettings> {
  if (!isTauri()) throw new Error('Desktop settings are unavailable')
  return invoke<DesktopSettings>('save_settings', { settings })
}

export function installTextModeToggle(): void {
  if (!isTauri()) return
  const shell = document.querySelector<HTMLElement>('.shell')
  const topbar = document.querySelector<HTMLElement>('.topbar')
  const input = document.querySelector<HTMLInputElement>('#messageInput')
  if (!shell || !topbar || !input || document.querySelector('#textModeToggle')) return

  topbar.setAttribute('data-tauri-drag-region', '')

  const textButton = document.createElement('button')
  textButton.id = 'textModeToggle'
  textButton.className = 'desktop-control desktop-text-toggle'
  textButton.type = 'button'
  textButton.textContent = '⌨'
  textButton.title = '文字输入'
  textButton.addEventListener('click', (event) => {
    event.stopPropagation()
    shell.classList.toggle('text-open')
    if (shell.classList.contains('text-open')) setTimeout(() => input.focus(), 60)
  })
  topbar.appendChild(textButton)

  const closeButton = document.createElement('button')
  closeButton.id = 'desktopClose'
  closeButton.className = 'desktop-control desktop-close'
  closeButton.type = 'button'
  closeButton.textContent = '×'
  closeButton.title = '退出 NIVA'
  closeButton.addEventListener('click', async (event) => {
    event.stopPropagation()
    await getCurrentWindow().close()
  })
  topbar.appendChild(closeButton)

  input.addEventListener('focus', () => shell.classList.add('text-open'))
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      shell.classList.remove('text-open')
      input.blur()
    }
  })
}

function speechOutputActive(): boolean {
  return 'speechSynthesis' in window && (window.speechSynthesis.speaking || window.speechSynthesis.pending)
}

export function startDefaultVoiceInput(
  onText: (text: string) => void,
  onStatus?: (status: DesktopStatus) => void,
): () => void {
  const w = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (!Ctor) {
    onStatus?.('text')
    return () => undefined
  }

  const recognition = new Ctor()
  recognition.lang = 'zh-CN'
  recognition.continuous = false
  recognition.interimResults = false
  recognition.maxAlternatives = 1

  let stopped = false
  let listening = false
  let restartTimer = 0
  let guardTimer = 0
  let resumeAfter = 0
  let lastTranscript = ''
  let lastTranscriptAt = 0

  const scheduleRestart = (delay = 420) => {
    if (stopped) return
    clearTimeout(restartTimer)
    restartTimer = window.setTimeout(() => {
      if (stopped || listening) return
      const now = performance.now()
      if (speechOutputActive() || now < resumeAfter) {
        scheduleRestart(Math.max(220, Math.ceil(resumeAfter - now) + 80))
        return
      }
      try {
        recognition.start()
        listening = true
        onStatus?.('voice')
      } catch {
        listening = false
        scheduleRestart(500)
      }
    }, delay)
  }

  recognition.onresult = (event: any) => {
    listening = false
    if (speechOutputActive() || performance.now() < resumeAfter) return

    const result = event.results?.[event.results.length - 1]
    const text = result?.[0]?.transcript?.trim()
    if (!text) return

    const now = performance.now()
    if (text === lastTranscript && now - lastTranscriptAt < 1800) return
    lastTranscript = text
    lastTranscriptAt = now
    onText(text)
  }

  recognition.onerror = (event: any) => {
    listening = false
    const fatal = event?.error === 'not-allowed' || event?.error === 'service-not-allowed'
    onStatus?.(fatal ? 'text' : 'offline')
    if (!fatal) scheduleRestart(520)
  }

  recognition.onend = () => {
    listening = false
    scheduleRestart()
  }

  // WebView speech recognition can hear NIVA's own TTS. While NIVA is speaking,
  // actively stop recognition and wait briefly after playback before listening again.
  guardTimer = window.setInterval(() => {
    if (stopped) return
    if (speechOutputActive()) {
      resumeAfter = performance.now() + 650
      if (listening) {
        try { recognition.stop() } catch { /* noop */ }
        listening = false
      }
    }
  }, 120)

  scheduleRestart(80)
  return () => {
    stopped = true
    clearTimeout(restartTimer)
    clearInterval(guardTimer)
    recognition.onend = null
    recognition.onresult = null
    recognition.onerror = null
    try { recognition.stop() } catch { /* noop */ }
  }
}
