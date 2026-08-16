const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);
const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-v4-flash';
const EMOTIONS = new Set(['neutral', 'smile', 'shy', 'thinking', 'sad', 'angry', 'surprise']);
const MOTIONS = new Set(['idle', 'wave', 'nod', 'shake', 'tilt', 'jump', 'look']);

const SYSTEM_PROMPT = `你是 NIVA，一个有形象、有情绪的 2D/2.5D 数字生命助手。\n你的任务是自然、简洁地回复用户，并为这次回复选择一个表情和一个动作。\n必须只输出 JSON，不要输出 Markdown、代码块、解释或额外文字。\nJSON 结构必须严格为：\n{\n  "text": "NIVA 对用户说的话",\n  "emotion": "neutral|smile|shy|thinking|sad|angry|surprise",\n  "motion": "idle|wave|nod|shake|tilt|jump|look"\n}\n要求：\n- text 使用自然中文，除非用户使用其他语言。\n- emotion 和 motion 只能从给定枚举中选择。\n- 普通回答优先 neutral/idle，不要每句话都做夸张动作。\n- 不要声称拥有不存在的现实世界感知、长期记忆或工具能力。`;

function loadDotEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function sendFile(res, filePath, contentType) {
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      sendJson(res, 404, { ok: false, error: 'Not found' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function readJsonBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('REQUEST_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sanitizeConversation(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
    .map(item => ({ role: item.role, content: item.content.trim().slice(0, 4000) }))
    .filter(item => item.content)
    .slice(-20);
}

function stripCodeFence(text) {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function normalizeReply(rawContent) {
  const raw = typeof rawContent === 'string' ? rawContent.trim() : '';
  let parsed = null;
  const candidates = [raw, stripCodeFence(raw)];
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(raw.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch {
      // Try the next recovery candidate.
    }
  }

  const text = parsed && typeof parsed.text === 'string' && parsed.text.trim()
    ? parsed.text.trim()
    : raw || '我刚刚没有组织好语言，可以再说一次吗？';
  const emotion = parsed && EMOTIONS.has(parsed.emotion) ? parsed.emotion : 'neutral';
  const motion = parsed && MOTIONS.has(parsed.motion) ? parsed.motion : 'idle';

  return { text, emotion, motion };
}

function buildDeepSeekPayload(messages) {
  return {
    model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    thinking: { type: 'disabled' },
    response_format: { type: 'json_object' },
    max_tokens: 500
  };
}

async function callDeepSeek(messages, fetchImpl = globalThis.fetch) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const error = new Error('DEEPSEEK_API_KEY is not configured');
    error.code = 'NOT_CONFIGURED';
    throw error;
  }
  if (typeof fetchImpl !== 'function') throw new Error('Global fetch is unavailable; Node.js 18+ is required');

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(buildDeepSeekPayload(messages)),
      signal: controller.signal
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // Upstream occasionally returns non-JSON error bodies.
    }

    if (!response.ok) {
      const error = new Error(`DeepSeek upstream error: ${response.status}`);
      error.code = 'UPSTREAM_ERROR';
      error.status = response.status;
      error.detail = payload;
      throw error;
    }

    const rawContent = payload?.choices?.[0]?.message?.content;
    return {
      reply: normalizeReply(rawContent),
      model: payload?.model || process.env.DEEPSEEK_MODEL || DEFAULT_MODEL
    };
  } finally {
    clearTimeout(timeout);
  }
}

function servePublicPath(req, res, pathname) {
  if (pathname === '/' || pathname === '/index.dev.html') {
    sendFile(res, path.join(ROOT, 'index.dev.html'), 'text/html; charset=utf-8');
    return true;
  }
  if (pathname === '/index.html') {
    res.writeHead(302, { Location: '/' });
    res.end();
    return true;
  }
  if (pathname === '/runtime/niva-brain.js') {
    sendFile(res, path.join(ROOT, 'runtime', 'niva-brain.js'), 'text/javascript; charset=utf-8');
    return true;
  }
  if (pathname.startsWith('/assets/')) {
    const relative = pathname.slice('/assets/'.length);
    if (!relative || relative.includes('..') || relative.includes('\\')) return false;
    const ext = path.extname(relative).toLowerCase();
    const types = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml; charset=utf-8'
    };
    if (!types[ext]) return false;
    sendFile(res, path.join(ROOT, 'assets', relative), types[ext]);
    return true;
  }
  return false;
}

function createNivaServer({ fetchImpl = globalThis.fetch } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        brainConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
        model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        sendJson(res, error.message === 'REQUEST_TOO_LARGE' ? 413 : 400, {
          ok: false,
          error: error.message === 'REQUEST_TOO_LARGE' ? '请求内容过长。' : '请求格式不是有效 JSON。'
        });
        return;
      }

      const messages = sanitizeConversation(body.messages);
      if (!messages.length || messages[messages.length - 1].role !== 'user') {
        sendJson(res, 400, { ok: false, error: '缺少有效的用户消息。' });
        return;
      }

      try {
        const result = await callDeepSeek(messages, fetchImpl);
        sendJson(res, 200, { ok: true, reply: result.reply, model: result.model });
      } catch (error) {
        if (error.code === 'NOT_CONFIGURED') {
          sendJson(res, 503, { ok: false, error: 'NIVA 大脑尚未配置 DEEPSEEK_API_KEY。视觉与本地动作仍可正常使用。' });
          return;
        }
        console.error('[NIVA Brain]', error.message, error.status || '', error.detail || '');
        sendJson(res, 502, { ok: false, error: 'NIVA 大脑暂时不可用，请稍后再试。' });
      }
      return;
    }

    if (req.method === 'GET' && servePublicPath(req, res, url.pathname)) return;
    sendJson(res, 404, { ok: false, error: 'Not found' });
  });
}

loadDotEnv();

if (require.main === module) {
  const server = createNivaServer();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`NIVA V0.6 listening on http://localhost:${PORT}`);
    console.log(`Brain: ${process.env.DEEPSEEK_API_KEY ? 'configured' : 'offline (DEEPSEEK_API_KEY missing)'}`);
  });
}

module.exports = {
  SYSTEM_PROMPT,
  sanitizeConversation,
  normalizeReply,
  buildDeepSeekPayload,
  callDeepSeek,
  createNivaServer
};
