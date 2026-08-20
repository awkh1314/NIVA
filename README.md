# NIVA · V0.85 Digital Life Runtime

NIVA 当前唯一技术主线：**唯一 `NIVA.vrm` → Safe Pose / Collision-free Path Planner → Brain Interface → Performance Director → Kokoro 声音、口形、表情和动作同步 → Windows 桌面数字生命。**

## V0.85 核心

### Brain Interface
默认 Brain Provider 为 DeepSeek；桌面控制面板同时提供 OpenAI 与自定义 OpenAI-compatible Endpoint。模型不允许直接输出骨骼角度、坐标或逐帧动画，只能输出统一稀疏协议，例如：

```json
{"text":"我来演示一遍。","emotion":"neutral","performance":"tai_chi_beginner","voice":["gentle",0.4]}
```

普通回复只输出确实需要的 gesture：

```json
{"text":"你好。","emotion":"happy","gestures":[["wave","r",0.65]],"voice":["bright",0.5]}
```

### Performance Director
V0.85 的完整表演不再要求 LLM 生成时间轴。Brain 只选择本地 performance，Director 展开为 cue 队列；每个 cue 的声音、表情和动作同时开始，当前声音与动作完成后才进入下一 cue，并从当前安全姿态继续规划。

内置体验：
- `welcome_home`：欢迎回归，两段连续互动。
- `tai_chi_beginner`：起式 → 抱球 → 云手 → 推掌 → 收式；每做一式同时说动作名。
- `thinking_demo`：托腮 → 左右观察 → 点头回答。

太极新增 `taiChiRaise / taiChiBall / taiChiCloud / taiChiPush / taiChiClose` 五个专用动作原语。它们和普通 gesture 一样，必须通过 Safe Pose Bank、人体联动约束、终点碰撞检查和整条路径预检后才能执行。

### 声音与口形
固定 `Kokoro v1.1-zh INT8 / zf_001`。Windows 构建工作流在编译阶段下载并校验 q8 模型、tokenizer 和 `zf_001`，再打进桌面构建，因此成品 TTS 可离线运行。网页体验为了避免 Pages 体积膨胀，首次发声仍从模型源按需加载。

Kokoro 异常时不再切换 Windows 系统声线，而是显示语音模块异常并静音。口形由 Kokoro 实际 PCM 音频包络驱动 `aa / ih / ou`，不再使用固定随机张嘴。

### 舞台与交互
Canvas 始终占满舞台；控制面板改为悬浮层，不参与模型布局。每次模型加载、窗口尺寸变化和桌面面板展开/收起都会重新按模型包围盒校准相机，使角色保持舞台中心。双击实际 VRM Mesh 打开/收起控制面板。

### 输入
文字输入已经接入 Brain Interface。语音转文字接口继续保留；现有 Vosk / WebView SpeechRecognition 可作为输入来源，但 ASR 不是 V0.85 的主要优化目标。

## 安全执行链

```text
Voice/Text Input
→ Brain Provider
→ NIVA Brain JSON
→ Performance Director / Sparse Gestures
→ Safe Pose Bank
→ Coupled Joint Constraints
→ Endpoint Collision Test
→ Swept Path Test
→ Speed / Acceleration Planner
→ Kokoro + Audio-driven Lip Sync + VRM Motion
```

## 开发

```bash
npm install
npm test
npm run dev
npm run desktop
```

GitHub Actions：
- `Deploy NIVA Web Preview`：测试后发布网页体验。
- `Build NIVA Windows EXE`：测试 → vendor Kokoro INT8/zf_001 → Tauri 编译 → `NIVA-Windows-x64.zip` → `v0.85-latest` Release。

> `prone_chat` / 趴地撑头与小腿摆动尚未伪装成可用动作。它需要 Ground Contact Solver 与非直立姿态碰撞标定后再开放，否则会重新引入穿地/穿模。
