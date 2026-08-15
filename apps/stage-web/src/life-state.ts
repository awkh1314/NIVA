export type NivaLifeState = 'idle' | 'attention' | 'listening' | 'thinking' | 'speaking' | 'backstage'

type LifeStateDetail = {
  state: NivaLifeState
  previous: NivaLifeState
  reason?: string
  changedAt: number
}

let currentState: NivaLifeState = 'idle'
let changedAt = performance.now()

function reflectState(state: NivaLifeState) {
  document.documentElement.dataset.nivaLifeState = state
  document.querySelector<HTMLElement>('.shell')?.setAttribute('data-life-state', state)
}

export function getLifeState(): NivaLifeState {
  return currentState
}

export function getLifeStateAge(): number {
  return Math.max(0, performance.now() - changedAt)
}

export function setLifeState(state: NivaLifeState, reason?: string): NivaLifeState {
  if (state === currentState) {
    reflectState(state)
    return state
  }

  const previous = currentState
  currentState = state
  changedAt = performance.now()
  reflectState(state)

  const detail: LifeStateDetail = { state, previous, reason, changedAt }
  window.dispatchEvent(new CustomEvent<LifeStateDetail>('niva:life-state', { detail }))
  return state
}

export function isLifeStateBusy(): boolean {
  return currentState === 'listening'
    || currentState === 'thinking'
    || currentState === 'speaking'
    || currentState === 'backstage'
}

reflectState(currentState)
