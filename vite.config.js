import { defineConfig } from 'vite';

const modelRuntimeStability = {
  name: 'niva-model-runtime-stability',
  enforce: 'pre',
  transform(code, id) {
    const normalized = id.replace(/\\/g, '/');
    if (!normalized.endsWith('/src/main.js')) return null;

    let next = code.replace(
      'VRMUtils.removeUnnecessaryVertices(gltf.scene); VRMUtils.removeUnnecessaryJoints(gltf.scene);',
      'VRMUtils.removeUnnecessaryVertices(vrm.scene); VRMUtils.combineSkeletons(vrm.scene); vrm.scene.traverse((o)=>{ o.frustumCulled=false; });',
    );

    next = next.replace(
      "scene.add(vrm.scene); centerModel(); rememberBones();",
      "scene.add(vrm.scene); vrm.scene.traverse((o)=>{ o.frustumCulled=false; }); centerModel(); rememberBones();",
    );

    return next === code ? null : { code: next, map: null };
  },
};

export default defineConfig({
  base: './',
  plugins: [modelRuntimeStability],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
