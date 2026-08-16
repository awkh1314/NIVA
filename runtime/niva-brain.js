window.NIVABrain = (() => {
  const history = [];
  const MAX_HISTORY = 20;

  function trim() {
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  }

  async function chat(message) {
    const text = String(message || '').trim();
    if (!text) throw new Error('消息不能为空');

    const userTurn = { role: 'user', content: text };
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [...history, userTurn] })
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      throw new Error('NIVA 大脑返回了无法解析的响应');
    }

    if (!response.ok || !data.ok || !data.reply) {
      throw new Error(data?.error || 'NIVA 大脑请求失败');
    }

    history.push(userTurn, { role: 'assistant', content: data.reply.text });
    trim();
    return data.reply;
  }

  function reset() {
    history.length = 0;
  }

  return { chat, reset };
})();
