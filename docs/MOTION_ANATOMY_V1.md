# NIVA Full-Body Motion Anatomy V1

目标：任何动作都不再以“某几根骨骼转多少度”作为第一层定义，而是先拆成身体区域、支撑关系、根节点运动、动作阶段和覆盖优先级，再由 Animation / Physics / IK / Facing / Life 各自执行自己唯一拥有的部分。

## 1. 身体拆分

统一拆成 13 个区域：

- root：VRM scene 世界位置；不属于 humanoid 骨骼。
- pelvis：hips。
- torso：spine / chest / upperChest。
- head：neck / head / eyes / jaw。
- leftArm / rightArm：shoulder / upperArm / lowerArm。
- leftHand / rightHand：hand + 15 根手指骨骼。
- leftLeg / rightLeg：upperLeg / lowerLeg / foot / toes。
- face：VRM expressions。
- gaze：VRM LookAt。
- voice：Speech Provider / playback。

## 2. 三层动作

### Continuous Lane
持续动作，一次只能有一个：idle / walk / run / crouch / thinkLoop / recovery。

它决定基础全身姿态、支撑脚、循环节奏和是否发生世界位移。

### Overlay Lane
短动作，可覆盖 Continuous 的局部区域：wave / nod / reach / weight / speechGesture。

例如：走路 + 挥手时，walk 继续拥有双腿、骨盆、左臂；wave 只临时取得右臂和右手。禁止为了挥手停止整套走路。

### Life/Additive Lane
呼吸、心跳、眨眼、注视、疲劳、细微重心、手指松弛。只做小幅 additive，不得反向夺取 Root、脚底支撑或主动作肢体。

Manual Control 优先级最高，但只覆盖用户正在手动控制的区域。

优先级：Manual > Overlay > Continuous > Life/Additive。

## 3. 系统唯一写权限

- CharacterFrame：唯一方向真相，+X 右、+Y 上、+Z 前。
- FacingController：唯一 Root yaw 写入者。
- Physics：唯一 Root 世界平移/地面/碰撞写入者。
- Animation：基础动作 Clip。
- IK：动画之后修正腿、脚、手臂终点；禁止 Root transform。
- Life：仅 additive。
- Gaze / Face / Voice：独立输出，不与骨骼主动作混写。

## 4. 标准动作拆解

### Walk
Root：Physics 前进；Facing 对齐移动方向。
Lower body：左右脚交替 contact / push / transfer。
Pelvis/Torso：轻微垂直起伏与反向旋转。
Arms：与对侧腿反向摆动。
Hands：自然弯曲，禁止持续张开。
Head/Gaze：默认看用户，可有轻微稳定补偿。
Foot IK：只在 stance 脚接触阶段修正。

### Run
Walk 的高速版本，但不是简单加速：必须包含更短接触期、flight phase、更大髋屈伸、更明显对侧摆臂、轻微前倾和疲劳反馈。

### Crouch
双脚持续 planted。
膝盖向人物前方弯曲，臀部后移，躯干适度前倾；Root 整体同步下移保持脚底贴地。
脚跟必须保持接地，禁止踮脚。
当前设计要求双手抱头；手臂 IK 只负责把手放到头侧，不允许反推 Root yaw。

### Wave
Root、双腿、骨盆保持原 Continuous 状态。
只覆盖右臂 + 右手；进入、挥动、退出三个阶段。
必须经过 torso clearance / swept-path collision 检查。

### Think
下半身保持当前 Continuous 支撑；右臂和右手靠近脸部，头部轻微偏转。若正在 walk/run，则应优先使用 speech/gesture overlay 版本，而不是替换整套 locomotion。

### Recovery
跑步过久触发：双脚 planted，躯干前倾，双手扶膝，呼吸幅度和频率升高；恢复后逐步回到 idle 或原持续动作。

## 5. 以后新增动作的固定流程

1. 先定义动作属于 continuous 还是 overlay。
2. 明确 claims：它到底拥有哪几个身体区域。
3. 明确 support/contact：哪只脚、手或身体部位接触环境。
4. 明确 Root 行为：translation / yaw / vertical posture 分别由谁处理。
5. 列出 phases。
6. 列出 invariants，例如 heels-down、no-root-spin、no-torso-intersection。
7. 再选择标准 VRMA/AnimationClip；只有小幅补偿才写 procedural additive。
8. Physics 生成 contact plan；IK 只修终点。
9. 用前/侧/后视角验收，再进入 Director/语音组合。

## 6. 当前第一阶段

仓库已加入：

- `body-map.mjs`：身体区域唯一映射。
- `motion-specs.mjs`：Walk / Run / Crouch / Think / Recovery / Wave 等结构化定义。
- `full-body-motion-coordinator.mjs`：Continuous / Overlay / Manual / Life 的区域所有权仲裁。
- `motion-anatomy.test.mjs`：防止未来再次出现模块互抢身体控制权。

下一阶段应把现有 `main.js` 中直接 `playClip()` 的调用逐步迁移到 Coordinator，让页面运行时也严格遵守上述 ownership，而不只是文档约束。
