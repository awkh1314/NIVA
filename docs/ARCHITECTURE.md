# NIVA v3.0 形象架构与控制契约

## 分层结构（透明 PNG，独立图层）

| 图层 | 文件 | 说明 |
| --- | --- | --- |
| body | `assets/body.png` | 身体主体 |
| head | `assets/head.png` | 头部 |
| hair_left | `assets/hair_left.png` | 左发束 |
| arm_left | `assets/arm_left.png` | 左臂 |
| arm_right | `assets/arm_right.png` | 右臂 |
| skirt_right | `assets/skirt_right.png` | 全息裙摆 |
| full | `assets/full.png` | 合成参考全图 |

图层独立，可在运行时分别做位移 / 旋转 / 缩放，实现骨骼式运动。

## 面部绑定（SVG 覆盖层）

- **眨眼**：眼睑形状动画
- **嘴形**：根据发音 / 情绪切换口型
- **腮红**：情绪强度映射透明度
- **眉毛**：情绪映射角度

## 环境动效

- 呼吸（身体轻微缩放）
- 发丝摆动（hair 图层微旋转）
- 裙摆摆动（skirt 图层微旋转）
- 手臂微动（arm 图层微位移）

## 控制契约

```js
NIVA.play({
  text: "要说的台词",     // 可选，驱动口型与气泡
  emotion: "happy",      // neutral | happy | shy | thinking | ...
  motion: "wave"         // idle | wave | breathe | ...
});
```

`index.html` 为自包含运行版（离线）；`index.dev.html` 通过 `assets/` 引用分层素材，便于扩展新的图层、表情或动作。
