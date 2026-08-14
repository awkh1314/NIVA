# NIVA 3D Stage Web

独立于历史 2D 原型的新 3D 舞台。当前只实现数字生命前端闭环，不接 LLM / TTS / Memory。

## 启动

```bash
cd apps/stage-web
npm install
npm run dev
```

## 必需资产

把 VRM 模型放到：

```text
apps/stage-web/public/avatar/NIVA.vrm
```

把 VRMA 动作放到：

```text
apps/stage-web/public/motions/
├── idle.vrma
├── wave.vrma
├── greet.vrma
├── thinking.vrma
├── happy.vrma
├── sad.vrma
├── surprised.vrma
├── angry.vrma
└── lookAround.vrma
```

动作文件缺失时会跳过，不阻塞 Avatar 启动；VRM 缺失时页面会进入 `ASSET NEEDED` 状态。

## 对外控制接口

```js
window.NIVA.act({
  text: '你好呀',
  emotion: 'happy',
  expressionIntensity: 0.8,
  motion: 'wave',
})
```

渲染层不关心调用来源。以后 DeepSeek / OpenAI / 本地模型只需要输出同一份 action JSON。

## 当前原则

- 历史 2D 版本不改。
- 3D Stage 与具体 VRM 角色资产解耦。
- 优先视觉质量，不继续堆功能。
- 角色换模不允许改 `NivaController` / Behavior Contract。
- 第三方二进制资产必须单独记录许可证。
