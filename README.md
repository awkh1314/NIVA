# NIVA · 数字生命精灵

> 一个有形象、有情绪、能对话，并逐步形成记忆与工具能力的数字生命助手。

NIVA 当前产品策略：**2D/2.5D 负责低成本完成 0→1，唯一的 `NIVA.vrm` 作为最终 3D 身体方向逐步验证。** 两条表现层必须复用同一套 Control Protocol，不允许形成两套割裂的控制系统。

## 唯一 3D 模型

仓库只允许一个正式 VRM：

```text
NIVA.vrm
```

规则：

- `NIVA.vrm` 是唯一允许被产品代码引用的 VRM 模型；
- 不提交第二个示例、占位或测试 `.vrm` 到 `main`；
- 当前模型为 VRM 1.0，54 个 Humanoid bones；
- 所有 3D 骨骼控制必须先经过 `runtime/niva-vrm-limits.mjs`；
- 禁止业务代码直接绕过安全层写入原始 bone node。

## 在线体验

GitHub Pages：

```text
https://awkh1314.github.io/niva-digital-spirit/
```

入口：

- `index.html`：**V0.8 3D Safe Motion**。默认全身持续低速活动，54 个 VRM Humanoid 骨骼全部受角度、角速度和角加速度限制；
- `index.dev.html`：2D/2.5D Companion 主线；
- `control.html`：Control Protocol 调试页。

## 当前版本

| 版本 | 状态 | 说明 |
| --- | --- | --- |
| v2.0 | ✅ | 单图 + 多表情原型 |
| v3.0 | ✅ | 分层 PNG + SVG 面部 + 骨架式微动 |
| v0.6 Brain MVP | ✅ | DeepSeek 对话 → `text/emotion/motion` → `NIVA.play()` |
| v0.7 Control Protocol MVP | ✅ | 五官、头部、躯干、四肢的数据化控制协议 |
| **v0.8 VRM Safe Motion** | **✅** | 唯一 `NIVA.vrm` + 54 骨骼硬限制 + 速度/加速度限制 + Pages 全身展示 |

## V0.8 运动安全层

人体临床 ROM 只作为参考上界，NIVA 实际执行范围进一步收紧。主要参考包括肩、肘、腕、髋、膝、踝、颈椎、躯干和手指活动范围。

运行时采用三层限制：

```text
目标姿态
  ↓
角度 Hard Clamp
  ↓
最大角速度
  ↓
最大角加速度
  ↓
three-vrm normalized human bones
  ↓
NIVA.vrm
```

即使未来 LLM 或动作系统输出异常值：

```js
NIVA3D.setBoneRotation('head', { x: 10, y: 999, z: 0 });
```

也只会执行 `head.y` 的安全上限，不会让头部无限旋转。

完整限制表：[docs/HUMAN_MOTION_LIMITS.md](docs/HUMAN_MOTION_LIMITS.md)

## 2D / 3D 的关系

当前不是重新把产品主线改成“先做完整 3D”。产品仍然先用 2D/2.5D 降低成本完成 0→1；但 3D 不再完全冻结，而是只做 **未来必需的底层验证**：

```text
LLM / Manual / Behavior
        ↓
NIVA Control Data
        ↓
Character Controller
        ↓
Safety / Motion Layer
        ↓
├─ 2D/2.5D Runtime（0→1 主线）
└─ NIVA.vrm Runtime（最终身体方向）
```

## 当前 2D 控制契约

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

LLM 不直接操作 DOM 或 3D bone。模型只输出结构化控制数据，表现层负责执行。

## 启动

要求 Node.js 18+。

```bash
cp .env.example .env
npm start
```

如需 Brain，在 `.env` 中填写：

```env
DEEPSEEK_API_KEY=你的_key
```

测试：

```bash
npm test
```

测试包含原 Brain HTTP 闭环，以及 VRM 54 骨骼覆盖、异常角度 clamp、自动活动长期不越界。

## 项目结构

```text
niva-digital-spirit/
├─ NIVA.vrm                         # 唯一正式 3D 模型
├─ index.html                       # V0.8 3D Safe Motion Pages 首页
├─ index.dev.html                   # 2D/2.5D 主线
├─ control.html                     # Control Protocol
├─ assets/                          # 2D 分层素材
├─ runtime/
│  ├─ niva-brain.js
│  ├─ niva-chat-ui.js
│  ├─ niva-vrm-limits.mjs           # 54 骨骼角度/速度/加速度限制
│  ├─ niva-vrm-showcase.mjs         # 3D Pages 展示运行时
│  └─ niva-vrm-limits.test.mjs
├─ server/
├─ docs/
│  ├─ HUMAN_MOTION_LIMITS.md
│  ├─ ARCHITECTURE.md
│  └─ ITERATION_WORKFLOW.md
├─ package.json
└─ ROADMAP.md
```

## 当前优先级

1. 用 2D/2.5D 完成产品 0→1；
2. 把动作从固定动画升级为连续、可打断、带惯性和过渡的 Motion Engine；
3. 让 2D 与 3D 共用同一个安全 Control Protocol；
4. 以后替换身体渲染器时，不重写 Brain、人格、记忆和行为层。

## License

保留作者版权。商用或二次开发请先联系作者。
