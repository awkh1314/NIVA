import { defaultWindowIcon } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { Menu } from '@tauri-apps/api/menu'
import { TrayIcon } from '@tauri-apps/api/tray'
import { getCurrentWindow, currentMonitor, PhysicalPosition } from '@tauri-apps/api/window'
import type { DesktopSettings, InteractionMode, LongTermMemorySnapshot, NivaAction } from './core/types'

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

type SavedWindowPosition = { x: number; y: number }

export type DesktopStatus = 'voice' | 'text' | 'offline'

export interface VoiceInputProvider {
  readonly id: string
  start(onText: (text: string) => void, onStatus?: (status: DesktopStatus) => void): () => void
}

export interface SettingsSaveInput {
  interactionMode: InteractionMode
  deepseekModel: 'deepseek-v4-flash' | 'deepseek-v4-pro'
  activeModel: string
  voiceOutput: boolean
  apiKey?: string
}

const DESKTOP_POSITION_KEY = 'niva.desktop.position.v1'
let trayIcon: TrayIcon | null = null
let voiceFallbackNoticeShown = false

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

function showDesktopNotice(text: string): void {
  const shell = document.querySelector<HTMLElement>('.shell')
  if (!shell) return
  document.querySelector('#nivaDesktopNotice')?.remove()
  const notice = document.createElement('div')
  notice.id = 'nivaDesktopNotice'
  notice.textContent = text
  Object.assign(notice.style, {
    position: 'absolute',
    left: '50%',
    bottom: '86px',
    transform: 'translateX(-50%)',
    maxWidth: '82%',
    padding: '9px 12px',
    borderRadius: '12px',
    background: 'rgba(15, 18, 30, .88)',
    color: 'rgba(255,255,255,.92)',
    fontSize: '12px',
    lineHeight: '1.45',
    textAlign: 'center',
    boxShadow: '0 8px 30px rgba(0,0,0,.22)',
    backdropFilter: 'blur(12px)',
    zIndex: '9999',
    pointerEvents: 'none',
  })
  shell.appendChild(notice)
  window.setTimeout(() => notice.remove(), 5200)
}

function notifyVoiceFallback(text: string): void {
  if (voiceFallbackNoticeShown) return
  voiceFallbackNoticeShown = true
  showDesktopNotice(text)
}

