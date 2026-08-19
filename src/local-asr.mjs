import { invoke } from '@tauri-apps/api/core';

const micBtn = document.querySelector('#micBtn');
const inputBox = document.querySelector('#inputBox');
const sendBtn = document.querySelector('#sendBtn');
const queueInfo = document.querySelector('#queueInfo');
const isTauri = () => Boolean(window.__TAURI_INTERNALS__);

let localReady = false;
let recording = null;

function setInfo(text) {
  if (queueInfo) queueInfo.textContent = text;
}

function downsample(samples, sourceRate, targetRate = 16000) {
  if (sourceRate === targetRate) return samples;
  const ratio = sourceRate / targetRate;
  const length = Math.max(1, Math.round(samples.length / ratio));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += samples[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

function wavBase64(floatSamples, sampleRate) {
  const samples = downsample(floatSamples, sampleRate, 16000);
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (const value of samples) {
    const s = Math.max(-1, Math.min(1, value));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function stopLocalRecording() {
  const state = recording;
  if (!state) return;
  recording = null;
  clearTimeout(state.maxTimer);
  state.processor.disconnect();
  state.source.disconnect();
  state.stream.getTracks().forEach((track) => track.stop());
  await state.audioContext.close();
  micBtn?.classList.remove('listening');
  const length = state.chunks.reduce((n, a) => n + a.length, 0);
  if (length < state.sampleRate * 0.2) return setInfo('没有检测到足够的语音');
  const merged = new Float32Array(length);
  let cursor = 0;
  for (const chunk of state.chunks) { merged.set(chunk, cursor); cursor += chunk.length; }
  setInfo('Vosk 正在离线识别…');
  try {
    const text = String(await invoke('local_asr', { audioBase64: wavBase64(merged, state.sampleRate) }) || '').trim();
    if (!text) return setInfo('没有识别到有效内容，请再说一次');
    inputBox.value = text;
    setInfo(`已识别：${text}`);
    sendBtn.click();
  } catch (error) {
    setInfo(`本地语音识别失败：${String(error).slice(0, 80)}`);
  }
}

async function startLocalRecording() {
  if (recording) return stopLocalRecording();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }, video: false });
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    let heardVoice = false;
    let silentFrames = 0;
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input);
      chunks.push(copy);
      let energy = 0;
      for (let i = 0; i < input.length; i += 1) energy += input[i] * input[i];
      const rms = Math.sqrt(energy / Math.max(1, input.length));
      if (rms > 0.012) { heardVoice = true; silentFrames = 0; }
      else if (heardVoice) silentFrames += 1;
      const silentMs = silentFrames * input.length / audioContext.sampleRate * 1000;
      if (heardVoice && silentMs > 850) stopLocalRecording();
    };
    source.connect(processor);
    processor.connect(audioContext.destination);
    recording = { stream, audioContext, source, processor, chunks, sampleRate: audioContext.sampleRate, maxTimer: setTimeout(stopLocalRecording, 10000) };
    micBtn?.classList.add('listening');
    setInfo('正在听… 说完停顿约 1 秒会自动发送');
  } catch (error) {
    setInfo(`无法打开麦克风：${String(error).slice(0, 80)}`);
  }
}

async function probe() {
  if (!isTauri()) return;
  try {
    localReady = Boolean(await invoke('local_asr_probe'));
    if (localReady && micBtn) micBtn.title = '本地 Vosk 中文语音输入';
  } catch { localReady = false; }
}

micBtn?.addEventListener('click', (event) => {
  if (!localReady) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  startLocalRecording();
}, true);

probe();
window.NIVALocalASR = Object.freeze({ get ready() { return localReady; }, stop: stopLocalRecording });
