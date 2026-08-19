import io
import json
import os
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel
from vosk import KaldiRecognizer, Model as VoskModel

ROOT = os.path.dirname(os.path.abspath(__file__))
QWEN_MODEL = os.environ.get('NIVA_QWEN_TTS_MODEL', 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice')
VOSK_MODEL = os.environ.get('NIVA_VOSK_MODEL', os.path.join(ROOT, 'vosk-model-small-cn-0.22'))
DEVICE = 'cuda:0' if torch.cuda.is_available() else 'cpu'
DTYPE = torch.bfloat16 if torch.cuda.is_available() else torch.float32

print(f'[NIVA Voice] loading Qwen3-TTS {QWEN_MODEL} on {DEVICE}')
tts = Qwen3TTSModel.from_pretrained(QWEN_MODEL, device_map=DEVICE, dtype=DTYPE)
print(f'[NIVA Voice] loading Vosk ASR {VOSK_MODEL}')
asr = VoskModel(VOSK_MODEL) if os.path.isdir(VOSK_MODEL) else None
if asr is None:
    print('[NIVA Voice] Vosk model missing; ASR endpoint disabled')


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False).encode('utf-8')


def transcribe_wav(raw):
    if asr is None:
        raise RuntimeError('Vosk Chinese model is not installed')
    with wave.open(io.BytesIO(raw), 'rb') as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise RuntimeError('ASR expects mono PCM16 WAV')
        rate = wav.getframerate()
        rec = KaldiRecognizer(asr, rate)
        rec.SetWords(False)
        while True:
            data = wav.readframes(4000)
            if not data:
                break
            rec.AcceptWaveform(data)
        return str(json.loads(rec.FinalResult() or '{}').get('text', '')).strip()


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, content_type='application/json; charset=utf-8'):
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/health':
            return self._send(200, json_bytes({'ok': True, 'tts': True, 'asr': asr is not None}))
        if self.path == '/asr-health':
            return self._send(200 if asr is not None else 503, json_bytes({'ok': asr is not None}))
        return self._send(404, b'{}')

    def do_POST(self):
        try:
            size = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(size)
            if self.path == '/v1/audio/transcriptions':
                text = transcribe_wav(raw)
                return self._send(200, json_bytes({'text': text}))
            if self.path != '/v1/audio/speech':
                return self._send(404, b'{}')
            data = json.loads(raw or b'{}')
            text = str(data.get('input', '')).strip()
            if not text:
                return self._send(400, json_bytes({'error': 'input required'}))
            voice = str(data.get('voice') or 'Serena')
            instruction = str(data.get('instructions') or '').strip() or None
            wavs, sr = tts.generate_custom_voice(text=text, language='Chinese', speaker=voice, instruct=instruction)
            buf = io.BytesIO()
            sf.write(buf, wavs[0], sr, format='WAV')
            return self._send(200, buf.getvalue(), 'audio/wav')
        except Exception as e:
            return self._send(500, json_bytes({'error': str(e)}))

    def log_message(self, fmt, *args):
        print('[NIVA Voice]', fmt % args)


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8080), Handler).serve_forever()
