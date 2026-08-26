from pathlib import Path
import re

p = Path('src/main.js')
s = p.read_text(encoding='utf-8')

def once(old, new, label):
    global s
    if old not in s:
        raise SystemExit(f'missing marker: {label}')
    s = s.replace(old, new, 1)

once(
    "import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';\n",
    "import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';\nimport { NivaPhysicsBodySystem } from './runtime/physics/niva-body-physics.mjs';\n",
    'physics import',
)

once(
    "let currentActionName = 'idle';\n",
    "let currentActionName = 'idle';\nlet bodyPhysics = null;\nlet physicsReady = false;\nlet physicsError = '';\n",
    'physics state',
)

once(
    "  autoFatigueRecovery:true,\n  exposure:0.9,",
    "  autoFatigueRecovery:true,\n  physicsEnabled:true,\n  footIKEnabled:true,\n  physicsGroundContact:true,\n  footIKStrength:0.9,\n  crouchDepth:0.19,\n  walkWorldSpeed:0.55,\n  runWorldSpeed:1.25,\n  exposure:0.9,",
    'physics defaults',
)

old_apply = "function applyModelSettings(){if(!vrm)return;vrm.scene.visible=settings.modelVisible;vrm.scene.scale.setScalar(settings.modelScale);vrm.scene.position.set(modelHome.x+settings.modelX,modelHome.y+settings.modelY,modelHome.z+settings.modelZ);vrm.scene.rotation.y=rad(settings.modelRotY);applySkinBrightness();}"
new_apply = "function applyModelSettings(){if(!vrm)return;vrm.scene.visible=settings.modelVisible;vrm.scene.scale.setScalar(settings.modelScale);vrm.scene.position.set(modelHome.x+settings.modelX,modelHome.y+settings.modelY,modelHome.z+settings.modelZ);vrm.scene.rotation.y=rad(settings.modelRotY);bodyPhysics?.syncManualRoot?.(vrm.scene.position.x,vrm.scene.position.z);applySkinBrightness();}"
once(old_apply, new_apply, 'model physics sync')

s, n = re.subn(
    r"^  clips\.set\('crouch'.*$",
    "  clips.set('crouch',makeClip('crouch',2,{spine:[[0,4,0,0],[2,4,0,0]],chest:[[0,2,0,0],[2,2,0,0]],leftUpperLeg:[[0,8,0,0],[2,8,0,0]],rightUpperLeg:[[0,8,0,0],[2,8,0,0]],leftLowerLeg:[[0,18,0,0],[2,18,0,0]],rightLowerLeg:[[0,18,0,0],[2,18,0,0]],leftFoot:[[0,-5,0,0],[2,-5,0,0]],rightFoot:[[0,-5,0,0],[2,-5,0,0]],head:[[0,-2,0,0],[2,-2,0,0]]}));",
    s,
    count=1,
    flags=re.M,
)
if n != 1: raise SystemExit('crouch clip marker missing')

s, n = re.subn(
    r"^  clips\.set\('recovery'.*$",
    "  clips.set('recovery',makeClip('recovery',3,{spine:[[0,18,0,0],[3,18,0,0]],chest:[[0,7,0,0],[3,7,0,0]],neck:[[0,-5,0,0],[3,-5,0,0]],leftUpperLeg:[[0,8,0,0],[3,8,0,0]],rightUpperLeg:[[0,8,0,0],[3,8,0,0]],leftLowerLeg:[[0,18,0,0],[3,18,0,0]],rightLowerLeg:[[0,18,0,0],[3,18,0,0]],leftFoot:[[0,-5,0,0],[3,-5,0,0]],rightFoot:[[0,-5,0,0],[3,-5,0,0]],leftUpperArm:[[0,10,0,-7],[3,10,0,-7]],rightUpperArm:[[0,10,0,7],[3,10,0,7]],leftLowerArm:[[0,0,-24,0],[3,0,-24,0]],rightLowerArm:[[0,0,24,0],[3,0,24,0]],head:[[0,-6,0,0],[3,-6,0,0]]}));",
    s,
    count=1,
    flags=re.M,
)
if n != 1: raise SystemExit('recovery clip marker missing')

new_locomotion = '''  updateLocomotion(dt,a){
    if(!vrm||this.recovering||!['walk','run'].includes(a)||persistentPreview!==a)return;
    const baseX=modelHome.x+settings.modelX,baseZ=modelHome.z+settings.modelZ;
    const pos=new THREE.Vector3(vrm.scene.position.x-baseX,0,vrm.scene.position.z-baseZ),to=this.stageTarget.clone().sub(pos);to.y=0;
    if(to.length()<.14){this.chooseStageTarget();return;}
    const dir=to.normalize(),fatigueSlow=1-clamp((this.fatigue-35)/170,0,.28);
    const speed=(a==='run'?settings.runWorldSpeed:settings.walkWorldSpeed)*fatigueSlow;
    if(settings.physicsEnabled){
      if(!physicsReady||!bodyPhysics)return;
      bodyPhysics.configure({enabled:true,ikEnabled:settings.footIKEnabled,ikStrength:settings.footIKStrength});
      bodyPhysics.move(dt,dir,speed);
    }else{
      pos.addScaledVector(dir,speed*dt);const maxR=1.18*Math.max(.4,floor.scale.x||1);if(pos.length()>maxR)pos.setLength(maxR);
      vrm.scene.position.x=baseX+pos.x;vrm.scene.position.z=baseZ+pos.z;
    }
    const targetYaw=rad(settings.modelRotY)+Math.atan2(dir.x,dir.z),cur=vrm.scene.rotation.y,diff=Math.atan2(Math.sin(targetYaw-cur),Math.cos(targetYaw-cur));vrm.scene.rotation.y=cur+diff*(1-Math.exp(-dt*7));
  },
  forceRecovery'''
