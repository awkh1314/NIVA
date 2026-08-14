// NIVA Runtime v1
// Emotion + behavior state machine

window.NIVA = window.NIVA || {};

NIVA.state = {
  emotion: 'curious',
  motion: 'thinking',
  started: false
};

const actions = {
  thinking: {
    text: '我在想一些事情…',
    duration: 6000
  },
  smile: {
    text: '看到你我很开心',
    duration: 5000
  },
  shy: {
    text: '嗯…有点害羞',
    duration: 5000
  },
  lookAround: {
    text: '让我看看周围',
    duration: 4000
  }
};

NIVA.act = function(action) {
  if (!actions[action]) action = 'thinking';
  NIVA.state.motion = action;
  window.dispatchEvent(new CustomEvent('niva-action', {
    detail: actions[action]
  }));
};

NIVA.start = function() {
  if (NIVA.state.started) return;
  NIVA.state.started = true;

  NIVA.act('thinking');

  setInterval(() => {
    const pool = ['thinking','lookAround','smile','shy'];
    const next = pool[Math.floor(Math.random()*pool.length)];
    NIVA.act(next);
  }, 12000);
};

window.addEventListener('load', () => NIVA.start());
