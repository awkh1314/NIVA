from pathlib import Path

# Patch IK configuration so the existing Foot IK switch cannot disable unrelated
# upper-body action IK.
p = Path('src/runtime/ik/niva-ik-system.mjs')
s = p.read_text(encoding='utf-8')
repls = [
("    this.enabled = true;\n    this.strength = 0.9;", "    this.enabled = true;\n    this.footEnabled = true;\n    this.actionEnabled = true;\n    this.strength = 0.9;"),
("  configure({ enabled = true, strength = 0.9 } = {}) {\n    this.enabled = enabled;\n    this.strength = clamp(strength, 0, 1);\n  }", "  configure({ enabled = true, footEnabled = true, actionEnabled = true, strength = 0.9 } = {}) {\n    this.enabled = enabled;\n    this.footEnabled = footEnabled;\n    this.actionEnabled = actionEnabled;\n    this.strength = clamp(strength, 0, 1);\n  }"),
("    if (plan.footAnchors) {", "    if (this.footEnabled && plan.footAnchors) {"),
("    if (action === 'walk' || action === 'run') this.solveLocomotionArms(action, phase);\n    if (action === 'wave') this.solveWavePose(phase);\n    if (action === 'crouch') this.solveCrouchHandsToHead(0.88 * crouchAmount);\n    if (action === 'recovery') this.solveHandsToKnees(0.82);", "    if (this.actionEnabled) {\n      if (action === 'walk' || action === 'run') this.solveLocomotionArms(action, phase);\n      if (action === 'wave') this.solveWavePose(phase);\n      if (action === 'crouch') this.solveCrouchHandsToHead(0.88 * crouchAmount);\n      if (action === 'recovery') this.solveHandsToKnees(0.82);\n    }"),
("    return { owner: 'normalized humanoid limb IK', solver: 'isolated-ccd-v1', lastAction: this.lastAction };", "    return { owner: 'normalized humanoid limb IK', solver: 'isolated-ccd-v1', footEnabled: this.footEnabled, actionEnabled: this.actionEnabled, lastAction: this.lastAction };")
]
for old,new in repls:
    if old not in s:
        raise SystemExit('PATCH_MISSING:ik-boundary')
    s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

# Remove the legacy LifeSim foot-anchor ownership and configure IK correctly.
p = Path('src/main.js')
s = p.read_text(encoding='utf-8')
old = "  paceNoise:1,nextPaceNoise:0,lastUi:0,lastPreview:'',stageTarget:new THREE.Vector3(),footAnchor:null,groundMode:'',"
new = "  paceNoise:1,nextPaceNoise:0,lastUi:0,lastPreview:'',stageTarget:new THREE.Vector3(),groundMode:'',"
if old not in s: raise SystemExit('PATCH_MISSING:life-foot-state')
s=s.replace(old,new,1)
old = "  captureFootAnchor(){\n    if(!vrm)return;vrm.scene.updateMatrixWorld(true);const ps=['leftFoot','rightFoot'].map(getBone).filter(Boolean).map(b=>b.getWorldPosition(new THREE.Vector3()));if(!ps.length)return;\n    this.footAnchor=ps.reduce((s,p)=>s.add(p),new THREE.Vector3()).multiplyScalar(1/ps.length);\n  },\n"
if old not in s: raise SystemExit('PATCH_MISSING:life-foot-method')
s=s.replace(old,'',1)
s=s.replace("  if(name==='crouch') lifeSim.captureFootAnchor();\n",'',1)
s=s.replace("this.recovering=true;this.recoveryUntil=now+14000;this.captureFootAnchor();life.deepBreathUntil=now+15000;","this.recovering=true;this.recoveryUntil=now+14000;life.deepBreathUntil=now+15000;",1)
s=s.replace("this.recovering=false;this.footAnchor=null;if(persistentPreview==='run')","this.recovering=false;if(persistentPreview==='run')",1)
old = "ikSystem.configure({enabled:settings.footIKEnabled,strength:settings.footIKStrength});ikSystem.solve(contactPlan);"
new = "ikSystem.configure({enabled:true,footEnabled:settings.footIKEnabled,actionEnabled:true,strength:settings.footIKStrength});ikSystem.solve(contactPlan);"
if old not in s: raise SystemExit('PATCH_MISSING:ik-config-main')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

Path(__file__).unlink()
