# NIVA Roadmap
唯一技术路线：3D Desktop Digital Life。

## V0.99.0 — 当前稳定基线
- [x] 唯一 `NIVA.vrm`
- [x] 54 骨骼 ROM / 速度 / 加速度限制
- [x] Coupled Joint Constraints / Safe Pose / 路径碰撞预检
- [x] Runtime Boundaries V1：Frame / Facing / Physics / IK 职责隔离
- [x] Biomechanics V2：解析式 Two-Bone IK、足底接触、自碰撞代理
- [x] DeepSeek 稀疏 JSON Brain Protocol + Performance Director
- [x] `NIVA.play({ text, emotion, motion })` 公开 Motion Bridge
- [x] `idle` / `wave` / `nod` 基础动作与平滑过渡
- [x] `wave` 驱动肩、上臂、前臂、手、胸与头，不再只有手腕动作
- [x] walk / run / think / reach 等本地动作
- [x] 表情、生命感、注视、眨眼、呼吸与心跳
- [x] Kokoro v1.1-zh INT8 / `zf_001` 桌面离线资源固定 revision + SHA256
- [x] Tauri Windows 桌面壳
- [x] GitHub Pages 自动部署
- [x] Windows EXE 自动构建、Artifact 与 rolling Release
- [x] 自动化回归测试：Runtime / IK / Collision / Planner / Brain / Performance / Voice / Motion Bridge

## 下一阶段 — V1.0
- [ ] 将当前 Web/Free Life 主入口完全切换为统一 Brain → Performance → Voice → Motion runtime，清理旧兼容路径
- [ ] 长期记忆
- [ ] 本地/云端大模型可切换
- [ ] 工具调用与桌面自动化
- [ ] 更复杂的坐、蹲、转身、递物、拥抱与地面姿态
- [ ] Windows HWND 级透明像素点击穿透
- [ ] 多屏、多角色、多设备同步

## 发布门槛
每次发布必须同时满足：
1. `npm test` 全绿；
2. `npm run build` 成功；
3. GitHub Pages deploy 成功；
4. Windows EXE build 成功；
5. Release 中存在 `NIVA-Windows-x64.zip`。
