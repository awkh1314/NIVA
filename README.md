# NIVA · 数字生命精灵

> A digital life spirit —— 一个会在屏幕上陪你呼吸、眨眼、说话的数字生命。

NIVA 是一个「数字生命精灵」项目：目标是打造一个**有形象、有情绪、能对话、能记住你**的数字生命体。这个仓库记录它的可视化演进（v2.0 → v3.0），并作为后续接入「大脑」（LLM）、记忆与多端触达的**工程起点**。

## 演进路线（本仓库历史）

| 版本 | 代号 | 说明 |
| --- | --- | --- |
| **v2.0** | Companion Sprite MVP | 单张身体底图 + 多表情帧（neutral / smile / shy / thinking）切换的离线原型 |
| **v3.0** | Rigged Web MVP | 独立透明分层形象（body / head / hair / arms / holographic skirt）+ SVG 面部绑定（眨眼、嘴形、腮红、眉毛）+ 环境动效（呼吸、发丝/裙摆摆动、手臂微动） |

> **打开方式**：浏览器直接打开 `index.html`（自包含、离线可用）；`index.dev.html` 引用 `assets/` 目录，便于二次开发。

## 项目结构

```
niva-digital-spirit/
├─ index.html            # v3.0 自包含运行版（离线）
├─ index.dev.html        # v3.0 开发版（引用 assets/）
├─ assets/               # 分层 PNG 素材（body / head / hair / arms / skirt）
├─ recomposite.png       # 合成参考图
├─ README.md             # 本文件
├─ ROADMAP.md            # 数字生命精灵演进路线
└─ docs/
   └─ ARCHITECTURE.md    # 形象分层 + 控制契约说明
```

## 运行

纯静态、零依赖、零构建。任选其一：

- 双击 `index.html`；
- 或本地起静态服务：`python -m http.server` 后访问 `http://localhost:8000`。

## 控制契约（v3.0）

```js
NIVA.play({ text: "你好呀", emotion: "happy", motion: "wave" });
```

让 NIVA 说话并切换表情 / 动作 —— 这是后续由外部「大脑」驱动它的统一接口。

## 下一步：给 NIVA 装上「大脑」

当前 v3.0 是纯前端、离线的「躯壳」。项目启动阶段的目标是让 NIVA 真正「活」起来：

1. 接入 LLM（DeepSeek）作为对话与情绪理解的大脑；
2. 持久化记忆与人格设定，让 NIVA 认识你、记住你；
3. 语音（TTS / ASR）让交互更自然；
4. 多端触达（Web + 企业微信等），让 NIVA 无处不在；
5. 本地优先 / 隐私优先的运行时。

详见 [ROADMAP.md](ROADMAP.md)。

## License

保留作者版权。商用或二次开发请先联系作者。