function loadSavedWindowPosition(): SavedWindowPosition | null {
  try {
    const raw = localStorage.getItem(DESKTOP_POSITION_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<SavedWindowPosition>
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return null
    return { x: Number(value.x), y: Number(value.y) }
  } catch {
    return null
  }
}

function saveWindowPosition(position: SavedWindowPosition): void {
  try {
    localStorage.setItem(DESKTOP_POSITION_KEY, JSON.stringify({
      x: Math.round(position.x),
      y: Math.round(position.y),
    }))
  } catch {
    // Position memory is optional; a storage failure should never block NIVA startup.
  }
}

async function showMainWindow(): Promise<void> {
  const win = getCurrentWindow()
  await win.show()
  await win.setFocus()
}

async function hideMainWindow(): Promise<void> {
  await getCurrentWindow().hide()
}

async function setupDesktopTray(): Promise<void> {
  if (!isTauri() || trayIcon) return
  try {
    const menu = await Menu.new({
      items: [
        {
          id: 'show-niva',
          text: '显示 NIVA',
          action: () => { void showMainWindow() },
        },
        {
          id: 'hide-niva',
          text: '隐藏 NIVA',
          action: () => { void hideMainWindow() },
        },
      ],
    })
    const icon = await defaultWindowIcon().catch(() => null)
    trayIcon = await TrayIcon.new({
      id: 'niva-main-tray',
      tooltip: 'NIVA · 数字生命',
      icon: icon ?? undefined,
      menu,
      showMenuOnLeftClick: false,
      action: (event) => {
        if (event.type === 'Click' && event.button === 'Left' && event.buttonState === 'Up') {
          void showMainWindow()
        }
      },
    })
  } catch (error) {
    console.warn('[NIVA desktop] tray setup failed', error)
  }
}

export async function setupDesktopWindow(): Promise<void> {
  if (!isTauri()) return
  document.documentElement.classList.add('niva-desktop')
  try {
    const win = getCurrentWindow()
    await win.setAlwaysOnTop(true)

    const initialMonitor = await currentMonitor()
    const size = await win.outerSize()
    const saved = loadSavedWindowPosition()

    if (saved) {
      await win.setPosition(new PhysicalPosition(Math.round(saved.x), Math.round(saved.y)))
      // If a monitor was unplugged and the saved point is no longer reachable,
      // fall back to the bottom-right of the monitor NIVA started on.
      const restoredMonitor = await currentMonitor()
      if (!restoredMonitor && initialMonitor) {
        const area = initialMonitor.workArea
        const margin = 20 * initialMonitor.scaleFactor
        await win.setPosition(new PhysicalPosition(
          Math.round(area.position.x + area.size.width - size.width - margin),
          Math.round(area.position.y + area.size.height - size.height - margin),
        ))
      }
    } else if (initialMonitor) {
      const area = initialMonitor.workArea
      const margin = 20 * initialMonitor.scaleFactor
      await win.setPosition(new PhysicalPosition(
        Math.round(area.position.x + area.size.width - size.width - margin),
        Math.round(area.position.y + area.size.height - size.height - margin),
      ))
    }

    await win.onMoved(({ payload }) => {
      saveWindowPosition({ x: payload.x, y: payload.y })
    })

    // Left-drag remains reserved for rotating the VRM body. Right-drag moves the
    // entire desktop companion window, so the two interactions never fight.
    const stage = document.querySelector<HTMLElement>('#stage')
    if (stage) {
      stage.addEventListener('contextmenu', (event) => event.preventDefault())
      stage.addEventListener('pointerdown', (event) => {
        if (event.button !== 2) return
        event.preventDefault()
        event.stopPropagation()
        void win.startDragging().catch((error) => {
          console.warn('[NIVA desktop] window drag failed', error)
        })
      }, { capture: true })
    }

    await setupDesktopTray()
  } catch (error) {
    console.warn('[NIVA desktop] window setup failed', error)
  }
}

export async function askDeepSeek(message: string): Promise<NivaAction> {
  if (!isTauri()) throw new Error('DeepSeek desktop bridge is unavailable')
  return invoke<NivaAction>('deepseek_chat', { message })
}

export async function clearConversation(): Promise<void> {
  if (!isTauri()) return
  await invoke('clear_conversation')
}

export async function getLongTermMemory(): Promise<LongTermMemorySnapshot> {
  if (!isTauri()) return { count: 0, capacity: 32, items: [] }
  return invoke<LongTermMemorySnapshot>('get_long_term_memory')
}

export async function clearLongTermMemory(): Promise<void> {
  if (!isTauri()) return
  await invoke('clear_long_term_memory')
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

const webSpeechProvider: VoiceInputProvider = {
  id: 'web-speech',
  start(onText, onStatus) {
    const w = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionCtor
      webkitSpeechRecognition?: SpeechRecognitionCtor
    }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) {
      onStatus?.('text')
      notifyVoiceFallback('这台电脑暂时无法使用语音识别，已经自动切换到文字输入。')
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
      if (fatal) {
        notifyVoiceFallback('麦克风权限不可用，已经自动切换到文字输入。你仍然可以正常使用 NIVA。')
      } else {
        scheduleRestart(520)
      }
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
  },
}

export function getDefaultVoiceInputProvider(): VoiceInputProvider {
  return webSpeechProvider
}

export function startDefaultVoiceInput(
  onText: (text: string) => void,
  onStatus?: (status: DesktopStatus) => void,
): () => void {
  return getDefaultVoiceInputProvider().start(onText, onStatus)
}
