# NIVA · V0.83 Desktop Digital Life

NIVA 只保留一条技术主线：**唯一 `NIVA.vrm` → 安全姿态规划 → 语音/文本输入 → DeepSeek 稀疏编排 → 情绪、Kokoro 语音、动作同步 → Windows 桌面数字生命。**

## 当前版本

V0.83 — Constraint-based Safe Pose Generator + Collision-free Path Planner

关键变化：旧 2D 主线、Control Protocol 调试页和旧随机运动驱动已经退出主线；`NIVA.vrm` 仍是仓库唯一 VRM；54 个 Humanoid bones 继续受人体 ROM、最大角速度、最大角加速度约束；动作不再先执行再回滚，而是先在不可见状态计算候选姿态与整段运动轨迹；终点或过渡路径任意采样点出现人体自碰撞，候选动作直接废弃并重新规划；预计算常用 gesture 的安全姿态库，DeepSeek 只选择高层动作，不直接操作骨骼角度；运行中的回答不可被新输入瞬间打断，新输入排队并从上一段动作末端自然衔接；Windows 桌面模式默认只显示模型，双击模型打开/收起界面，并自动把窗口限制在当前显示器可见范围。

DeepSeek 只输出一行稀疏 JSON：
```json
{"t":"你好，我是 NIVA。","e":"happy","g":[["wave","r",0.72],["nod","c",0.25]],"v":["bright",0.58]}
```
`t` 回答文本；`e` 情绪；`g` 可省略且最多 4 个高层 gesture，没有必要运动的身体部位完全不输出；`v` 可省略。禁止输出骨骼角度、完整 54 骨骼状态或逐帧时间轴。客户端根据 gesture、人体限制和语音长度完成安全排程。

安全动作链：
```text
DeepSeek / Preset
→ Sparse gesture intent
→ Precomputed Safe Pose Bank
→ Coupled Joint Constraints
→ Endpoint Collision Test
→ Swept Path Test (8–36 samples)
→ Speed / Acceleration Duration Planner
→ Quintic smooth transition
→ NIVA.vrm
```

## 输入

默认入口支持文字和麦克风。离线中文 ASR 仍使用可选 Vosk `vosk-model-small-cn-0.22`；本地 ASR 服务不可用时回退 Windows/WebView SpeechRecognition，文字输入始终可用。`voice/install-and-start.ps1` 现在只负责 Vosk，不再安装任何大型 TTS/PyTorch 环境。

## 默认声音：Kokoro INT8 / zf_001

NIVA 默认 TTS 改为浏览器/WebView 内本地推理：`@uzen/kokoro-js` + `onnx-community/Kokoro-82M-v1.1-zh-ONNX`，固定使用用户选定的中文女声 `zf_001`。使用 `q8` 量化路径；第一次真正发声时下载约 127MB 模型，voice 文件约 522KB，后续由浏览器/WebView 缓存复用。Qwen3-TTS 已从默认运行时删除。

Kokoro 本身不接受复杂情绪 instruction，因此 DeepSeek 仍只输出短参数 `v:[style,intensity]`，本地 `voice-prosody.mjs` 把它映射为语速和增益；最终情绪由 **声音韵律 + VRM 表情 + Safe Pose 动作** 联合呈现。Kokoro 加载或推理失败时自动回退系统 TTS。

开发：
```bash
npm install
npm test
npm run dev
npm run desktop
```

GitHub Actions：`Deploy NIVA Web Preview` 测试后发布 Pages；`Build NIVA Windows EXE` 在 Windows runner 构建 `NIVA.exe`、上传 `NIVA-Windows-x64.zip` 并更新 `v0.83-latest` prerelease。Windows Tauri 必需图标位于 `src-tauri/icons/icon.ico`。

> 当前“仅模型可点”已经做到 NIVA 应用内部的模型像素命中；Windows 对透明像素直接穿透到底层其他应用的 HWND 级命中测试尚未实现。
