import { KokoroTTS } from '@uzen/kokoro-js';
import { voiceProsody } from './voice-prosody.mjs';

const REMOTE_MODEL_ID = 'onnx-community/Kokoro-82M-v1.1-zh-ONNX';
const DESKTOP_MODEL_ID = '/kokoro/model';
const VOICE = 'zf_001';
const REMOTE_VOICE_PATH = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.1-zh-ONNX/resolve/main/voices';
const DESKTOP_VOICE_PATH = '/kokoro/voices';

let enginePromise = null;
let audioContext = null;
let state = '待首次加载';
const isTauri = () => Boolean(globalThis.window?.__TAURI_INTERNALS__);

export function kokoroVoiceStatus() {
  const source = isTauri() ? '内置离线' : '网页按需加载';
  return `Kokoro INT8 · ${VOICE} · ${source} · ${state}`;
}

async function loadEngine(onStatus = () => {}) {
  if (!enginePromise) {
    state = isTauri() ? '加载内置模型' : '首次加载约127MB';
    onStatus(kokoroVoiceStatus());
    const modelId = isTauri() ? DESKTOP_MODEL_ID : REMOTE_MODEL_ID;
    enginePromise = KokoroTTS.from_pretrained(modelId, {
      dtype: 'q8',
      device: 'wasm',
      voicePath: isTauri() ? DESKTOP_VOICE_PATH : REMOTE_VOICE_PATH,
      ...(isTauri() ? { local_files_only: true } : {}),
    }).then((engine) => {
      state = '就绪';
      onStatus(kokoroVoiceStatus());
      return engine;
    }).catch((error) => {
      enginePromise = null;
      state = '异常';
      onStatus(kokoroVoiceStatus());
      throw error;
    });
  }
  return enginePromise;
}

function rmsAt(pcm, sampleRate, seconds) {
  const center = Math.max(0, Math.min(pcm.length - 1, Math.floor(seconds * sampleRate)));
  const radius = Math.max(64, Math.floor(sampleRate * 0.018));
  const start = Math.max(0, center - radius);
  const end = Math.min(pcm.length, center + radius);
  let energy = 0;
  let count = 0;
  for (let i = start; i < end; i += 8) {
    const v = Number(pcm[i] || 0);
    energy += v * v;
    count += 1;
  }
  const rms = Math.sqrt(energy / Math.max(1, count));
  return Math.max(0, Math.min(1, (rms - 0.008) * 12));
}

async function playRawAudio(raw, gainValue = 1, onMouth = () => {}) {
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

  const startedAt = audioContext.currentTime;
  let raf = 0;
  const trackMouth = () => {
    const elapsed = audioContext.currentTime - startedAt;
    onMouth(rmsAt(pcm, sampleRate, elapsed));
    raf = requestAnimationFrame(trackMouth);
  };

  await new Promise((resolve, reject) => {
    source.onended = () => {
      cancelAnimationFrame(raf);
      onMouth(0);
      resolve();
    };
    try {
      source.start();
      trackMouth();
    } catch (error) {
      cancelAnimationFrame(raf);
      onMouth(0);
      reject(error);
    }
  });
}

export async function speakWithKokoro(
  text,
  style = 'neutral',
  intensity = 0.5,
  onStatus = () => {},
  onMouth = () => {},
  onReady = () => {},
) {
  const clean = String(text || '').trim();
  if (!clean) return;
  const engine = await loadEngine(onStatus);
  const prosody = voiceProsody(style, intensity);
  const audio = await engine.generate(clean, { voice: VOICE, speed: prosody.speed });
  onReady();
  await playRawAudio(audio, prosody.gain, onMouth);
}

export const NIVA_KOKORO = Object.freeze({
  remoteModel: REMOTE_MODEL_ID,
  desktopModel: DESKTOP_MODEL_ID,
  dtype: 'q8',
  voice: VOICE,
});
