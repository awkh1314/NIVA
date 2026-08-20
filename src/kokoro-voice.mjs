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
let activeDevice = '未选择';
const isTauri = () => Boolean(globalThis.window?.__TAURI_INTERNALS__);
const hasWebGPU = () => !isTauri() && Boolean(globalThis.navigator?.gpu);

export function kokoroVoiceStatus() {
  const source = isTauri() ? '内置离线' : '网页按需加载';
  return `Kokoro INT8 · ${VOICE} · ${source} · ${activeDevice} · ${state}`;
}

function getAudioContext() {
  const AudioContextCtor = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!audioContext) audioContext = new AudioContextCtor();
  return audioContext;
}

export async function unlockKokoroAudio(onStatus = () => {}) {
  const context = getAudioContext();
  if (!context) {
    state = '浏览器无 Web Audio';
    onStatus(kokoroVoiceStatus());
    return false;
  }
  try {
    if (context.state === 'suspended') await context.resume();
    onStatus(kokoroVoiceStatus());
    return context.state === 'running';
  } catch (error) {
    console.warn('Kokoro AudioContext unlock failed', error);
    return false;
  }
}

async function createEngine(onStatus = () => {}) {
  const modelId = isTauri() ? DESKTOP_MODEL_ID : REMOTE_MODEL_ID;
  const voicePath = isTauri() ? DESKTOP_VOICE_PATH : REMOTE_VOICE_PATH;
  const optionsFor = (device) => ({
    dtype: 'q8',
    device,
    voicePath,
    ...(isTauri() ? { local_files_only: true } : {}),
  });

  const preferred = isTauri() ? 'wasm' : (hasWebGPU() ? 'webgpu' : 'wasm');
  activeDevice = preferred.toUpperCase();
  state = isTauri() ? '加载内置模型' : `后台预热 ${activeDevice}`;
  onStatus(kokoroVoiceStatus());

  try {
    return await KokoroTTS.from_pretrained(modelId, optionsFor(preferred));
  } catch (error) {
    if (preferred !== 'webgpu') throw error;
    console.warn('Kokoro WebGPU init failed; retrying WASM', error);
    activeDevice = 'WASM';
    state = 'WebGPU 不可用，切换 WASM';
    onStatus(kokoroVoiceStatus());
    return KokoroTTS.from_pretrained(modelId, optionsFor('wasm'));
  }
}

async function loadEngine(onStatus = () => {}) {
  if (!enginePromise) {
    enginePromise = createEngine(onStatus).then((engine) => {
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

export function preloadKokoro(onStatus = () => {}) {
  return loadEngine(onStatus).catch((error) => {
    console.warn('Kokoro preload failed', error);
    return null;
  });
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

async function playRawAudio(raw, gainValue = 1, onMouth = () => {}, onPlaybackStart = () => {}) {
  const context = getAudioContext();
  if (!context) throw new Error('Web Audio unavailable');
  if (context.state === 'suspended') await context.resume();
  if (context.state !== 'running') throw new Error(`AudioContext not running: ${context.state}`);

  const pcm = raw?.data;
  const sampleRate = Number(raw?.sampling_rate || raw?.samplingRate || 24000);
  if (!pcm?.length) throw new Error('Kokoro returned empty audio');

  const buffer = context.createBuffer(1, pcm.length, sampleRate);
  buffer.copyToChannel(pcm, 0);
  const source = context.createBufferSource();
  const gain = context.createGain();
  gain.gain.value = Math.max(0.5, Math.min(1.25, gainValue));
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(context.destination);

  let startedAt = 0;
  let raf = 0;
  const trackMouth = () => {
    const elapsed = Math.max(0, context.currentTime - startedAt);
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
      startedAt = context.currentTime;
      onPlaybackStart();
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
  onPlaybackStart = () => {},
) {
  const clean = String(text || '').trim();
  if (!clean) return;
  const engine = await loadEngine(onStatus);
  const prosody = voiceProsody(style, intensity);
  const audio = await engine.generate(clean, { voice: VOICE, speed: prosody.speed });
  await playRawAudio(audio, prosody.gain, onMouth, onPlaybackStart);
}

export const NIVA_KOKORO = Object.freeze({
  remoteModel: REMOTE_MODEL_ID,
  desktopModel: DESKTOP_MODEL_ID,
  dtype: 'q8',
  voice: VOICE,
});
