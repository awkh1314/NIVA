from pathlib import Path
import json

def rep(text,old,new,label):
    if old not in text:
        raise RuntimeError(f'missing anchor: {label}')
    return text.replace(old,new,1)

# Smooth deep-breath preset instead of boolean amplitude/shape jumps.
p=Path('src/runtime/physics/biomechanics-life.mjs');s=p.read_text(encoding='utf-8')
s=rep(s,"""  constructor() {
    this.breathPhase = 0;
    this.heartPhase = 0;
    this.breathEnvelope = 0;
  }

  reset() {
    this.breathPhase = 0;
    this.heartPhase = 0;
    this.breathEnvelope = 0;
  }""","""  constructor() {
    this.breathPhase = 0;
    this.heartPhase = 0;
    this.breathEnvelope = 0;
    this.deepBreathEnvelope = 0;
  }

  reset() {
    this.breathPhase = 0;
    this.heartPhase = 0;
    this.breathEnvelope = 0;
    this.deepBreathEnvelope = 0;
  }""",'physiology envelope state')
s=rep(s,"""    const inhaleFraction = deepBreath ? 0.46 : 0.40;
    const p = this.breathPhase;
    const lungVolume = p < inhaleFraction
      ? smoothstep(p / inhaleFraction)
      : 1 - smoothstep((p - inhaleFraction) / (1 - inhaleFraction));
    const centeredBreath = (lungVolume - 0.45) * (deepBreath ? 1.65 : 1) * this.breathEnvelope;
    const amp = clamp(Number(breathAmplitude) || 0, 0, 1.2) * (1 + clamp(load, 0, 1) * 0.25);""","""    const deepTarget = deepBreath ? 1 : 0;
    const deepRate = deepTarget > this.deepBreathEnvelope ? 2.8 : 1.65;
    this.deepBreathEnvelope += (deepTarget - this.deepBreathEnvelope) * (1 - Math.exp(-h * deepRate));
    const deepMix = clamp(this.deepBreathEnvelope, 0, 1);
    const inhaleFraction = 0.40 + 0.06 * deepMix;
    const p = this.breathPhase;
    const lungVolume = p < inhaleFraction
      ? smoothstep(p / inhaleFraction)
      : 1 - smoothstep((p - inhaleFraction) / (1 - inhaleFraction));
    const centeredBreath = (lungVolume - 0.45) * (1 + 0.65 * deepMix) * this.breathEnvelope;
    const amp = clamp(Number(breathAmplitude) || 0, 0, 1.2) * (1 + clamp(load, 0, 1) * 0.25);""",'smooth deep breath mode')
s=rep(s,"""      shoulderLiftDeg: Math.max(0, centeredBreath) * amp * (deepBreath ? 0.16 : 0.07),
      heartbeatDeg: heartDeg,""","""      shoulderLiftDeg: Math.max(0, centeredBreath) * amp * (0.07 + 0.09 * deepMix),
      deepBreathEnvelope: deepMix,
      heartbeatDeg: heartDeg,""",'deep breath output')
p.write_text(s,encoding='utf-8')

