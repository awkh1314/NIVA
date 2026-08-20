# NIVA Roadmap
唯一技术路线：3D Desktop Digital Life。

## V0.83 — 当前
- [x] 唯一 `NIVA.vrm`
- [x] 54 骨骼 ROM / 速度 / 加速度限制
- [x] Coupled Joint Constraints
- [x] Safe Pose Bank 预计算
- [x] 终点碰撞预检
- [x] 整条运动路径预检
- [x] quintic 平滑过渡
- [x] 动作队列，不允许新输入瞬移打断
- [x] DeepSeek 稀疏 JSON 编排协议
- [x] 体验预设
- [x] Kokoro v1.1-zh INT8 / zf_001 默认轻量语音
- [x] NIVA Emotion Prosody：style/intensity → speed/gain
- [x] Vosk 中文离线 ASR + 系统识别回退
- [x] 系统 TTS 回退
- [x] Tauri Windows 桌面壳
- [x] 默认模型窗口 / 双击展开界面 / 屏幕边界自适应
- [x] NIVA 内部仅模型绘制像素响应点击/拖拽/双击
- [x] GitHub Actions Windows EXE 构建定义
- [x] Tauri Windows icon 资源

## V0.84
- [ ] 使用真实音频能量做口型
- [ ] 对唯一 NIVA 模型做 mesh-aware 碰撞体离线标定
- [ ] gesture bank 扩展到坐、蹲、转身、递物、拥抱等复杂行为
- [ ] Windows HWND 级透明像素点击穿透，让透明区域直接点到底层应用
- [ ] 将 Vosk ASR 也改为无需 Python 的原生/ONNX 内置方案
- [ ] Kokoro 模型首次下载进度、缓存管理和离线完整包

## V0.9+
- [ ] 长期记忆
- [ ] 本地/云端大模型可切换
- [ ] 工具调用与桌面自动化
- [ ] 多屏、多角色、多设备同步
