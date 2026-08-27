from pathlib import Path
import json

def rep(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'missing anchor: {label}')
    return text.replace(old,new,1)

# Physics immediate authority reconciliation after a rejected visual jump.
p=Path('src/runtime/physics/niva-body-physics.mjs');s=p.read_text(encoding='utf-8')
marker='  moveByDelta(dt, delta, { maxDelta = null } = {}) {'
if '  syncRootNow(x, z) {' not in s:
    method="""  syncRootNow(x, z) {
    if (!this.characterBody) return;
    const t = this.characterBody.translation();
    const next = { x: Number(x) || 0, y: t.y, z: Number(z) || 0 };
    this.characterBody.setTranslation(next, true);
    this.characterBody.setNextKinematicTranslation(next);
    this.vrm.scene.position.x = next.x;
    this.vrm.scene.position.z = next.z;
  }

"""
    s=rep(s,marker,method+marker,'physics syncRootNow')
p.write_text(s,encoding='utf-8')

# Main: strict Root authority + eliminate accidental modelHome resets.
p=Path('src/main.js');s=p.read_text(encoding='utf-8')
s=rep(s,"import { SelfCollisionProjector } from './runtime/safety/self-collision-projector.mjs';","import { SelfCollisionProjector } from './runtime/safety/self-collision-projector.mjs';\nimport { RootContinuityGuard } from './runtime/safety/root-continuity-guard.mjs';",'root guard import')
s=rep(s,'let selfCollisionProjector = null;','let selfCollisionProjector = null;\nlet rootContinuityGuard = null;','root guard variable')
old="function applyModelSettings(){if(!vrm)return;vrm.scene.visible=settings.modelVisible;vrm.scene.scale.setScalar(settings.modelScale);vrm.scene.position.set(modelHome.x+settings.modelX,modelHome.y+settings.modelY,modelHome.z+settings.modelZ);if(facingController)facingController.setManualYawDegrees(settings.modelRotY);else vrm.scene.rotation.y=rad(settings.modelRotY);bodyPhysics?.syncManualRoot?.(vrm.scene.position.x,vrm.scene.position.z);applySkinBrightness();}"
new="function applyModelSettings({reposition=false}={}){if(!vrm)return;vrm.scene.visible=settings.modelVisible;vrm.scene.scale.setScalar(settings.modelScale);if(reposition){vrm.scene.position.set(modelHome.x+settings.modelX,modelHome.y+settings.modelY,modelHome.z+settings.modelZ);bodyPhysics?.syncRootNow?.(vrm.scene.position.x,vrm.scene.position.z);bodyPhysics?.syncManualRoot?.(vrm.scene.position.x,vrm.scene.position.z);rootContinuityGuard?.reset?.(vrm.scene.position);}if(facingController)facingController.setManualYawDegrees(settings.modelRotY);else vrm.scene.rotation.y=rad(settings.modelRotY);applySkinBrightness();}"
s=rep(s,old,new,'model settings root reset')
s=rep(s,'centerModel(); modelHome.copy(vrm.scene.position); captureMaterials(); applyModelSettings();','centerModel(); modelHome.copy(vrm.scene.position); captureMaterials(); applyModelSettings({reposition:true});','initial model settings')
old_init="vrmAdapter=new NivaVrmAdapter(vrm); characterFrame=new CharacterFrame(vrm.scene); facingController=new FacingController(vrm.scene);"
new_init="vrmAdapter=new NivaVrmAdapter(vrm); characterFrame=new CharacterFrame(vrm.scene); rootContinuityGuard=new RootContinuityGuard({modelHeight});rootContinuityGuard.reset(vrm.scene.position); facingController=new FacingController(vrm.scene);"
s=rep(s,old_init,new_init,'guard init')
old_ranges="modelRanges.forEach((el,i)=>el.oninput=()=>{settings[modelKeys[i]]=Number(el.value);el.parentElement.querySelector('output').textContent=el.value;applyModelSettings();saveSettings();});"
new_ranges="modelRanges.forEach((el,i)=>el.oninput=()=>{settings[modelKeys[i]]=Number(el.value);el.parentElement.querySelector('output').textContent=el.value;applyModelSettings({reposition:i>=1&&i<=3});saveSettings();});"
s=rep(s,old_ranges,new_ranges,'model range handler')
s=rep(s,"$('#modelReset').onclick=()=>{manualOffsets.clear();Object.assign(settings,{modelScale:1,modelX:0,modelY:0,modelZ:0,modelRotY:0,skinBrightness:1});applyModelSettings();saveSettings();renderBodyControls();};","$('#modelReset').onclick=()=>{manualOffsets.clear();Object.assign(settings,{modelScale:1,modelX:0,modelY:0,modelZ:0,modelRotY:0,skinBrightness:1});applyModelSettings({reposition:true});saveSettings();renderBodyControls();};",'model reset handler')

# Add final rendered-root authority check immediately before render.
anchor='function animate(){'
helper="""function locomotionOwnsHorizontalRoot(){
  const task=physicalEmbodiment?.state?.().task||'idle';
  return !physicalEmbodiment?.ownsRootPose?.()&&(keyboardOwnsWalk||['walk','run'].includes(currentActionName)||['walk-to-bed','walk-to-anchor','march-step'].includes(task));
}
function enforceRootContinuity(dt){
  if(!vrm||!rootContinuityGuard)return;
  const approved=physicalEmbodiment?.consumeApprovedRootDelta?.()||new THREE.Vector3();
  const result=rootContinuityGuard.apply(dt,vrm.scene.position,{active:locomotionOwnsHorizontalRoot(),approvedDelta:approved});
  if(result.corrected){bodyPhysics?.syncRootNow?.(vrm.scene.position.x,vrm.scene.position.z);vrm.scene.updateMatrixWorld(true);}
}
"""
if 'function enforceRootContinuity(dt)' not in s:
    s=rep(s,anchor,helper+anchor,'continuity helper')
s=rep(s,'coordinateDebug?.update();vrm.update(dt);} renderer.render(scene,camera);','coordinateDebug?.update();vrm.update(dt);enforceRootContinuity(dt);} renderer.render(scene,camera);','final root authority call')
p.write_text(s,encoding='utf-8')

# Standard test suite must exercise the final authority guard.
p=Path('package.json');data=json.loads(p.read_text(encoding='utf-8'));cmd=data['scripts']['test'];guard='src/runtime/safety/root-continuity-guard.test.mjs'
if guard not in cmd: cmd += ' '+guard
data['scripts']['test']=cmd;p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

print('NIVA strict no-teleport authority wired: actual Rapier commit + rendered Root continuity guard + no accidental modelHome reset')
Path(__file__).unlink()
