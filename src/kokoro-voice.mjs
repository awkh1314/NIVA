import { KokoroTTS } from '@uzen/kokoro-js';
import { voiceProsody } from './voice-prosody.mjs';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.1-zh-ONNX';
const VOICE = 'zf_001';
const VOICE_PATH = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.1-zh-ONNX/resolve/main/voices';

let enginePromise = null;
let audioContext = null;
let state = '待首次加载';

export function kokoroVoiceStatus() {
  return `Kokoro INT8 · ${VOICE} · ${state}`;
}

async function loadEngine(onStatus = () => {}) {
  if (!enginePromise) {
    state = '首次加载约127MB';
    onStatus(kokoroVoiceStatus());
    enginePromise = KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: 'q8',
      device: 'wasm',
      voicePath: VOICE_PATH,
    }).then((engine) => {
      state = '就绪';
      onStatus(kokoroVoiceStatus());
      return engine;
    }).catch((error) => {
      enginePromise = null;
      state = '不可用';
      onStatus(kokoroVoiceStatus());
      throw error;
    });
  }
  return enginePromise;
}

async function playRawAudio(raw, gainValue = 1) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) throw new Error('Web Audio unavailable');
  if (!audioContext) audioContext = new AudioContextCtor();
  if (audioContext.state === 'suspended') await audioContext.resume();

  const pcm = raw?.data;
  const sampleRate = Number(raw?.sampling_rate || raw?.samplingRate || 24000);
  if (!pcm?.length) throw new Error('Kokoro returned empty audio');

  const buffer = audioContext.createBuffer(1, pcm.length, sampleRate);
  buffer.copyToChannel(pcm, 0);
  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  gain.gain.value = Math.max(0.5, Math.min(1.25, gainValue));
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(audioContext.destination);

  await new Promise((resolve, reject) => {
    source.onended = resolve;
    try { source.start(); } catch (error) { reject(error); }
  });
}

export async function speakWithKokoro(text, style = 'neutral', intensity = 0.5, onStatus = () => {}) {
  const clean = String(text || '').trim();
  if (!clean) return;
  const engine = await loadEngine(onStatus);
  const prosody = voiceProsody(style, intensity);
  const audio = await engine.generate(clean, {
    voice: VOICE,
    speed: prosody.speed,
  });
  await playRawAudio(audio, prosody.gain);
}

export const NIVA_KOKORO = Object.freeze({ model: MODEL_ID, dtype: 'q8', voice: VOICE });
