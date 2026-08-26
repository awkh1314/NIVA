from pathlib import Path

p = Path('src/main.js')
s = p.read_text(encoding='utf-8')

def repl(old, new, label):
    global s
    if old not in s:
        raise SystemExit(f'PATCH_MISSING:{label}')
    s = s.replace(old, new, 1)

repl(
"import { NivaPhysicsBodySystem } from './runtime/physics/niva-body-physics.mjs';",
"import { NivaPhysicsBodySystem } from './runtime/physics/niva-body-physics.mjs';\nimport { CharacterFrame } from './runtime/core/character-frame.mjs';\nimport { NivaVrmAdapter } from './runtime/core/vrm-adapter.mjs';\nimport { FacingController } from './runtime/core/facing-controller.mjs';\nimport { NivaIKSystem } from './runtime/ik/niva-ik-system.mjs';\nimport { CharacterFrameDebug } from './runtime/debug/character-frame-debug.mjs';",
'import-boundaries')

repl(
"let bodyPhysics = null;\nlet physicsReady = false;",
"let bodyPhysics = null;\nlet vrmAdapter = null;\nlet characterFrame = null;\nlet facingController = null;\nlet ikSystem = null;\nlet coordinateDebug = null;\nlet physicsReady = false;",
'runtime-owners')

repl(
"  physicsGroundContact:true,\n  footIKStrength:0.9,",
"  physicsGroundContact:true,\n  coordinateDebug:false,\n  footIKStrength:0.9,",
'coordinate-setting')

repl(
"function applyModelSettings(){if(!vrm)return;vrm.scene.visible=settings.modelVisible;vrm.scene.scale.setScalar(settings.modelScale);vrm.scene.position.set(modelHome.x+settings.modelX,modelHome.y+settings.modelY,modelHome.z+settings.modelZ);vrm.scene.rotation.y=rad(settings.modelRotY);bodyPhysics?.syncManualRoot?.(vrm.scene.position.x,vrm.scene.position.z);applySkinBrightness();}",
"function applyModelSettings(){if(!vrm)return;vrm.scene.visible=settings.modelVisible;vrm.scene.scale.setScalar(settings.modelScale);vrm.scene.position.set(modelHome.x+settings.modelX,modelHome.y+settings.modelY,modelHome.z+settings.modelZ);if(facingController)facingController.setManualYawDegrees(settings.modelRotY);else vrm.scene.rotation.y=rad(settings.modelRotY);bodyPhysics?.syncManualRoot?.(vrm.scene.position.x,vrm.scene.position.z);applySkinBrightness();}",
'root-yaw-owner')

repl(
"  scene.add(vrm.scene); rememberBones(); applyRelaxedStandingPose(); rememberBones(); centerModel(); modelHome.copy(vrm.scene.position); captureMaterials(); applyModelSettings();\n  gazeTarget.position.copy(camera.position); if(vrm.lookAt) vrm.lookAt.target=gazeTarget;",
"  scene.add(vrm.scene); rememberBones(); applyRelaxedStandingPose(); rememberBones(); centerModel(); modelHome.copy(vrm.scene.position); captureMaterials(); applyModelSettings();\n  vrmAdapter=new NivaVrmAdapter(vrm); characterFrame=new CharacterFrame(vrm.scene); facingController=new FacingController(vrm.scene); facingController.setManualYawDegrees(settings.modelRotY); ikSystem=new NivaIKSystem({vrm,getBone,frame:characterFrame,modelHeight}); coordinateDebug=new CharacterFrameDebug({scene,frame:characterFrame,root:vrm.scene,camera,stage}); coordinateDebug.setVisible(settings.coordinateDebug);\n  gazeTarget.position.copy(camera.position); if(vrm.lookAt) vrm.lookAt.target=gazeTarget;",
'initialize-owners')

repl(
"  NivaPhysicsBodySystem.create({vrm,getBone,modelHeight,rootHome:modelHome,stageRadius:1.55*Math.max(.4,floor.scale.x||1)}).then((system)=>{bodyPhysics=system;physicsReady=true;physicsError='';runtimeSummary.textContent='Free Life Runtime · Physics Ready';showToast('NIVA 物理身体已就绪');}).catch((err)=>{physicsReady=false;physicsError=String(err?.message||err);console.error('NIVA physics init failed',err);runtimeSummary.textContent='Free Life Runtime · Physics fallback';});",
"  NivaPhysicsBodySystem.create({vrm,getFootWorldPosition:(side,out)=>vrmAdapter?.footWorldPosition(side,out),modelHeight,rootHome:modelHome,stageRadius:1.55*Math.max(.4,floor.scale.x||1)}).then((system)=>{bodyPhysics=system;physicsReady=true;physicsError='';runtimeSummary.textContent='Free Life Runtime · Physics Ready';showToast('NIVA 物理身体已就绪');}).catch((err)=>{physicsReady=false;physicsError=String(err?.message||err);console.error('NIVA physics init failed',err);runtimeSummary.textContent='Free Life Runtime · Physics fallback';});",
'physics-readonly-feet')

