# 3D / VRM Track — Paused

## Status

`3D / VRM` 当前为 **暂停功能迭代版（Paused）**。

当前产品先完成 2D/2.5D 的 0→1，但未来最终身体形态仍计划升级到 3D。

## 唯一模型规则

主线仓库只允许存在一个正式 VRM 模型：

```text
NIVA.vrm
```

该文件就是用户上传的 `自创形象.vrm` 原始模型内容，仅统一了仓库文件名。

已删除：

- `AvatarSample_A.vrm`
- 旧版 `NIVA.vrm`
- 其他示例 / 占位 VRM

后续代码不得引用第二个 VRM 文件。需要进行 3D 技术实验时，优先围绕 `NIVA.vrm` 验证；如确需测试其他模型，应放在独立实验分支，不进入主线。

## Why paused

当前 NIVA 的关键问题不是“有没有 3D 身体”，而是：

1. 如何让 2D/2.5D 动作具有连续、自然、接近 3D 的运动感；
2. 大模型如何稳定输出角色控制数据；
3. Runtime 如何把控制数据映射到五官、头部、躯干、四肢；
4. 同一角色在不同状态下如何形成自然且连续的表演；
5. 系统如何保持轻量、低成本、可在网页和低端设备运行。

在这些问题跑通前继续推进完整 3D，会提前引入更重的美术、骨骼、绑定、渲染和性能复杂度。

## Current decision

当前主线：

```text
LLM / Manual Control Panel
        ↓
NIVA Control Data
        ↓
Character Controller
        ↓
2D/2.5D Motion Runtime
        ↓
NIVA Body
```

未来 3D：

```text
同一套 NIVA Control Data
        ↓
3D Character Controller
        ↓
NIVA.vrm
```

因此 2D 阶段不是一次性原型，而是在提前建设未来 3D 也能复用的行为与控制系统。

## Reopen conditions

只有满足以下条件后，才重新启动完整 3D 迭代：

- 2D/2.5D Control Protocol 稳定；
- 五官、头、躯干、四肢可被连续参数驱动；
- 动作具备插值、惯性、前摇、回弹和部件延迟；
- 对话输出能稳定转成控制数据；
- 角色表演闭环成立；
- 3D 可以直接复用同一套 Control Protocol；
- 性能、部署和多端可达性不会明显恶化。

## Rule

> 3D 是 NIVA 最终身体渲染方向，但不能在 2D 控制系统成熟之前重新成为开发主线。

> 主线唯一允许的 VRM 模型是 `NIVA.vrm`。