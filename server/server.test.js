const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DEEPSEEK_API_KEY = 'test-secret';
process.env.DEEPSEEK_MODEL = 'deepseek-v4-flash';

const {
  normalizeReply,
  buildDeepSeekPayload,
  createNivaServer
} = require('./server');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

test('normalizes valid and malformed model output safely', () => {
  assert.deepEqual(
    normalizeReply('{"text":"你好","emotion":"smile","motion":"wave"}'),
    { text: '你好', emotion: 'smile', motion: 'wave' }
  );

  assert.deepEqual(
    normalizeReply('{"text":"还能聊","emotion":"not-real","motion":"teleport"}'),
    { text: '还能聊', emotion: 'neutral', motion: 'idle' }
  );

  assert.deepEqual(
    normalizeReply('普通文本'),
    { text: '普通文本', emotion: 'neutral', motion: 'idle' }
  );
});

test('builds low-latency DeepSeek V4 JSON request', () => {
  const payload = buildDeepSeekPayload([{ role: 'user', content: '你好' }]);
  assert.equal(payload.model, 'deepseek-v4-flash');
  assert.deepEqual(payload.thinking, { type: 'disabled' });
  assert.deepEqual(payload.response_format, { type: 'json_object' });
  assert.equal(payload.messages.at(-1).content, '你好');
  assert.match(payload.messages[0].content, /JSON/);
});

test('serves V0.6 page and completes mocked /api/chat round trip', async () => {
  let upstream = null;
  const fakeFetch = async (url, options) => {
    upstream = { url, options };
    return new Response(JSON.stringify({
      model: 'deepseek-v4-flash',
      choices: [{
        message: {
          content: '{"text":"你好，我是 NIVA。","emotion":"smile","motion":"wave"}'
        }
      }]
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const server = createNivaServer({ fetchImpl: fakeFetch });
  const base = await listen(server);

  try {
    const pageResponse = await fetch(`${base}/`);
    const page = await pageResponse.text();
    assert.equal(pageResponse.status, 200);
    assert.match(page, /BRAIN MVP · V0\.6/);
    assert.match(page, /runtime\/niva-brain\.js/);
    assert.match(page, /runtime\/niva-chat-ui\.js/);
    assert.match(page, /window\.NIVA=\{play,setEmotion,blink,motion:doMotion\}/);
    assert.doesNotMatch(page, /test-secret/);

    const uiResponse = await fetch(`${base}/runtime/niva-chat-ui.js`);
    const ui = await uiResponse.text();
    assert.equal(uiResponse.status, 200);
    assert.match(ui, /nivaChatInput/);
    assert.match(ui, /addEventListener\('submit'/);
    assert.match(ui, /window\.NIVA\.play\(reply\)/);

    const chatResponse = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: '你好' }] })
    });
    const chat = await chatResponse.json();

    assert.equal(chatResponse.status, 200);
    assert.deepEqual(chat.reply, {
      text: '你好，我是 NIVA。',
      emotion: 'smile',
      motion: 'wave'
    });
    assert.equal(upstream.url, 'https://api.deepseek.com/chat/completions');
    assert.equal(upstream.options.headers.Authorization, 'Bearer test-secret');

    const sent = JSON.parse(upstream.options.body);
    assert.equal(sent.model, 'deepseek-v4-flash');
    assert.deepEqual(sent.thinking, { type: 'disabled' });
    assert.deepEqual(sent.response_format, { type: 'json_object' });
  } finally {
    await close(server);
  }
});

test('keeps local visual mode usable when API key is absent', async () => {
  const previous = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  const server = createNivaServer({ fetchImpl: async () => { throw new Error('should not call upstream'); } });
  const base = await listen(server);

  try {
    const health = await fetch(`${base}/api/health`).then(response => response.json());
    assert.equal(health.brainConfigured, false);

    const response = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: '你好' }] })
    });
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.match(body.error, /本地动作仍可正常使用/);

    const page = await fetch(`${base}/`).then(response => response.text());
    assert.match(page, /data-motion="wave"/);
    assert.match(page, /data-emotion="smile"/);
  } finally {
    await close(server);
    process.env.DEEPSEEK_API_KEY = previous;
  }
});
