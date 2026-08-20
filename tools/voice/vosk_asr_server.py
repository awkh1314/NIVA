import io
import json
import os
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from vosk import KaldiRecognizer, Model as VoskModel

ROOT = os.path.dirname(os.path.abspath(__file__))
VOSK_MODEL = os.environ.get('NIVA_VOSK_MODEL', os.path.join(ROOT, 'vosk-model-small-cn-0.22'))

print(f'[NIVA ASR] loading Vosk {VOSK_MODEL}')
asr = VoskModel(VOSK_MODEL) if os.path.isdir(VOSK_MODEL) else None
if asr is None:
    print('[NIVA ASR] model missing; endpoint disabled')


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False).encode('utf-8')


def transcribe_wav(raw):
    if asr is None:
        raise RuntimeError('Vosk Chinese model is not installed')
    with wave.open(io.BytesIO(raw), 'rb') as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise RuntimeError('ASR expects mono PCM16 WAV')
        rec = KaldiRecognizer(asr, wav.getframerate())
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
        if self.path == '/asr-health':
            return self._send(200 if asr is not None else 503, json_bytes({'ok': asr is not None, 'engine': 'vosk'}))
        return self._send(404, b'{}')

    def do_POST(self):
        try:
            if self.path != '/v1/audio/transcriptions':
                return self._send(404, b'{}')
            size = int(self.headers.get('Content-Length', '0'))
            text = transcribe_wav(self.rfile.read(size))
            return self._send(200, json_bytes({'text': text}))
        except Exception as error:
            return self._send(500, json_bytes({'error': str(error)}))

    def log_message(self, fmt, *args):
        print('[NIVA ASR]', fmt % args)


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8080), Handler).serve_forever()
