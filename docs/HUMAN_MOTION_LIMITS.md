# NIVA Human Motion Limits · V0.8 Safety Envelope

## 目的

`NIVA.vrm` 是项目唯一的 3D 模型。3D 运行时不允许任意代码直接把骨骼旋转到无限角度；所有姿态必须先经过 `runtime/niva-vrm-limits.mjs` 的硬限制，再经过角速度/角加速度限制，最后写入 VRM normalized human bones。

这是一套 **角色动画工程安全范围**，不是医学诊断或康复处方。人体 ROM 会随年龄、个体、测量方式和姿势变化；因此 NIVA 不直接使用人体可达到的最大临床 ROM，而是以临床常见 ROM 为上界参考，再收紧到更适合连续动画的范围。

## 参考人体活动范围

| 部位 | 常见人体 ROM 参考 | NIVA 工程策略 |
| --- | --- | --- |
| 颈椎 | 屈曲约 80–90°、伸展约 70°、侧屈约 20–45°、左右旋转可接近 90° | 分配到 `neck + head`，合计明显低于极限；默认活动只使用约 20–35% |
| 躯干 | 年轻无症状成人研究均值：屈曲约 40°、伸展约 23°、左右旋转约 35–37° | 分摊到 `spine/chest/upperChest`，每节只允许小角度，避免三节同时叠加过大 |
| 肩 | 屈曲约 180°、外展约 180°、伸展约 45–60°、内/外旋约 90° | `upperArm` 允许大范围但默认仅做小幅活动；肩胛骨单独限制为小幅补偿 |
| 肘 | 屈曲约 135–150°；伸展通常到 0°，部分人可约 -10° | `lowerArm` 禁止明显反向过伸，屈曲上限收紧为约 130° |
| 前臂 | 旋前/旋后约 75–90° | 不让单一 Euler 轴承担全部临床极限；与腕/上臂共同分担并收紧 |
| 腕 | 背伸约 70°、掌屈约 80–90°、桡偏约 20–30°、尺偏约 50° | 实际限制收紧到约 ±55° 屈伸以及更小的偏摆范围 |
| 髋 | 屈曲约 120°、伸展约 10–30°、外展约 45°、内/外旋约 40–45° | `upperLeg` 屈曲上限 90°，其余方向进一步收紧 |
| 膝 | 屈曲约 130–135°、伸展约 0°，少数人可轻度过伸 | `lowerLeg` 主要允许 0–125° 屈曲，反向过伸只留极小容差 |
| 踝 | 背屈约 20°、跖屈约 45°、内翻约 30°、外翻约 20° | `foot` 收紧为较小三轴范围，默认活动只使用数度 |
| 手指 MCP | 屈曲约 90°，可有约 30–45° 伸展 | NIVA 近节限制约 80° 屈曲级别；默认只做小幅自然收放 |
| 手指 PIP | 屈曲约 100–120° | NIVA 中节上限约 100° |
| 手指 DIP | 屈曲约 80–90° | NIVA 远节上限约 80° |
| 拇指 | CMC/MCP/IP 的活动模式更复杂 | 不模拟全部临床自由度，只给三段骨骼保守小范围 |
| 足趾 | 第一 MTP 常见约 45° 屈曲、70° 伸展；其余足趾约 40° 量级 | VRM 只有 `toes` 汇总骨骼，因此只给小幅屈伸，不模拟独立趾关节 |

## 54 个 VRM 骨骼的实际硬限制

下面的 X/Y/Z 是 **three-vrm normalized human bone 的局部 Euler 角（度）**，并不等同于临床测量平面。它们的目的，是把人体 ROM 转换为稳定、跨模型一致、可执行的角色工程限制。

### 躯干 / 头颈 / 眼睛

| VRM bone | X | Y | Z | 最大角速度 |
| --- | ---: | ---: | ---: | ---: |
| hips | -8° ~ 10° | -12° ~ 12° | -7° ~ 7° | 24°/s |
| spine | -5° ~ 7° | -8° ~ 8° | -5° ~ 5° | 20°/s |
| chest | -7° ~ 9° | -10° ~ 10° | -6° ~ 6° | 22°/s |
| upperChest | -5° ~ 7° | -8° ~ 8° | -5° ~ 5° | 20°/s |
| neck | -20° ~ 25° | -35° ~ 35° | -18° ~ 18° | 38°/s |
| head | -12° ~ 15° | -20° ~ 20° | -12° ~ 12° | 42°/s |
| leftEye / rightEye | -10° ~ 10° | -15° ~ 15° | 0° | 90°/s |

### 上肢

| VRM bone | X | Y | Z | 中立值 / 备注 | 最大角速度 |
| --- | ---: | ---: | ---: | --- | ---: |
| leftShoulder | -12° ~ 12° | -10° ~ 10° | -12° ~ 16° | 肩胛补偿 | 35°/s |
| rightShoulder | -12° ~ 12° | -10° ~ 10° | -16° ~ 12° | 肩胛补偿 | 35°/s |
| leftUpperArm | -45° ~ 90° | -55° ~ 55° | -165° ~ -10° | Z 中立 -75°，把 T Pose 放下 | 62°/s |
| rightUpperArm | -45° ~ 90° | -55° ~ 55° | 10° ~ 165° | Z 中立 75° | 62°/s |
| leftLowerArm | -8° ~ 8° | -130° ~ 3° | -8° ~ 8° | Y 中立 -24°，禁止明显反肘 | 78°/s |
| rightLowerArm | -8° ~ 8° | -3° ~ 130° | -8° ~ 8° | Y 中立 24° | 78°/s |
| leftHand | -55° ~ 55° | -22° ~ 22° | -25° ~ 35° | 腕 | 72°/s |
| rightHand | -55° ~ 55° | -22° ~ 22° | -35° ~ 25° | 腕 | 72°/s |

