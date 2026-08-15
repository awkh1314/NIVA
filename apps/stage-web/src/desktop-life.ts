import { isTauri } from './desktop'
import { getLifeState, setLifeState, type NivaLifeState } from './life-state'

type Runtime = {
  readonly speaking: boolean
}

const runtime = () => (window as unknown as { NIVA?: Runtime }).NIVA

function deriveState(): NivaLifeState {
  const shell = document.querySelector<HTMLElement>('.shell')
  const status = document.querySelector<HTMLElement>('#statusText')?.textContent?.toUpperCase() ?? ''

  if (shell?.classList.contains('backstage-open')) return 'backstage'
  if (runtime()?.speaking) return 'speaking'
  if (status.includes('THINKING')) return 'thinking'
  if (status.includes('LISTENING')) return 'listening'
  return 'idle'
}

function syncLifeState(reason: string) {
  const next = deriveState()
  if (next !== getLifeState()) setLifeState(next, reason)
}

function bootDesktopLife() {
  if (!isTauri()) return

  const status = document.querySelector<HTMLElement>('#statusText')
  const shell = document.querySelector<HTMLElement>('.shell')
  const observer = new MutationObserver(() => syncLifeState('desktop-ui'))

  if (status) observer.observe(status, { childList: true, characterData: true, subtree: true })
  if (shell) observer.observe(shell, { attributes: true, attributeFilter: ['class'] })

  // Speech synthesis changes independently of DOM text, so keep one lightweight
  // heartbeat to make SPEAKING -> IDLE transitions deterministic.
  const timer = window.setInterval(() => syncLifeState('speech-heartbeat'), 160)
  window.addEventListener('beforeunload', () => window.clearInterval(timer), { once: true })
  syncLifeState('boot')
}

bootDesktopLife()
