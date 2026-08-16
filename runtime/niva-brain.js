window.NIVABrain = (() => {
  const history = [];
  const MAX_HISTORY = 20;

  function push(role, content) {
    history.push({ role, content });
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  }

  async function chat(message, onStatus) {
    push('user', message);
    onStatus?.('thinking');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history })
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'NIVA 大脑请求失败');
      }

      push('assistant', data.reply.text);
      onStatus?.('ready');
      return data.reply;
    } catch (error) {
      onStatus?.('error');
      throw error;
    }
  }

  return { chat };
})();
