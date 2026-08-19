# NIVA V0.81 · Anatomical Collision Guard

## 目标

NIVA 的人体 ROM 限制只能保证“单个关节角度合法”，不能保证多个合法关节组合后不会互相穿透。

V0.81 在 ROM / 角速度 / 角加速度限制之外增加运行时人体自碰撞层：

```text
随机 / Control Protocol 目标
        ↓
Human ROM Hard Clamp
        ↓
角速度 + 角加速度限制
        ↓
VRM normalized bones
        ↓
Anatomical Collision Guard
        ↓
安全：保存为最近安全帧
碰撞：回滚相关运动链 + 拒绝该组合 + 重新选目标
        ↓
Render
```

核心原则：**不永久缩小合法 ROM；拒绝的是会穿模的组合姿态。**

## 碰撞代理

不做昂贵的 Mesh-vs-Mesh 三角形实时碰撞。人体使用简化的 Sphere / Capsule 代理：

- 躯干：hips → upperChest Capsule
- 头：head Sphere
- 左右上臂：upperArm → lowerArm Capsule
- 左右前臂：lowerArm → hand Capsule
- 左右手：hand Sphere
- 左右大腿：upperLeg → lowerLeg Capsule
- 左右小腿：lowerLeg → foot Capsule

碰撞体尺寸按当前模型全身高度比例生成，因此不会写死为某个绝对米制尺寸。

## 中立姿态自适应校准

模型载入后先回到 NIVA 安全中立姿态，再测量所有碰撞代理的基线间距。

每一组碰撞阈值必须位于中立姿态间距以内，所以：

- 中立姿态本身不会被误报；
- 手自然垂在大腿附近不会因为固定半径过大而被当成穿模；
- 真正进一步侵入时才会触发防护。

## 当前检查的 19 组关键关系

### 手臂 ↔ 躯干 / 头

1. left hand ↔ torso
2. right hand ↔ torso
3. left forearm ↔ torso
4. right forearm ↔ torso
5. left hand ↔ head
6. right hand ↔ head
7. left forearm ↔ head
8. right forearm ↔ head

### 左右手臂互穿

9. left forearm ↔ right forearm
10. left forearm ↔ right upper arm
11. right forearm ↔ left upper arm

### 双腿交叉互穿

12. left thigh ↔ right thigh
13. left shin ↔ right shin
14. left thigh ↔ right shin
15. right thigh ↔ left shin

### 手 ↔ 大腿

16. left hand ↔ left thigh
17. left hand ↔ right thigh
18. right hand ↔ right thigh
19. right hand ↔ left thigh

## 回滚策略

每个无碰撞帧都保存为 `lastSafePose`。

如果检测到碰撞：

1. 找到导致该碰撞的运动链；
2. 只将相关骨骼回滚到 `lastSafePose`；
3. 清零这些骨骼的瞬时角速度，避免继续冲入碰撞体；
4. 发出 `niva:collision` 事件；
5. Random Driver 只为相关运动链重新抽目标；
6. 其他身体部位继续运动，不重置全身。

例如左手穿胸时，主要回滚 / 重抽：

```text
leftUpperArm
leftLowerArm
leftHand
```

而不是重置头、躯干、双腿和右臂。

## 与 VRM SpringBone Collider 的分工

Anatomical Collision Guard：

- 手穿胸
- 前臂穿头
- 左右手臂互穿
- 双腿互穿
- 手穿大腿
- 其他 Humanoid 骨骼导致的身体自穿透

VRM SpringBone / Collider：

- 头发
- 裙摆
- 飘带
- 饰品
- 其他二级物理部件

两者必须同时存在。SpringBone Collider 不能代替人体骨骼自碰撞层；人体 Capsule/Sphere 也不能完全代替服装和头发的物理碰撞。

## 公开运行时接口

```js
NIVA3D.collision
// {
//   enabled,
//   blocked,
//   lastCollisions
// }

NIVA3D.setCollisionGuard(false);
NIVA3D.setCollisionGuard(true);
NIVA3D.recalibrateCollisionGuard();
```

发生阻挡时：

```js
window.addEventListener('niva:collision', (event) => {
  console.log(event.detail.collisions);
  console.log(event.detail.bones);
});
```

## 当前边界

V0.81 是实时工程碰撞防护，不是完整软体 / 布料仿真。

仍可能需要后续针对当前唯一 `NIVA.vrm` 做：

- 个别碰撞代理半径视觉校准；
- 胸部 / 骨盆由单 Capsule 升级为多 Capsule；
- 手掌 / 手指更精细的代理；
- 脚与地面的接触约束；
- 自定义衣物 collider；
- 快速动作的 swept collision / continuous collision detection。

当前优先目标是：在网页实时运行成本很低的前提下，显著减少全 ROM 随机运动产生的明显人体穿模。
