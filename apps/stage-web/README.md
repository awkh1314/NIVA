# NIVA 2D Official Stage

NIVA 当前正式前端路线。项目已从 3D/VRM 实验切回高质量 2D 数字生命舞台，以更低复杂度完成可展示、可交互、可继续接 AI 的 MVP。

## 当前能力

- 完整 NIVA 2D 分层角色渲染
- 自动呼吸、漂浮、发丝/裙摆微动
- 自动眨眼与指针轻微视线/视差反馈
- `neutral / happy / shy / sad / angry / surprised / thinking` 情绪状态
- `wave / greet / thinking / happy / sad / lookAround` 动作状态
- 对话打字机效果
- 可选浏览器本地 TTS
- 预设交互场景
- 响应式桌面/移动端界面
- 保留统一 `window.NIVA.act()` 行为协议，后续可直接接 DeepSeek / OpenAI / 本地模型

## 启动

```bash
cd apps/stage-web
npm install
npm run dev
```

## 构建

```bash
npm run build
```

GitHub Pages 工作流会把仓库根目录 `assets/` 中的 NIVA 2D 分层素材一起打入部署产物。

## 对外控制接口

```js
window.NIVA.act({
  text: '你好呀',
  emotion: 'happy',
  expressionIntensity: 0.8,
  motion: 'wave',
  lookTarget: { x: 0.2, y: -0.1 }
})
```

也可以单独调用：

```js
NIVA.setEmotion('thinking')
NIVA.motion('greet')
NIVA.blink()
```

## 架构原则

角色身份、记忆、人格与行为协议不绑定具体渲染方式。当前 Renderer 固定为 2D；未来接入 LLM 时，模型只输出受约束的 action JSON，不直接控制 DOM 或动画代码。

3D 相关代码保留在历史提交中，不再作为当前产品依赖。
