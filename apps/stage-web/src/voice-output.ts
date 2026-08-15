export interface VoiceOutputOptions {
  lang?: string
  rate?: number
  pitch?: number
}

export interface VoiceOutputProvider {
  readonly id: string
  speak(text: string, options?: VoiceOutputOptions): Promise<void>
  stop(): void
  isSpeaking(): boolean
}

function voiceScore(voice: SpeechSynthesisVoice, lang: string): number {
  const name = voice.name.toLowerCase()
  const locale = voice.lang.toLowerCase()
  const wanted = lang.toLowerCase()
  let score = 0

  // Prefer Mandarin voices first.
  if (locale === wanted) score += 80
  else if (locale.startsWith('zh-cn')) score += 72
  else if (locale.startsWith('zh')) score += 45

  // Windows 11 / Edge may expose Microsoft's natural Chinese voices under names
  // such as Xiaoxiao or Xiaoyi. Prefer the natural/online variants when present.
  if (name.includes('xiaoxiao')) score += 90
  if (name.includes('xiaoyi')) score += 86
  if (name.includes('xiaoyou')) score += 76
  if (name.includes('xiaomeng')) score += 72
  if (name.includes('xiaorui')) score += 64
  if (name.includes('xiaozhen')) score += 58

  if (name.includes('natural')) score += 60
  if (name.includes('neural')) score += 55
  if (name.includes('online')) score += 25
  if (name.includes('microsoft')) score += 18

  // Older Windows Chinese voices are still a better fallback than an unrelated locale.
  if (name.includes('huihui') || name.includes('yaoyao')) score += 30

  return score
}

async function getPreferredVoice(lang: string): Promise<SpeechSynthesisVoice | null> {
  if (!('speechSynthesis' in window)) return null

  const synth = window.speechSynthesis
  let voices = synth.getVoices()
  if (!voices.length) {
    voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        synth.removeEventListener('voiceschanged', onVoicesChanged)
        resolve(synth.getVoices())
      }
      const onVoicesChanged = () => finish()
      synth.addEventListener('voiceschanged', onVoicesChanged)
      window.setTimeout(finish, 500)
    })
  }

  if (!voices.length) return null
  return [...voices]
    .map((voice) => ({ voice, score: voiceScore(voice, lang) }))
    .sort((a, b) => b.score - a.score)[0]?.voice ?? null
}

class BrowserSpeechOutputProvider implements VoiceOutputProvider {
  readonly id = 'browser-speech-synthesis-sweet-cn'
  private active = false
  private finishActive: (() => void) | null = null

  async speak(text: string, options: VoiceOutputOptions = {}): Promise<void> {
    const value = text.trim()
    if (!value || !('speechSynthesis' in window)) return

    this.stop()
    const lang = options.lang ?? 'zh-CN'
    const preferredVoice = await getPreferredVoice(lang)

    return new Promise((resolve) => {
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        this.active = false
        this.finishActive = null
        resolve()
      }

      const utterance = new SpeechSynthesisUtterance(value)
      utterance.lang = lang
      if (preferredVoice) utterance.voice = preferredVoice

      // Slightly slower and only mildly raised in pitch gives a softer, sweeter sound
      // without the synthetic/cartoon effect of the previous high-pitch preset.
      utterance.rate = options.rate ?? 0.96
      utterance.pitch = options.pitch ?? 1.04
      utterance.volume = 1
      utterance.onend = finish
      utterance.onerror = finish

      this.active = true
      this.finishActive = finish
      window.speechSynthesis.speak(utterance)
    })
  }

  stop(): void {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    this.finishActive?.()
    this.finishActive = null
    this.active = false
  }

  isSpeaking(): boolean {
    return this.active || ('speechSynthesis' in window && (window.speechSynthesis.speaking || window.speechSynthesis.pending))
  }
}

let provider: VoiceOutputProvider = new BrowserSpeechOutputProvider()

export function getVoiceOutputProvider(): VoiceOutputProvider {
  return provider
}

export function setVoiceOutputProvider(next: VoiceOutputProvider): void {
  provider.stop()
  provider = next
}

export function speakVoice(text: string, options?: VoiceOutputOptions): Promise<void> {
  return provider.speak(text, options)
}

export function stopVoice(): void {
  provider.stop()
}

export function isVoiceSpeaking(): boolean {
  return provider.isSpeaking()
}
