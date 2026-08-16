# NIVA · 数字生命

NIVA 是一个 Windows 桌面数字生命 MVP。当前阶段的目标不是堆功能或追求动画质量，而是让陌生用户安装后可以直接使用、长期挂在桌面，并且在语音、模型或网络不可用时仍能正常退化运行。

## 当前产品形态

- Windows 桌面应用：Tauri 2 + Vite + TypeScript
- 3D 角色：Three.js + `@pixiv/three-vrm`
- 默认状态：自然站立，持续呼吸、视线、重心与状态微动
- 桌面交互：点击反馈、右键拖动窗口、双击打开设置、文字输入
- 语音：WebView Speech Recognition 输入 + Windows/WebView Speech Synthesis 输出；不可用时自动降级到文字
- AI：DeepSeek 接口已预留；未配置或请求失败时可继续使用本地行为
- 记忆：近期对话 + 有限长期记忆，均可清除
- 模型：支持导入并持久化本地 VRM
- Windows 安装：GitHub Actions 构建 NSIS 安装包
- 桌面托盘：支持显示/隐藏 NIVA

## MVP 原则

当前冻结新增能力，优先解决：

1. 首次安装和第一次互动能否独立完成；
2. 长时间挂桌面是否稳定、不过度打扰；
3. 麦克风、语音、模型、网络失败时是否能继续使用；
4. Windows 安装、启动、窗口和托盘行为是否符合普通软件预期；
5. 发布给测试用户后是否能快速定位问题并迭代。

不在当前 MVP 范围：高级 Agent、插件生态、屏幕理解、动作商城、复杂长期记忆、专业动画质量与完整商业后端。

## 目录

```text
apps/stage-web/
├─ src/main-v2.ts                 # Three.js / VRM 主运行时
├─ src/avatar/RawMotionController.ts
├─ src/desktop.ts                 # Windows 桌面桥、语音输入、托盘
├─ src/desktop-bootstrap.ts       # 设置、对话队列、模型导入、降级逻辑
├─ src/desktop-product.ts         # 首次使用与桌面陪伴产品层
├─ src/voice-output.ts            # 语音输出 provider
└─ src-tauri/                     # Tauri / Rust / NSIS
```

## 本地运行

```bash
cd apps/stage-web
npm install
npm run tauri dev
```

构建 Windows 安装包：

```bash
cd apps/stage-web
npm run tauri build -- --bundles nsis
```

## 产品验收

MVP 发布门槛记录在 [`docs/MVP-RELEASE-GATE.md`](docs/MVP-RELEASE-GATE.md)。

## License

保留作者版权。未经授权不得将项目源码、角色资产或产品整体用于二次分发或商业化。
