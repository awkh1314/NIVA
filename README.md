# NIVA · 数字生命精灵

> 一个有形象、有情绪、能对话，并逐步形成记忆与工具能力的 2D/2.5D 数字生命助手。

NIVA 当前产品主线确定为 **2D/2.5D + Control Protocol**，先完成产品 0→1；3D / VRM 暂停功能迭代，未来作为最终身体渲染方向重新接入同一套控制协议。

## 3D 模型资产规则

仓库只允许存在一个正式 VRM 模型：

```text
NIVA.vrm
```

`NIVA.vrm` 当前内容就是用户上传的 `自创形象.vrm`，仅进行了仓库文件名统一，没有更换模型内容。

规则：

- `NIVA.vrm` 是唯一允许被产品代码引用的 VRM 模型入口；
- 不再保留 `AvatarSample_A.vrm`、旧版 `NIVA.vrm` 或其他示例 / 占位 VRM；
- 后续不得为了测试直接提交第二个 `.vrm` 到主线；
- 需要做 3D 实验时，也必须围绕当前 `NIVA.vrm` 进行，或在独立实验分支完成后再决定是否替换唯一正式模型；
- 当前 2D/2.5D 产品主线不依赖 VRM，因此 3D 暂停不会阻塞 MVP。

## 在线体验

GitHub Pages：

```text
https://awkh1314.github.io/niva-digital-spirit/
```

入口：

- `index.html`：公开入口，当前指向 2D/2.5D 主线；
- `index.dev.html`：2D/2.5D Companion，保留原角色、表情、动作；
- `control.html`：Control Protocol MVP，可手动控制眼睛、嘴巴、头部、躯干、手臂、腿部和情绪，并实时查看 Control JSON。

## 当前版本

| 版本 | 状态 | 说明 |
| --- | --- | --- |
| v2.0 | ✅ | 单图 + 多表情原型 |
| v3.0 | ✅ | 分层 PNG + SVG 面部 + 骨架式微动 |
| v0.6 Brain MVP | ✅ | DeepSeek 对话 → `text/emotion/motion` → `NIVA.play()` |
| 3D / VRM Track | ⏸️ Paused | 只保留唯一正式模型 `NIVA.vrm`，暂停功能迭代 |
| v0.7 Control Protocol MVP | ✅ | `/control.html`：五官、头部、躯干、四肢的数据化控制面板 |

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

## Control Protocol 方向

目标不是不断增加固定动画，而是建立统一的 NIVA Control Protocol：

```text
LLM / Manual Control Panel
        ↓
NIVA Control Data
        ↓
Character Controller
        ↓
2D/2.5D Runtime（当前）
        ↓
3D / VRM Runtime（未来）
```

第一版控制维度：

```text
face:  eyeOpen / gazeX / gazeY / browRaise / mouthOpen / mouthSmile / blush
head:  yaw / pitch / tilt
torso: bodyLean / chestLift / waistTwist / breath
arms:  leftArmPose / rightArmPose / leftHandOpen / rightHandOpen
legs:  stance / weightShift
emotion: mood / intensity
```

核心原则：同一套控制数据先把 2D/2.5D 做出生命感，未来再把渲染层替换或扩展为唯一的 `NIVA.vrm`，而不是重新设计一套 3D 控制系统。

## V0.6 架构

```text
Browser
  ├─ NIVA 2D/2.5D 表现层
  ├─ runtime/niva-brain.js
  └─ runtime/niva-chat-ui.js
          │
          ▼
POST /api/chat
          │
          ▼
server/server.js
          │  DEEPSEEK_API_KEY only here
          ▼
DeepSeek
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

在 `.env` 中填写：

```env
DEEPSEEK_API_KEY=你的_key
```

启动：

```bash
npm start
```

访问：`http://localhost:3000`

## 离线模式

- `index.html`：GitHub Pages 公开入口；
- `index.dev.html`：2D/2.5D 开发页；
- `control.html`：Control Protocol 调试页；
- `npm start`：2D 页面 + Brain 后端。

没有配置 `DEEPSEEK_API_KEY` 时，视觉、表情、动作和固定演示仍可使用。

## 项目结构

```text
niva-digital-spirit/
├─ NIVA.vrm                    # 唯一正式 3D 模型（当前暂停功能迭代）
├─ index.html                  # 公开 2D/2.5D 入口
├─ control.html                # Control Protocol MVP
├─ index.dev.html              # 2D/2.5D 开发页
├─ assets/                     # 2D 分层 PNG 素材
├─ runtime/
│  ├─ niva-brain.js
│  └─ niva-chat-ui.js
├─ server/
│  ├─ server.js
│  └─ server.test.js
├─ .env.example
├─ package.json
├─ ROADMAP.md
└─ docs/
   ├─ ARCHITECTURE.md
   ├─ 3D_PAUSED.md
   └─ ITERATION_WORKFLOW.md
```

## 当前产品边界

当前重点是把 2D/2.5D 的动作、状态过渡和控制协议做成熟，而不是继续扩张 3D 功能。3D 最终必须复用同一套控制数据，并且只能加载仓库中的唯一正式模型 `NIVA.vrm`。

下一阶段见 [ROADMAP.md](ROADMAP.md)。

## License

保留作者版权。商用或二次开发请先联系作者。