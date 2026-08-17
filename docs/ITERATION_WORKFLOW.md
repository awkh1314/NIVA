# NIVA Iteration Workflow

## Purpose

NIVA 后续不再靠临时口头修改推进，而是按“可验证迭代”推进。

每一轮都必须先明确：

```text
目标
范围
不做什么
验收标准
回滚方式
```

## Iteration unit

每一轮迭代都对应一个 GitHub Issue。

Issue 标题格式：

```text
Vx.x — <Iteration Name>
```

例如：

```text
V0.7 — Control Protocol MVP
V0.8 — Layered 2D NIVA Character
V0.9 — Persona Performance Mapping
```

## Issue template

每个迭代 Issue 必须包含：

```md
## Goal

本轮要证明什么。

## Background

为什么现在做这个。

## Scope

本轮明确要做的功能。

## Out of Scope

本轮明确不做的东西。

## Architecture

本轮涉及的模块和数据流。

## Acceptance Gate

本轮完成后如何判断成功。

## Rollback

如果失败如何回退。
```

## Current iteration principle

当前阶段的优先级：

1. 先稳定 Control Protocol；
2. 再接精致 2D/2.5D 角色资产；
3. 再做人格到身体控制数据的映射；
4. 最后再考虑语音、记忆、工具、多端；
5. 3D / VRM 暂停更新，只保留为未来可选身体渲染器。

## Workflow

每轮执行顺序：

```text
Create Issue
   ↓
Define Scope
   ↓
Implement
   ↓
Run Test / Manual Validation
   ↓
Update Docs
   ↓
Close Issue or Keep Pending
```

## Rule

不要同时推进多条主线。

每一轮只解决一个主要问题。

如果本轮是 Control Protocol，就不要同时做：

- 3D；
- 语音；
- 摄像头；
- 长期记忆；
- 新角色美术大改；
- 部署重构。

## Current next issue

下一轮建议创建：

```text
V0.7 — Control Protocol MVP
```

目标：

```text
从 text/emotion/motion 升级到 text/control，让 NIVA 能被结构化身体数据驱动。
```
