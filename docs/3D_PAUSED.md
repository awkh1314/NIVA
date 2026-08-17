# 3D / VRM Track — Paused

## Status

`3D / VRM` 当前为 **暂停更新版（Legacy / Paused）**。

仓库中的 `NIVA.vrm`、`AvatarSample_A.vrm` 等文件保留为历史技术验证资产，不作为当前 MVP 的开发主线。

## Why paused

当前 NIVA 的关键问题不是“有没有 3D 身体”，而是：

1. 大模型如何稳定输出角色控制数据；
2. Runtime 如何把控制数据映射到五官、头部、躯干、四肢；
3. 同一角色在不同人格下如何形成明显不同的表演；
4. 系统如何保持轻量、低成本、可在网页和低端设备运行。

在这些问题跑通前继续推进 3D，会提前引入更重的美术、骨骼、绑定、渲染和性能复杂度。

## Current decision

当前主线改为：

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

3D 不删除，但暂停继续更新。

## What remains usable

3D / VRM 资产可以继续作为：

- 历史技术验证；
- 未来 3D 身体渲染器参考；
- 骨骼和姿态概念参考；
- 角色形象方向参考。

但当前不要围绕 VRM 继续新增主线功能。

## Reopen conditions

只有满足以下条件后，才重新评估 3D：

- 2D/2.5D Control Protocol 已经稳定；
- `NivaControlState` 能驱动五官、头、躯干、四肢；
- 对话输出能稳定变成控制数据；
- 角色表演闭环已经成立；
- 3D 可以复用同一套 Control Protocol，而不是另起一套割裂逻辑；
- 性能、部署和多端可达性不会明显变差。

## Rule

后续任何 3D 工作都必须遵守：

> 3D 只能是 NIVA 的一个身体渲染器，不能取代 Control Protocol 主线。
