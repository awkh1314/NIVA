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

class BrowserSpeechOutputProvider implements VoiceOutputProvider {
  readonly id = 'browser-speech-synthesis'
  private active = false
  private finishActive: (() => void) | null = null

  speak(text: string, options: VoiceOutputOptions = {}): Promise<void> {
    const value = text.trim()
    if (!value || !('speechSynthesis' in window)) return Promise.resolve()

    this.stop()
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
      utterance.lang = options.lang ?? 'zh-CN'
      utterance.rate = options.rate ?? 1.03
      utterance.pitch = options.pitch ?? 1.10
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
