# NIVA 2D/2.5D 架构与控制契约

## 当前主线

NIVA 当前主线是：

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

3D / VRM 已进入暂停更新版。旧 VRM 文件仍保留为历史技术验证资产，但不再阻塞当前 MVP。

## V0.6 兼容契约

V0.6 使用：

```js
NIVA.play({
  text: "要说的台词",
  emotion: "happy",
  motion: "wave"
});
```

支持：

- emotion：`neutral | smile | shy | thinking | sad | angry | surprise`
- motion：`idle | wave | nod | shake | tilt | jump | look`

这个契约继续保留为兼容层。

## V0.7 Control Protocol MVP

V0.7 不再只关心“播放哪个动作”，而是关心“角色身体当前应该处于什么控制状态”。

体验入口：

```text
control.html
```

核心结构：

```js
{
  face: {
    eyeOpen: 0.85,
    gazeX: 0,
    gazeY: 0,
    browRaise: 0,
    mouthOpen: 0,
    mouthSmile: 0.1,
    blush: 0
  },
  head: {
    yaw: 0,
    pitch: 0,
    tilt: 0
  },
  torso: {
    bodyLean: 0,
    chestLift: 0.2,
    waistTwist: 0,
    breath: 0.35
  },
  arms: {
    leftArmPose: "relaxed",
    rightArmPose: "relaxed",
    leftHandOpen: 0.55,
    rightHandOpen: 0.55
  },
  legs: {
    stance: "balanced",
    weightShift: 0
  },
  emotion: {
    mood: "neutral",
    intensity: 0.4
  }
}
```

## 控制范围

### Face

- `eyeOpen`：眼睛开合
- `gazeX`：视线左右
- `gazeY`：视线上下
- `browRaise`：眉毛抬高或压低
- `mouthOpen`：嘴巴开合
- `mouthSmile`：嘴角上扬或下压
- `blush`：腮红强度

### Head

- `yaw`：左右转头
- `pitch`：抬头 / 低头
- `tilt`：歪头

### Torso

- `bodyLean`：身体倾斜
- `chestLift`：胸腔打开和挺拔感
- `waistTwist`：腰部扭转
- `breath`：呼吸幅度

### Arms

- `leftArmPose` / `rightArmPose`
- 允许值：`relaxed | raise | present | behind | cross`

### Legs

- `stance`
- 允许值：`idle | balanced | stepLeft | stepRight`
- `weightShift`：重心左右移动

### Emotion

- `mood`
- 允许值：`neutral | happy | thinking | proud | calm | annoyed | shy`
- `intensity`：情绪强度

## 当前渲染策略

V0.7 的 `control.html` 使用 Debug Rig Renderer。

它不是最终角色美术，而是控制协议验证器：

- 验证五官、头部、躯干、手臂、腿部是否能被统一 JSON 控制；
- 验证手动控制面板和 Offline Demo 是否能输出同一种数据；
- 验证未来 LLM 可以接入相同协议。

## 后续渲染策略

下一步是阶段 1.6：精致 2D/2.5D 主角色重建。

届时不改变 `NivaControlState`，只替换 Renderer：

```text
NivaControlState
        ↓
Formal NIVA Layered Character Renderer
        ↓
蓝发 NIVA 正式角色资产
```

也就是说，V0.7 先解决“控得动”，阶段 1.6 再解决“画得美”。