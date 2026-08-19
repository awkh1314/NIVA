# NIVA · V0.83 Desktop Digital Life

NIVA 现在只保留一条技术主线：**唯一 `NIVA.vrm` → 安全姿态规划 → 语音/文本输入 → DeepSeek 稀疏编排 → 情绪、语音、动作同步 → Windows 桌面数字生命。**

## 当前版本

V0.83 — Constraint-based Safe Pose Generator + Collision-free Path Planner

关键变化：删除旧 2D 主线、Control Protocol 调试页和旧随机运动驱动；`NIVA.vrm` 仍是仓库唯一 VRM；54 个 Humanoid bones 继续受人体 ROM、最大角速度、最大角加速度约束；动作不再先执行再回滚，而是先在不可见状态计算候选姿态与整段运动轨迹；终点或过渡路径任意采样点出现人体自碰撞，候选动作直接废弃并重新规划；预计算常用 gesture 的安全姿态库，DeepSeek 只选择高层动作，不直接操作骨骼角度；运行中的回答不可被新输入瞬间打断，新输入排队并从上一段动作末端自然衔接；Windows 桌面模式默认只显示模型，双击模型打开/收起界面，并自动把窗口限制在当前显示器可见范围。

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

输入：默认语音入口（WebView 支持 SpeechRecognition 时使用），文字始终可用。Desktop 首次运行提示输入 DeepSeek API Key；Key 只在当前运行会话保留。不接 API 可使用打招呼、思考、庆祝、安慰、说明等体验预设。

情感语音默认目标为 **Qwen3-TTS Serena**。仓库附带 `tools/voice/` 本地服务脚本；首次启动会下载 Qwen3-TTS 0.6B CustomVoice（约 2.5GB）。NIVA 检测到本地服务后使用 Serena + 情绪指令；服务不可用时自动回退系统语音。

开发：
```bash
npm install
npm test
npm run dev
npm run desktop
```

GitHub Actions：`Deploy NIVA Web Preview` 测试后发布 Pages；`Build NIVA Windows EXE` 在 Windows runner 构建 `NIVA.exe`、上传 `NIVA-Windows-x64.zip` 并更新 `v0.83-latest` prerelease。