### 手指

四根手指左右镜像。左手主要向 Y 负方向弯曲，右手主要向 Y 正方向弯曲。

| 骨骼段 | 左手 Y | 右手 Y | X/Z | 最大角速度 |
| --- | ---: | ---: | ---: | ---: |
| Index/Middle/Ring/Little Proximal × 8 bones | -80° ~ 12° | -12° ~ 80° | X/Z 各 -8° ~ 8° | 95°/s |
| Index/Middle/Ring/Little Intermediate × 8 bones | -100° ~ 5° | -5° ~ 100° | X/Z 各 -8° ~ 8° | 95°/s |
| Index/Middle/Ring/Little Distal × 8 bones | -80° ~ 5° | -5° ~ 80° | X/Z 各 -8° ~ 8° | 95°/s |
| leftThumbMetacarpal | Y -35° ~ 20° | — | X -20°~35° / Z -25°~25° | 80°/s |
| rightThumbMetacarpal | — | Y -20° ~ 35° | X -20°~35° / Z -25°~25° | 80°/s |
| leftThumbProximal | Y -55° ~ 10° | — | X/Z 小范围 | 90°/s |
| rightThumbProximal | — | Y -10° ~ 55° | X/Z 小范围 | 90°/s |
| leftThumbDistal | Y -70° ~ 8° | — | X/Z 小范围 | 95°/s |
| rightThumbDistal | — | Y -8° ~ 70° | X/Z 小范围 | 95°/s |

### 下肢

| VRM bone | X | Y | Z | 最大角速度 |
| --- | ---: | ---: | ---: | ---: |
| leftUpperLeg | -25° ~ 90° | -35° ~ 35° | -38° ~ 22° | 48°/s |
| rightUpperLeg | -25° ~ 90° | -35° ~ 35° | -22° ~ 38° | 48°/s |
| leftLowerLeg / rightLowerLeg | -3° ~ 125° | -6° ~ 6° | -5° ~ 5° | 68°/s |
| leftFoot | -20° ~ 35° | -10° ~ 10° | -18° ~ 15° | 55°/s |
| rightFoot | -20° ~ 35° | -10° ~ 10° | -15° ~ 18° | 55°/s |
| leftToes / rightToes | -15° ~ 35° | -6° ~ 6° | -5° ~ 5° | 60°/s |

## 三层防越界

1. **目标角度硬 clamp**：`setBoneRotation()` 和自动动画产生的目标都会先进入 `clampBoneRotation()`。
2. **速度限制**：每个骨骼有独立 `maxSpeed`，目标再远也不能瞬间跳过去。
3. **加速度限制**：每个骨骼还有 `maxAccel`，速度变化也不能瞬间发生，所以起步、停止和换向都有平滑过渡。

因此即使未来 LLM、动作库或手动控制器给出 `999°`，运行时也只会执行安全范围内的值。

## 默认 Pages 展示行为

根页面 `index.html` 默认加载唯一模型 `NIVA.vrm`，对 54 个 humanoid bones 生成不同相位的低频正弦目标。默认强度约 72%、速度约 72%，但这里的 72% 是 **demo 小幅度参数的 72%**，不是人体极限的 72%。所以页面上会看到全身持续、肉眼可见、速度较慢的活动，而不会反复撞击关节最大角度。

浏览器端公开控制入口：

```js
NIVA3D.setBoneRotation('head', { x: 10, y: 200, z: 0 });
```

`y: 200` 会被自动压到 `head.y.max = 20°`。页面不会向外暴露原始 VRM bone node，后续业务控制统一走 `NIVA3D` 安全接口。

## 参考资料

- American Academy of Family Physicians, *Telemedicine Management of Musculoskeletal Issues*: shoulder, elbow, wrist, hip, knee and ankle normal ROM. https://www.aafp.org/pubs/afp/issues/2021/0201/p147.html
- Bogduk et al./reviewed cervical biomechanics literature: cervical flexion/extension/lateral bending/rotation ranges. https://pmc.ncbi.nlm.nih.gov/articles/PMC1250253/
- Normative trunk ROM study: mean flexion 40.2°, extension 23°, rotation ~35–37°. https://pmc.ncbi.nlm.nih.gov/articles/PMC8748567/
- Hip healthy ROM benchmark: flexion 120°, extension 30°, abduction 45°, adduction 35°, internal/external rotation 45°. https://pmc.ncbi.nlm.nih.gov/articles/PMC3589629/
- CDC/NHANES musculoskeletal examination manual: PIP 110–120° flexion, DIP ~80° flexion and thumb IP reference. https://wwwn.cdc.gov/Nchs/data/nhanes3/manuals/phys.pdf
- Hand rehabilitation systematic review: healthy MCP/PIP/DIP ROM ranges. https://pmc.ncbi.nlm.nih.gov/articles/PMC9325203/
- Great toe/lesser toe MTP motion overview: first MTP ~45° flexion / 70° extension, lesser toes ~40° range. https://www.kenhub.com/en/library/anatomy/metatarsophalangeal-mtp-joints
- three-vrm documentation: normalized human bones have identity orientation in rest pose and are the intended cross-model control interface. https://pixiv.github.io/three-vrm/docs/documents/migration-guide-1.0.html
