import io,json,os
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel
MODEL=os.environ.get('NIVA_QWEN_TTS_MODEL','Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice');DEVICE='cuda:0' if torch.cuda.is_available() else 'cpu';DTYPE=torch.bfloat16 if torch.cuda.is_available() else torch.float32
print(f'[NIVA Voice] loading {MODEL} on {DEVICE}');tts=Qwen3TTSModel.from_pretrained(MODEL,device_map=DEVICE,dtype=DTYPE)
class Handler(BaseHTTPRequestHandler):
 def _send(self,code,body,content_type='application/json'):
  self.send_response(code);self.send_header('Content-Type',content_type);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def do_GET(self): self._send(200,b'{"ok":true}') if self.path=='/health' else self._send(404,b'{}')
 def do_POST(self):
  if self.path!='/v1/audio/speech': return self._send(404,b'{}')
  try:
   size=int(self.headers.get('Content-Length','0'));data=json.loads(self.rfile.read(size) or b'{}');text=str(data.get('input','')).strip()
   if not text:return self._send(400,b'{"error":"input required"}')
   voice=str(data.get('voice') or 'Serena');instruction=str(data.get('instructions') or '').strip() or None
   wavs,sr=tts.generate_custom_voice(text=text,language='Chinese',speaker=voice,instruct=instruction);buf=io.BytesIO();sf.write(buf,wavs[0],sr,format='WAV');self._send(200,buf.getvalue(),'audio/wav')
  except Exception as e:self._send(500,json.dumps({'error':str(e)},ensure_ascii=False).encode('utf-8'))
 def log_message(self,fmt,*args): print('[NIVA Voice]',fmt%args)
if __name__=='__main__':ThreadingHTTPServer(('127.0.0.1',8080),Handler).serve_forever()