s, n = re.subn(r"  updateLocomotion\(dt,a\)\{.*?\n  \},\n  forceRecovery", new_locomotion, s, count=1, flags=re.S)
if n != 1: raise SystemExit('locomotion block missing')

new_ground = '''  applyGroundContact(dt){
    if(!vrm)return;
    if(settings.physicsEnabled&&settings.physicsGroundContact&&bodyPhysics&&physicsReady){
      bodyPhysics.configure({enabled:true,ikEnabled:settings.footIKEnabled,ikStrength:settings.footIKStrength});
      if(!['walk','run'].includes(this.activity()))bodyPhysics.holdPosition(dt);
      return;
    }
    const baseY=modelHome.y+settings.modelY;
    vrm.scene.position.y+=((baseY-vrm.scene.position.y)*(1-Math.exp(-dt*8)));
  },
  applyFatigueFace'''
s, n = re.subn(r"  applyGroundContact\(dt\)\{.*?\n  \},\n  applyFatigueFace", new_ground, s, count=1, flags=re.S)
if n != 1: raise SystemExit('ground block missing')

once(
    "  modelReady=true; runtimeSummary.textContent='Free Life Runtime · Ready';\n  showToast('NIVA 已就绪');",
    "  modelReady=true; runtimeSummary.textContent='Free Life Runtime · Ready';\n  showToast('NIVA 已就绪');\n  NivaPhysicsBodySystem.create({vrm,getBone,modelHeight,rootHome:modelHome,stageRadius:1.55*Math.max(.4,floor.scale.x||1)}).then((system)=>{bodyPhysics=system;physicsReady=true;physicsError='';runtimeSummary.textContent='Free Life Runtime · Physics Ready';showToast('NIVA 物理身体已就绪');}).catch((err)=>{physicsReady=false;physicsError=String(err?.message||err);console.error('NIVA physics init failed',err);runtimeSummary.textContent='Free Life Runtime · Physics fallback';});",
    'physics startup',
)

once(
    "${toggleHtml('对白气泡','bubblesEnabled')}<button id=\"resetFree\"",
    "${toggleHtml('对白气泡','bubblesEnabled')}${toggleHtml('Rapier 角色物理','physicsEnabled')}${toggleHtml('脚底 IK','footIKEnabled')}${toggleHtml('地面接触','physicsGroundContact')}<button id=\"resetFree\"",
    'base physics toggles',
)

old_radius = "a[0].oninput=()=>{const z=+a[0].value/1.55;floor.scale.setScalar(z);ring.scale.setScalar(z);innerRing.scale.setScalar(z);a[0].parentElement.querySelector('output').textContent=a[0].value;};"
new_radius = "a[0].oninput=()=>{const z=+a[0].value/1.55;floor.scale.setScalar(z);ring.scale.setScalar(z);innerRing.scale.setScalar(z);bodyPhysics?.rebuildGround?.(+a[0].value);a[0].parentElement.querySelector('output').textContent=a[0].value;};"
once(old_radius, new_radius, 'stage collider radius')

old_anim = "  applyManualAndLife(); if(vrm){vrm.update(dt);lifeSim.applyGroundContact(dt);} renderer.render(scene,camera);"
new_anim = "  applyManualAndLife(); if(vrm){lifeSim.applyGroundContact(dt);if(settings.physicsEnabled&&bodyPhysics&&physicsReady){const clip=currentAction?.getClip?.();bodyPhysics.configure({enabled:true,ikEnabled:settings.footIKEnabled,ikStrength:settings.footIKStrength});bodyPhysics.solvePostAnimation(dt,{action:currentActionName,actionTime:currentAction?.time||0,duration:clip?.duration||1,crouchDepth:settings.crouchDepth});}vrm.update(dt);} renderer.render(scene,camera);"
once(old_anim, new_anim, 'render physics solve')

s, n = re.subn(
    r"window\.NIVA=\{version:'0\.93-free-life'.*?\};\s*$",
    "window.NIVA={version:'0.94-physics-body',speak,act:(name)=>performAction(name),play:(name)=>playClip(name,{duration:clips.get(name)?.duration||2}),stop:stopAction,state:()=>({modelReady,speaking,currentAction:currentActionName,director:director.state,physics:{ready:physicsReady,error:physicsError,...(bodyPhysics?.state?.()||{})},life:{fatigue:lifeSim.fatigue,energy:lifeSim.energy,heartRate:lifeSim.heartRate,breathRate:lifeSim.breathRate,recovering:lifeSim.recovering}})};\n",
    s,
    count=1,
    flags=re.S,
)
if n != 1: raise SystemExit('window NIVA marker missing')

p.write_text(s, encoding='utf-8')
print('body physics v1 patch applied')
