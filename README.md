# NIVA

NIVA is a lightweight, local-first VRM digital-life runtime.

Current baseline: **NIVA 0.90 Free Life**.

## Free Life

The default experience is designed to work without an API key or paid cloud service:

- Full-screen VRM stage using the canonical `NIVA.vrm`
- Free local demo conversation
- System speech fallback
- NIVA dialogue bubbles on the left and user dialogue bubbles on the right
- Manual normalized-humanoid body controls
- Facial-expression presets
- Breathing, heartbeat, blinking and gaze
- Mouse-follow gaze and ambient Natural Activity Director
- Local authored walk / run / wave / think / reach motion clips
- Stage, lighting and camera controls
- Brain / Voice / Motion integrations isolated under `升级 / 接入`

The previous V0.85 Performance Director UI is no longer the active web runtime.

## Development

```bash
npm install
npm test
npm run dev
```

## Build

```bash
npm run build
```

GitHub Pages deploys automatically from `main`.
