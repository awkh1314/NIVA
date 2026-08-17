# NIVA 数字生命精灵 · 演进路线图

从「会动的图片」走向「可被大模型数据化控制的数字生命」。

当前主线：**2D/2.5D + Control Protocol 优先**。

3D / VRM 当前状态：**暂停更新版（Legacy / Paused）**。它只保留为历史技术验证和未来可选身体渲染器，不再作为当前 MVP 的实现路线。

## 路线原则

NIVA 不走三条错误主线：

- 不把 PPT 动画作为核心；PPT 只能做动作分镜或演示草稿。
- 不让 LLM 逐帧生成像素；这会慢、贵、不稳定。
- 不继续扩展 3D / VRM 作为当前 MVP 主体；当前优先跑通更轻的 2D/2.5D 控制协议。

当前正确主线：

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

---

## 阶段 0 — 可视化躯壳（已完成 ✅）

- [x] 表情切换原型
- [x] 分层骨架 / SVG 面部绑定 / 环境动效
- [x] 统一表现层契约 `NIVA.play({ text, emotion, motion })`

## 阶段 1 — 对话大脑（已完成 ✅）

### V0.6 Brain MVP

- [x] DeepSeek API 后端代理
- [x] API Key 仅保存在服务端环境变量
- [x] Web 聊天输入、Enter 发送、消息记录
- [x] 当前页面会话上下文
- [x] 模型输出 `text / emotion / motion`
- [x] 对话自动驱动 `NIVA.play()`
- [x] thinking 请求状态
- [x] 非法 JSON / 非法枚举容错
- [x] Brain 离线时视觉与本地动作继续运行
- [x] 移除旧随机 behavior/runtime，统一控制路径

## 阶段 1.5 — NIVA Control Protocol MVP（已完成 ✅）

目标：从“播放 emotion/motion”升级到“身体控制数据驱动”。

### V0.7 Control Protocol MVP

- [x] 新增统一 `NivaControlState`
- [x] 新增 `/control.html` 调试页面
- [x] 新增手动控制面板
- [x] 实时显示当前 Control JSON
- [x] Face 控制：`eyeOpen / gazeX / gazeY / browRaise / mouthOpen / mouthSmile`
- [x] Head 控制：`yaw / pitch / tilt`
- [x] Torso 控制：`bodyLean / chestLift / waistTwist / breath`
- [x] Arms 控制：`leftArmPose / rightArmPose`
- [x] Legs 控制：`stance / weightShift`
- [x] Emotion 控制：`mood / intensity`
- [x] Preset：`Neutral / Happy / Thinking / Proud / Calm / Reset`
- [x] Offline Demo 返回 `text + control`
- [x] Renderer 从固定动画播放改为执行 Control State
- [x] 保留旧 `NIVA.play({ text, emotion, motion })` 作为兼容方向

### V0.7 验收标准

- [x] 手动拖动控制面板，角色能实时变化
- [x] 控制 JSON 实时更新
- [x] 同一句话，三种人格输出不同控制数据
- [x] LLM / Offline Demo 不直接操作 DOM
- [x] Main Page 和 Control Page 都能正常运行
- [x] 不引入 3D / WebGL / Live2D / PPT 动画核心方案

## 阶段 1.6 — 精致 2D/2.5D 主角色重建（下一步）

在 Control Protocol 稳定后，再重做视觉质量。

- [ ] 基于原蓝发 NIVA 形象制作分层 2D/2.5D 主角色
- [ ] 保留长蓝发、白蓝服装、未来感头饰、数字生命气质
- [ ] 将角色拆成可控制图层：头、脸、眼、嘴、发、躯干、手臂、腿、外披、特效
- [ ] 用同一套 `NivaControlState` 驱动角色
- [ ] 先做 Debug Rig，再接正式角色资产

## 阶段 2 — 记忆与人格

- [ ] 稳定的人格 System Prompt
- [ ] 短期记忆压缩
- [ ] 长期记忆存储
- [ ] 用户偏好 / 重要事实召回
- [ ] 记忆的查看、修改与删除机制

## 阶段 3 — 语音

- [ ] TTS 语音合成
- [ ] ASR 语音输入
- [ ] 语音与口型同步

## 阶段 4 — 工具型超级助手

- [ ] 日程 / 环境感知
- [ ] 搜索与信息获取
- [ ] 可授权的外部工具调用
- [ ] 明确区分“回答”和“实际执行”

## 阶段 5 — 多端触达

- [ ] Web 常驻挂件
- [ ] 桌面端常驻
- [ ] 移动端
- [ ] 企业微信等消息入口

## 阶段 6 — 本地优先运行时

- [ ] 本地推理可选
- [ ] 用户数据自托管
- [ ] 敏感数据尽可能不离端

---

> 原则：**形象先行，大脑闭环，控制协议成形，记忆增强，多端触达，隐私兜底。**