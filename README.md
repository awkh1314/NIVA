# NIVA · 数字生命精灵

> 一个有形象、有情绪、能对话，并逐步形成记忆与工具能力的 2D/2.5D 数字生命助手。

NIVA 当前主线已经确定为 **2D/2.5D + Control Protocol**。

3D / VRM 现在进入 **暂停更新版（Legacy / Paused）**：仓库保留 `NIVA.vrm`、`AvatarSample_A.vrm` 等历史技术验证资产，但它们不再作为当前 MVP 的开发主线，也不阻塞新版本迭代。后续只有当 2D/2.5D 控制协议稳定后，才重新评估 3D 作为可选身体渲染器。

## 在线体验

GitHub Pages：

```text
https://awkh1314.github.io/niva-digital-spirit/
```

入口：

- `control.html`：V0.7 Control Protocol MVP，可手动控制眼睛、嘴巴、头部、躯干、手臂、腿部和情绪，并实时查看 Control JSON。
- `index.dev.html`：V0.6 2D/2.5D Companion，保留原角色、表情、动作和 Brain MVP 页面。

## 当前版本

| 版本 | 状态 | 说明 |
| --- | --- | --- |
| v2.0 | ✅ | 单图 + 多表情原型 |
| v3.0 | ✅ | 分层 PNG + SVG 面部 + 骨架式微动 |
| **v0.6 Brain MVP** | **✅** | DeepSeek 对话 → `text/emotion/motion` → `NIVA.play()` |
| **3D / VRM Track** | **⏸️ Paused** | 保留历史验证资产，暂停继续更新 |
| **v0.7 Control Protocol MVP** | **✅** | `/control.html`：五官、头部、躯干、四肢的数据化控制面板 |

V0.6 已实现：

- 页面聊天输入、发送按钮、Enter 发送；
- 当前页面内的临时会话上下文；
- DeepSeek 后端代理，API Key 不进入浏览器；
- 默认 `deepseek-v4-flash`，关闭 thinking 以优先低延迟；
- 严格 JSON 输出：`text + emotion + motion`；
- 模型输出异常时自动回退 `neutral + idle`；
- 请求期间自动进入 `thinking + tilt`；
- DeepSeek 不可用时仍保留原角色、表情、动作与离线页面；
- 所有模型结果统一通过 `NIVA.play()` 驱动表现层；
- 已移除旧的随机行为 runtime，避免多套控制器冲突。

## 当前控制契约

```js
NIVA.play({
  text: "你好，我是 NIVA。",
  emotion: "smile",
  motion: "wave"
});
```

支持：

- emotion：`neutral | smile | shy | thinking | sad | angry | surprise`
- motion：`idle | wave | nod | shake | tilt | jump | look`

LLM 不直接操作 DOM。模型只决定结构化字段，视觉层只接受统一控制契约。

## V0.7 控制协议方向

V0.7 的目标不是增加更多固定动画，而是建立 **NIVA Control Protocol**：

```text
LLM / Manual Control Panel
        ↓
NIVA Control Data
        ↓
Character Controller
        ↓
2D/2.5D Layered Runtime
        ↓
NIVA Body
```

第一版只做简化维度：

```text
face:  eyeOpen / gazeX / gazeY / browRaise / mouthOpen / mouthSmile / blush
head:  yaw / pitch / tilt
torso: bodyLean / chestLift / waistTwist / breath
arms:  leftArmPose / rightArmPose / leftHandOpen / rightHandOpen
legs:  stance / weightShift
emotion: mood / intensity
```

这个阶段的重点是证明：**手动控制面板、Offline Demo 和未来 LLM 都可以输出同一种 Control JSON 来驱动 NIVA。**

## V0.6 架构

```text
Browser
  ├─ 原 NIVA 2D/2.5D 表现层
  ├─ runtime/niva-brain.js      # 当前页面会话 + /api/chat 客户端
  └─ runtime/niva-chat-ui.js    # 聊天 UI → NIVA.play()
          │
          ▼
POST /api/chat
          │
          ▼
server/server.js
          │  DEEPSEEK_API_KEY only here
          ▼
DeepSeek V4 Flash
          │
          ▼
{ text, emotion, motion }
```

## 启动

要求 Node.js 18+。

第一次配置：

```bash
cp .env.example .env
```

然后在 `.env` 中填写：

```env
DEEPSEEK_API_KEY=你的_key
```

启动只需要一条命令：

```bash
npm start
```

访问：`http://localhost:3000`

## 离线模式

网络能力不是视觉运行的前提：

- 直接打开 `index.html`：公开体验入口；
- 直接打开 `control.html`：V0.7 Control Protocol MVP；
- 直接打开 `index.dev.html`：引用 `assets/` 的开发版；
- `npm start`：在原开发页基础上注入 V0.6 Brain UI。

没有配置 `DEEPSEEK_API_KEY` 时，聊天会显示 Brain 离线，但表情、动作、眨眼和固定演示仍可使用。

## 测试

```bash
npm test
```

测试覆盖：结构化输出容错、DeepSeek V4 请求参数、页面 Brain 注入、`/api/chat` HTTP 闭环、API Key 不出现在前端，以及无 Key 时的离线降级。

## 项目结构

```text
niva-digital-spirit/
├─ index.html                  # 公开体验入口
├─ control.html                # V0.7 Control Protocol MVP
├─ index.dev.html              # 原始 2D/2.5D 开发页
├─ assets/                     # 分层 PNG 素材
├─ runtime/
│  ├─ niva-brain.js            # 会话 / API 客户端，不控制角色 DOM
│  └─ niva-chat-ui.js          # 聊天 UI 与 NIVA.play() 适配层
├─ server/
│  ├─ server.js                # 静态服务 + DeepSeek 安全代理
│  └─ server.test.js           # Node 内置测试
├─ .env.example
├─ package.json
├─ ROADMAP.md
└─ docs/
   ├─ ARCHITECTURE.md
   ├─ 3D_PAUSED.md
   └─ ITERATION_WORKFLOW.md
```

## 当前边界

V0.7 **没有**实现长期记忆、数据库、TTS、ASR、桌面常驻、3D 或真实大模型实时身体控制。它先提供前端可体验的 Control Protocol 调试面板。

下一阶段见 [ROADMAP.md](ROADMAP.md)。

## License

保留作者版权。商用或二次开发请先联系作者。