# Main: vital presets may never touch root-affecting bones; preset release is bounded.
p=Path('src/main.js');s=p.read_text(encoding='utf-8')
s=rep(s,"import { RootContinuityGuard } from './runtime/safety/root-continuity-guard.mjs';","import { RootContinuityGuard } from './runtime/safety/root-continuity-guard.mjs';\nimport { PoseContinuityGuard } from './runtime/safety/pose-continuity.mjs';\nimport { lifePresetAllowsBone } from './runtime/safety/life-preset-policy.mjs';",'life continuity imports')
s=rep(s,'let rootContinuityGuard = null;','let rootContinuityGuard = null;\nlet poseContinuityGuard = null;','pose guard variable')
s=rep(s,"rootContinuityGuard=new RootContinuityGuard({modelHeight});rootContinuityGuard.reset(vrm.scene.position); facingController=new FacingController(vrm.scene);","rootContinuityGuard=new RootContinuityGuard({modelHeight});rootContinuityGuard.reset(vrm.scene.position); poseContinuityGuard=new PoseContinuityGuard({lambda:14,maxDegreesPerSecond:220}); facingController=new FacingController(vrm.scene);",'pose guard init')
old_add="""function applyAdditive(name,x=0,y=0,z=0,key='life'){
  if(!vrm)return; const node=getBone(name); if(!node)return; const base=baseQuats.get(name); if(!base)return;
  if(!additiveScratch.has(name)) additiveScratch.set(name,{}); const s=additiveScratch.get(name); s[key]=[x,y,z];
}"""
new_add="""function applyAdditive(name,x=0,y=0,z=0,key='life'){
  if(!vrm||!lifePresetAllowsBone(key,name))return; const node=getBone(name); if(!node)return; const base=baseQuats.get(name); if(!base)return;
  if(!additiveScratch.has(name)) additiveScratch.set(name,{}); const s=additiveScratch.get(name); s[key]=[x,y,z];
}"""
s=rep(s,old_add,new_add,'life preset bone policy')
old_apply="""function applyManualAndLife(){
  if(!vrm)return;
  for(const [name,base] of baseQuats.entries()){
    const node=getBone(name);if(!node)continue;const layers=additiveScratch.get(name)||{};let lx=0,ly=0,lz=0;for(const v of Object.values(layers)){lx+=v?.[0]||0;ly+=v?.[1]||0;lz+=v?.[2]||0;}
    const delta=new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(lx),rad(ly),rad(lz),'XYZ'));
    const actionOwns=currentAction&&['walk','run','wave','think','thinkLoop','reach','weight','nod','crouch','recovery','crossArms','sitBed','lieBed','sleepBed','marchStepLeft','marchStepRight'].includes(currentActionName)&&!manualOffsets.has(name);
    if(actionOwns){if(Math.abs(lx)+Math.abs(ly)+Math.abs(lz)>1e-7)node.quaternion.multiply(delta);continue;}
    const m=manualOffsets.get(name)||[0,0,0];
    const manualQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(m[0]),rad(m[1]),rad(m[2]),'XYZ'));
    node.quaternion.copy(base).multiply(manualQ).multiply(delta);
  }
  additiveScratch.clear();
}"""
new_apply="""function applyManualAndLife(dt=1/60){
  if(!vrm)return;
  const clip=currentAction?.getClip?.();
  for(const [name,base] of baseQuats.entries()){
    const node=getBone(name);if(!node)continue;const layers=additiveScratch.get(name)||{};let lx=0,ly=0,lz=0;for(const v of Object.values(layers)){lx+=v?.[0]||0;ly+=v?.[1]||0;lz+=v?.[2]||0;}
    const delta=new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(lx),rad(ly),rad(lz),'XYZ'));
    const actionOwns=Boolean(currentAction&&clip?.tracks?.some?.(track=>track.name?.startsWith?.(`${node.uuid}.`))&&!manualOffsets.has(name));
    if(actionOwns){if(Math.abs(lx)+Math.abs(ly)+Math.abs(lz)>1e-7)node.quaternion.multiply(delta);continue;}
    const m=manualOffsets.get(name)||[0,0,0],manualQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(m[0]),rad(m[1]),rad(m[2]),'XYZ')),target=base.clone().multiply(manualQ).multiply(delta);
    if(manualOffsets.has(name)||!poseContinuityGuard)node.quaternion.copy(target);else poseContinuityGuard.apply(node,target,dt);
  }
  additiveScratch.clear();
}"""
s=rep(s,old_apply,new_apply,'bounded automatic pose release')
s=rep(s,'lifeSim.applyBalance(); applyManualAndLife(); if(vrm){','lifeSim.applyBalance(); applyManualAndLife(dt); if(vrm){','pose continuity dt')
p.write_text(s,encoding='utf-8')

# Include continuity tests in normal CI.
p=Path('package.json');data=json.loads(p.read_text(encoding='utf-8'));cmd=data['scripts']['test']
for f in ['src/runtime/physics/physiology-continuity.test.mjs','src/runtime/safety/pose-continuity.test.mjs','src/runtime/safety/life-preset-policy.test.mjs']:
    if f not in cmd: cmd += ' '+f
data['scripts']['test']=cmd;p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

print('NIVA life preset continuity fixed: deep breath envelope + bounded action release + vital bone whitelist')
Path(__file__).unlink()