repl(
"    const targetYaw=rad(settings.modelRotY)+Math.atan2(dir.x,dir.z),cur=vrm.scene.rotation.y,diff=Math.atan2(Math.sin(targetYaw-cur),Math.cos(targetYaw-cur));vrm.scene.rotation.y=cur+diff*(1-Math.exp(-dt*7));",
"    facingController?.faceDirection(dir,dt,7);",
'locomotion-facing-owner')

repl(
"function bindToggles(){controlPage.querySelectorAll('[data-setting]').forEach(el=>el.onchange=()=>{settings[el.dataset.setting]=el.checked;saveSettings();});}",
"function bindToggles(){controlPage.querySelectorAll('[data-setting]').forEach(el=>el.onchange=()=>{settings[el.dataset.setting]=el.checked;if(el.dataset.setting==='coordinateDebug')coordinateDebug?.setVisible(el.checked);saveSettings();});}",
'toggle-debug-hook')

repl(
"${toggleHtml('Rapier 角色物理','physicsEnabled')}${toggleHtml('脚底 IK','footIKEnabled')}${toggleHtml('地面接触','physicsGroundContact')}<button id=\"resetFree\"",
"${toggleHtml('Rapier 角色物理','physicsEnabled')}${toggleHtml('脚底 IK','footIKEnabled')}${toggleHtml('地面接触','physicsGroundContact')}${toggleHtml('坐标校准','coordinateDebug')}<button id=\"resetFree\"",
'debug-ui-toggle')

old_animate = "  applyManualAndLife(); if(vrm){lifeSim.applyGroundContact(dt);if(settings.physicsEnabled&&bodyPhysics&&physicsReady){const clip=currentAction?.getClip?.();bodyPhysics.configure({enabled:true,ikEnabled:settings.footIKEnabled,ikStrength:settings.footIKStrength});bodyPhysics.solvePostAnimation(dt,{action:currentActionName,actionTime:currentAction?.time||0,duration:clip?.duration||1,crouchDepth:settings.crouchDepth});}vrm.update(dt);} renderer.render(scene,camera);"
new_animate = "  applyManualAndLife(); if(vrm){lifeSim.applyGroundContact(dt);let contactPlan=null;if(settings.physicsEnabled&&bodyPhysics&&physicsReady){const clip=currentAction?.getClip?.();bodyPhysics.configure({enabled:true,ikEnabled:settings.footIKEnabled,ikStrength:settings.footIKStrength});contactPlan=bodyPhysics.solvePostAnimation(dt,{action:currentActionName,actionTime:currentAction?.time||0,duration:clip?.duration||1,crouchDepth:settings.crouchDepth});}if(ikSystem&&contactPlan){ikSystem.configure({enabled:settings.footIKEnabled,strength:settings.footIKStrength});ikSystem.solve(contactPlan);}facingController?.tick();coordinateDebug?.update();vrm.update(dt);} renderer.render(scene,camera);"
repl(old_animate, new_animate, 'animation-pipeline')

repl(
"window.NIVA={version:'0.961-stable-squat-v41',speak,act:(name)=>performAction(name),play:(name)=>playClip(name,{duration:clips.get(name)?.duration||2}),stop:stopAction,state:()=>({modelReady,speaking,currentAction:currentActionName,director:director.state,physics:{ready:physicsReady,error:physicsError,...(bodyPhysics?.state?.()||{})},life:{fatigue:lifeSim.fatigue,energy:lifeSim.energy,heartRate:lifeSim.heartRate,breathRate:lifeSim.breathRate,recovering:lifeSim.recovering}})};",
"window.NIVA={version:'0.970-runtime-boundaries-v1',speak,act:(name)=>performAction(name),play:(name)=>playClip(name,{duration:clips.get(name)?.duration||2}),stop:stopAction,state:()=>({modelReady,speaking,currentAction:currentActionName,director:director.state,frame:characterFrame?.describe?.(),facing:facingController?.state?.(),ik:ikSystem?.state?.(),physics:{ready:physicsReady,error:physicsError,...(bodyPhysics?.state?.()||{})},life:{fatigue:lifeSim.fatigue,energy:lifeSim.energy,heartRate:lifeSim.heartRate,breathRate:lifeSim.breathRate,recovering:lifeSim.recovering}})};",
'public-runtime-state')

p.write_text(s, encoding='utf-8')
Path('DEPLOY_VERSION.txt').write_text(
    'NIVA Runtime Boundaries V1\n'
    'CharacterFrame is the only source of forward/right/up (+Z/+X/+Y); FacingController owns root yaw; Physics owns Rapier/root position/ground contacts only; IK owns post-animation limb bone correction.\n',
    encoding='utf-8',
)

# One-shot patch: remove itself after a successful transformation so subsequent
# pushes do not re-apply text replacements.
Path(__file__).unlink()
