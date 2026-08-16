(() => {
  const STYLE_ID = 'niva-v06-chat-style';
  const PANEL_ID = 'nivaBrainPanel';

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .niva-brain-panel{order:-1}
      .niva-chat-log{height:230px;overflow:auto;border:1px solid rgba(255,255,255,.055);background:#050915;border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:9px;margin-bottom:10px}
      .niva-chat-empty{color:#6f83a5;font-size:12px;line-height:1.6;margin:auto;text-align:center;padding:20px}
      .niva-msg{max-width:88%;padding:9px 11px;border-radius:12px;font-size:13px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
      .niva-msg.user{align-self:flex-end;background:rgba(110,234,255,.11);border:1px solid rgba(110,234,255,.16);color:#e9fbff}
      .niva-msg.assistant{align-self:flex-start;background:rgba(181,144,255,.10);border:1px solid rgba(181,144,255,.16);color:#f3edff}
      .niva-msg.error{align-self:center;max-width:100%;background:rgba(255,120,150,.08);border:1px solid rgba(255,120,150,.18);color:#ffc8d4;font-size:12px}
      .niva-chat-form{display:grid;grid-template-columns:1fr auto;gap:8px}
      .niva-chat-input{width:100%;min-width:0;border:1px solid rgba(110,234,255,.18);background:rgba(7,12,28,.82);color:#eef7ff;border-radius:12px;padding:11px 12px;outline:none;font:inherit}
      .niva-chat-input:focus{border-color:rgba(110,234,255,.52);box-shadow:0 0 0 2px rgba(110,234,255,.07)}
      .niva-chat-send{min-width:72px}
      .niva-chat-send:disabled,.niva-chat-input:disabled{opacity:.55;cursor:not-allowed}
      .niva-brain-meta{display:flex;justify-content:space-between;gap:10px;margin-top:9px;color:#6f83a5;font-size:10px;line-height:1.4}
      .niva-brain-meta strong{color:#9fe7ff;font-weight:600}
      @media(max-width:900px){.niva-chat-log{height:210px}}
    `;
    document.head.appendChild(style);
  }

  function makeMessage(role, text) {
    const node = document.createElement('div');
    node.className = `niva-msg ${role}`;
    node.textContent = text;
    return node;
  }

  function setTopStatus(text, mode = 'local') {
    const status = document.querySelector('.status');
    if (!status) return;
    status.textContent = text;
    if (mode === 'online') {
      status.style.color = '#b8ffdf';
      status.style.borderColor = 'rgba(95,255,196,.18)';
    } else if (mode === 'thinking') {
      status.style.color = '#c8f7ff';
      status.style.borderColor = 'rgba(110,234,255,.28)';
    } else if (mode === 'error') {
      status.style.color = '#ffc8d4';
      status.style.borderColor = 'rgba(255,120,150,.24)';
    } else {
      status.style.color = '#d9c9ff';
      status.style.borderColor = 'rgba(181,144,255,.22)';
    }
  }

  async function probeBrain(meta) {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const data = await response.json();
      if (response.ok && data.brainConfigured) {
        setTopStatus('● BRAIN ONLINE', 'online');
        meta.innerHTML = `模型 <strong>${String(data.model || 'DeepSeek')}</strong> · 会话仅保存在当前页面`;
        return;
      }
      setTopStatus('● LOCAL VISUAL / BRAIN OFFLINE', 'local');
      meta.textContent = '未配置 API Key；角色、表情和本地动作仍可使用。';
    } catch {
      setTopStatus('● LOCAL VISUAL', 'local');
      meta.textContent = '后端未连接；当前保持纯本地视觉模式。';
    }
  }

  function mount() {
    if (document.getElementById(PANEL_ID)) return;
    const side = document.querySelector('.side');
    if (!side || !window.NIVA || !window.NIVABrain) return;

    addStyles();

    const panel = document.createElement('section');
    panel.className = 'card panel niva-brain-panel';
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <h2>NIVA 对话 · BRAIN V0.6</h2>
      <p class="sub">输入一句话。DeepSeek 只返回 text / emotion / motion，所有角色表现统一交给 <code>NIVA.play()</code>。</p>
      <div class="niva-chat-log" id="nivaChatLog"><div class="niva-chat-empty" id="nivaChatEmpty">现在可以直接和 NIVA 对话。<br>页面刷新后本轮会话会清空。</div></div>
      <form class="niva-chat-form" id="nivaChatForm">
        <input class="niva-chat-input" id="nivaChatInput" maxlength="2000" autocomplete="off" placeholder="和 NIVA 说点什么…" aria-label="和 NIVA 对话">
        <button class="niva-chat-send" id="nivaChatSend" type="submit">发送</button>
      </form>
      <div class="niva-brain-meta" id="nivaBrainMeta">正在检查 Brain 状态…</div>
    `;
    side.prepend(panel);

    const form = panel.querySelector('#nivaChatForm');
    const input = panel.querySelector('#nivaChatInput');
    const send = panel.querySelector('#nivaChatSend');
    const log = panel.querySelector('#nivaChatLog');
    const empty = panel.querySelector('#nivaChatEmpty');
    const meta = panel.querySelector('#nivaBrainMeta');
    let busy = false;

    function append(role, text) {
      empty?.remove();
      log.appendChild(makeMessage(role, text));
      log.scrollTop = log.scrollHeight;
    }

    function setBusy(next) {
      busy = next;
      input.disabled = next;
      send.disabled = next;
      send.textContent = next ? '思考中…' : '发送';
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const message = input.value.trim();
      if (!message || busy) return;

      append('user', message);
      input.value = '';
      setBusy(true);
      setTopStatus('● NIVA THINKING', 'thinking');
      window.NIVA.play({ text: '让我想一下…', emotion: 'thinking', motion: 'tilt' });

      try {
        const reply = await window.NIVABrain.chat(message);
        append('assistant', reply.text);
        window.NIVA.play(reply);
        setTopStatus('● BRAIN ONLINE', 'online');
      } catch (error) {
        const messageText = error?.message || 'NIVA 大脑暂时不可用。';
        append('error', messageText);
        window.NIVA.play({
          text: '现在连接不到大脑，不过我的本地表情和动作仍然可以正常使用。',
          emotion: 'neutral',
          motion: 'idle'
        });
        setTopStatus('● BRAIN OFFLINE / LOCAL OK', 'error');
      } finally {
        setBusy(false);
        input.focus();
      }
    });

    probeBrain(meta);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
