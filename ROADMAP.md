# NIVA 数字生命精灵 · 演进路线图

从「会动的图片」走向「可被大模型数据化控制的数字生命」。

当前产品策略：**2D/2.5D 先完成 0→1；3D 只做最终身体必需的底层验证，并且必须复用同一套 Control Protocol。**

## 路线原则

- 不把 PPT 动画作为核心；PPT 只提供“平滑过渡/分镜”的设计启发。
- 不让 LLM 逐帧生成像素；这会慢、贵、不稳定。
- 不再维护多套 VRM 模型；`NIVA.vrm` 是唯一 3D 本体。
- 不让 2D 与 3D 各自发展一套控制逻辑。
- 任何 3D 骨骼动作必须经过人体工程活动限制、角速度限制和角加速度限制。

统一目标架构：

```text
LLM / Manual / Behavior
        ↓
NIVA Control Data
        ↓
Character Controller
        ↓
Motion / Safety Layer
        ↓
├─ 2D/2.5D Runtime（0→1 主线）
└─ VRM Runtime（最终身体方向）
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
- [x] Web 聊天输入与当前页面会话上下文
- [x] 模型输出 `text / emotion / motion`
- [x] 对话自动驱动 `NIVA.play()`
- [x] 非法 JSON / 非法枚举容错
- [x] Brain 离线时视觉与本地动作继续运行

## 阶段 1.5 — Control Protocol（已完成 ✅）

### V0.7 Control Protocol MVP

- [x] Face：`eyeOpen / gazeX / gazeY / browRaise / mouthOpen / mouthSmile`
- [x] Head：`yaw / pitch / tilt`
- [x] Torso：`bodyLean / chestLift / waistTwist / breath`
- [x] Arms：`leftArmPose / rightArmPose`
- [x] Legs：`stance / weightShift`
- [x] Emotion：`mood / intensity`
- [x] 手动控制面板与实时 JSON
- [x] Offline Demo / Persona Demo
- [x] LLM 不直接操作 DOM

## 阶段 1.7 — VRM 安全身体底座（已完成 ✅）

### V0.8 VRM Safe Motion

- [x] `NIVA.vrm` 固定为唯一 3D 模型
- [x] 读取并控制 54 个 VRM Humanoid bones
- [x] 使用 three-vrm normalized human bones，吸收模型局部轴差异
- [x] 建立全身关节工程活动范围
- [x] 头颈 / 躯干 / 肩 / 肘 / 腕 / 手指 / 髋 / 膝 / 踝 / 足趾全部限制
- [x] 目标角度 Hard Clamp
- [x] 每骨骼最大角速度限制
- [x] 每骨骼最大角加速度限制
- [x] 自动活动连续长期运行不越界测试
- [x] Pages 首页默认加载全身 3D 模型
- [x] 默认让全身可控骨骼以肉眼可见的低速持续活动
- [x] 眨眼与轻微表情活动
- [x] 鼠标旋转 / 缩放观察全身
- [x] 公开 `NIVA3D.setBoneRotation()` 安全接口，不公开 raw bone node
- [x] 完整限制文档 `docs/HUMAN_MOTION_LIMITS.md`

> V0.8 的意义不是“重新把 3D 变成当前产品主线”，而是提前确定未来 3D 身体绝不能突破的运动底座。

## 阶段 1.8 — 2.5D Motion Engine（当前下一步）

目标：让当前低成本 2D 角色拥有接近 3D 的动态生命感。

- [ ] 所有动作从瞬时切换改为连续插值
- [ ] anticipation：动作前摇
- [ ] follow-through：头发、衣摆、身体延迟跟随
- [ ] overshoot / settle：越位回弹与自然落稳
- [ ] 身体各部位错峰启动与结束
- [ ] 动作可中断、可从当前姿态平滑切入下一姿态
- [ ] 加入角色质量感 / 惯性
- [ ] 加入 2.5D perspective / rotateX / rotateY / scale 伪空间效果
- [ ] 把 2D 动作也接入统一 Safety / Motion Layer
- [ ] 让同一个 Control State 能映射到 2D 与 VRM

### V0.9 Motion Engine 验收标准

- [ ] 任意两个动作切换都不出现跳帧式姿态重置
- [ ] idle → action → idle 有前摇、主动作、回弹和 settle
- [ ] 头、眼、发、躯干、手臂不同时启动/停止
- [ ] 用户肉眼能明显感受到角色的重量、惯性和空间感
- [ ] 2D 主线无需增加大量新美术资源即可提升生命感

## 阶段 2 — 记忆与人格

- [ ] 稳定人格 System Prompt
- [ ] 短期记忆压缩
- [ ] 长期记忆存储
- [ ] 用户偏好 / 重要事实召回
- [ ] 记忆查看、修改与删除

## 阶段 3 — 语音

- [ ] TTS
- [ ] ASR
- [ ] 语音与口型同步

## 阶段 4 — 工具型超级助手

- [ ] 日程 / 环境感知
- [ ] 搜索与信息获取
- [ ] 可授权外部工具调用
- [ ] 明确区分“回答”和“实际执行”

## 阶段 5 — 多端触达

- [ ] Web 常驻挂件
- [ ] 桌面端
- [ ] 移动端
- [ ] 消息入口

## 阶段 6 — 本地优先运行时

- [ ] 本地推理可选
- [ ] 用户数据自托管
- [ ] 敏感数据尽可能不离端

---

> 原则：**2D 先完成产品，Control Protocol 统一身体，Motion Engine 制造生命感，VRM 最终接管渲染，而 Brain / Memory / Tools 不因身体更换而重写。**
