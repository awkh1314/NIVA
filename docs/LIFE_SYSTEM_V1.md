# NIVA 真实生命系统 V2 · Physics Body

## 目标
把 NIVA 从“播放骨骼动作的 VRM”升级为由连续生命状态驱动、受地面接触与身体约束限制的数字身体。

核心链路：

`activity -> load -> fatigue/energy -> heart/breath -> motion intent -> AnimationClip -> Rapier character physics -> foot/hand IK -> final VRM pose`

## 当前物理底座
- 物理引擎：`@dimforge/rapier3d-compat 0.20.0`，Apache-2.0。
- 角色主体：position-based kinematic capsule。
- 舞台：Rapier cylinder ground collider，与舞台半径同步。
- 移动：Rapier Kinematic Character Controller 计算可执行位移，而不是直接修改 VRM 根节点穿过环境。
- 地面：向左右脚下方进行 Rapier ray cast，取得真实地面命中点和法线。
- 足部：左右脚独立 stance anchor；支撑脚进入 stance 时锁定世界空间目标。
- 腿部：动画先给出动作趋势，IK 在动画之后把腿链修正到脚底接触目标。
- 恢复姿态：疲劳恢复时双脚锁地，同时双手使用手臂 IK 接近左右膝盖。

## Walk / Run
Walk 与 Run 仍由 AnimationClip 提供步态节奏，但角色世界位移交给 Rapier Character Controller。

每只脚有独立支撑状态：
- `STANCE`：脚锁在世界空间地面接触点。
- `SWING`：脚由动画自由摆动。
- Walk 带短暂双脚支撑区。
- Run 使用更短支撑期，为腾空阶段留出空间。

这样做的目标是解决“腿在摆、身体在滑”的问题：角色根节点真实移动，而支撑脚不会跟着根节点一起滑走。

## 蹲下
V1 的“固定腿角度 + 双脚平均根节点补偿”已经停用为正式方案。

V2：
1. 进入蹲下时左右脚分别记录自己的地面锚点。
2. 物理身体保持站在舞台碰撞体上。
3. 角色视觉根节点平滑降低到目标骨盆高度。
4. 腿部只保留少量弯曲种子姿态，不再用大角度硬编码完成整个蹲姿。
5. 左右腿 IK 独立把脚拉回各自锚点，因此骨盆降低会自然迫使髋、膝参与弯曲。
6. 退出蹲下时根节点和腿部平滑恢复。

控制参数：
- `crouchDepth`：蹲下深度，默认约角色身高的 19%。
- `footIKStrength`：脚底 IK 强度，默认 0.9。

## 极限疲劳恢复
跑步会持续提高疲劳、心率和呼吸。

疲劳达到极限后：
1. 停止正常跑步动作。
2. 双脚锁地。
3. 骨盆下降、上半身前倾。
4. 左右手分别以 IK 靠近左右膝盖，而不是只用固定肩肘角度猜位置。
5. 呼吸幅度和频率提高。
6. 恢复计时结束后，如果用户仍保持“跑步”意图，再恢复 Run。

## Rapier Character Controller
当前控制器启用：
- ground snapping
- autostep
- slope climb limit
- slope slide limit
- capsule collision

Rapier 只负责角色级碰撞和运动约束，不把 54 根 VRM 骨骼全部转换成动态刚体。这样避免角色变成不可控 ragdoll。

## IK 层
当前是轻量实时 IK：
- 双腿：UpperLeg -> LowerLeg -> Foot
- 双臂恢复接触：UpperArm -> LowerArm -> Hand
- AnimationClip 先运行，IK 后修正。
- 每帧限制单次旋转修正量，避免关节瞬时翻转。

后续 V3 应加入：
- knee / elbow pole vector 强约束
- heel / sole / toe 三点足底接触
- Foot orientation 对齐地面法线
- 预测式 foot placement
- 台阶与斜坡完整测试
- 手掌接触法线和手指接触姿势
- center-of-mass / support polygon 平衡判定

## 生命状态
身体状态仍由连续模拟产生，不随机伪造疲劳：
- 跑步：快速增加疲劳。
- 走路：低速增加负荷。
- 静止：恢复。
- 疲劳越高：动作速度降低并出现受限步频波动。
- 心率与呼吸根据活动负荷和疲劳平滑变化。
- 疲劳会影响眨眼、呼吸幅度、姿态和恢复需求。

## 控制优先级
`manual override > speaking > recovery/major action > locomotion > ambient life`

语言模型只能选择高层意图，例如 `walk/run/crouch/recover`，不能直接输出 Rapier 坐标、关节 quaternion、IK target 或物理参数。

## Free 版原则
Physics Body 属于本地免费基础能力：
- 不需要 API Key。
- 不依赖云服务。
- Rapier 在浏览器本地 WASM 运行。
- VRM、生命状态、物理、IK 均在客户端完成。
