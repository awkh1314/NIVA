from pathlib import Path

# --- Physics: room colliders + gait load plan ---------------------------------
p=Path('src/runtime/physics/niva-body-physics.mjs')
s=p.read_text(encoding='utf-8')
old="""    this.predictivePlan = null;\n  }\n\n  init() {"""
new="""    this.predictivePlan = null;\n    this.roomColliders = [];\n    this.gaitPlan = null;\n  }\n\n  init() {"""
assert old in s
s=s.replace(old,new,1)
old="""  configure({ enabled = true, ikEnabled = true, ikStrength = 0.9 } = {}) {"""
insert="""  addFixedBoxCollider({ name = 'room-box', size, position } = {}) {\n    if (!this.world || !size || !position) return null;\n    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z));\n    const collider = this.world.createCollider(\n      RAPIER.ColliderDesc.cuboid(Math.max(.01,size.x/2),Math.max(.01,size.y/2),Math.max(.01,size.z/2)).setFriction(.95).setRestitution(0),\n      body,\n    );\n    const entry = { name, body, collider };\n    this.roomColliders.push(entry);\n    return entry;\n  }\n\n  configure({ enabled = true, ikEnabled = true, ikStrength = 0.9 } = {}) {"""
assert old in s
s=s.replace(old,insert,1)
s=s.replace("solvePostAnimation(dt, { action = 'idle', actionTime = 0, duration = 1, crouchDepth = 0.14 } = {}) {","solvePostAnimation(dt, { action = 'idle', actionTime = 0, duration = 1, crouchDepth = 0.14, gaitPlan = null } = {}) {",1)
old="""    const phase = duration > 0 ? ((actionTime % duration) / duration + 1) % 1 : 0;\n    const stance = { left: false, right: false };\n    for (const side of ['left', 'right']) {\n      const isStance = this.stanceFor(action, phase, side);"""
new="""    const phase = duration > 0 ? ((actionTime % duration) / duration + 1) % 1 : 0;\n    this.gaitPlan = gaitPlan ? { ...gaitPlan, supportLoad: gaitPlan.supportLoad ? { ...gaitPlan.supportLoad } : null } : null;\n    const stance = gaitPlan?.stance ? { left: Boolean(gaitPlan.stance.left), right: Boolean(gaitPlan.stance.right) } : { left: false, right: false };\n    for (const side of ['left', 'right']) {\n      const isStance = gaitPlan?.stance ? Boolean(gaitPlan.stance[side]) : this.stanceFor(action, phase, side);"""
assert old in s
s=s.replace(old,new,1)
old="""    this.balancePlan = this.balanceController.update(dt, {\n      action,\n      phase,\n      stance,\n      centerOfMass,\n      leftFoot,\n      rightFoot,\n      forward,\n      right,\n      grounded: this.grounded,\n    });\n\n    const rootPosition"""
new="""    this.balancePlan = this.balanceController.update(dt, {\n      action,\n      phase,\n      stance,\n      centerOfMass,\n      leftFoot,\n      rightFoot,\n      forward,\n      right,\n      grounded: this.grounded,\n    });\n    if (this.balancePlan && gaitPlan?.supportLoad) {\n      const leftLoad = clamp(gaitPlan.supportLoad.left ?? .5, 0, 1);\n      const rightLoad = clamp(gaitPlan.supportLoad.right ?? .5, 0, 1);\n      this.balancePlan.gait = this.gaitPlan;\n      this.balancePlan.leftLoad = leftLoad;\n      this.balancePlan.rightLoad = rightLoad;\n      // Pressure transfer is converted into a small pelvis/COM migration toward\n      // the planted foot. Foot IK keeps that foot fixed while the body passes over it.\n      this.balancePlan.rootShiftRight = (this.balancePlan.rootShiftRight || 0) + (rightLoad-leftLoad)*this.modelHeight*.010;\n    }\n\n    const rootPosition"""
assert old in s
s=s.replace(old,new,1)
old="""      balance: this.balancePlan ? { ...this.balancePlan } : null,\n    };"""
new="""      balance: this.balancePlan ? { ...this.balancePlan } : null,\n      gait: this.gaitPlan ? { ...this.gaitPlan } : null,\n    };"""
assert old in s
s=s.replace(old,new,1)
old="""      solver: 'physics-predictive-balance-v3',\n    };"""
new="""      gait: this.gaitPlan ? { ...this.gaitPlan } : null,\n      roomColliders: this.roomColliders.length,\n      solver: 'physics-contact-gait-room-v4',\n    };"""
assert old in s
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

# --- Main runtime wiring -------------------------------------------------------
p=Path('src/main.js')
s=p.read_text(encoding='utf-8')
old="""import { SelfCollisionProjector } from './runtime/safety/self-collision-projector.mjs';"""
new="""import { SelfCollisionProjector } from './runtime/safety/self-collision-projector.mjs';\nimport { BedroomWorld } from './runtime/world/bedroom-world.mjs';\nimport { PhysicalEmbodimentController } from './runtime/embodiment/physical-embodiment-v1.mjs';"""
assert old in s
s=s.replace(old,new,1)
old="""let selfCollisionProjector = null;\nlet coordinateDebug = null;"""
new="""let selfCollisionProjector = null;\nlet bedroomWorld = null;\nlet physicalEmbodiment = null;\nlet coordinateDebug = null;"""
assert old in s
s=s.replace(old,new,1)
old="""const innerRing = new THREE.Mesh(new THREE.RingGeometry(0.83,0.85,96), new THREE.MeshBasicMaterial({color:0x5665a7,transparent:true,opacity:0.32,side:THREE.DoubleSide})); innerRing.rotation.x=-Math.PI/2; innerRing.position.y=0.008; scene.add(innerRing);"""
new=old+"\n\n// A semantic bedroom replaces the empty stage as NIVA's first persistent world.\nbedroomWorld = new BedroomWorld({scene});\ncamera.position.set(0,1.55,5.2); controls.target.set(.35,.85,-.25); controls.maxDistance=10;"
assert old in s
s=s.replace(old,new,1)
old="""  clips.set('idle', makeClip('idle',2,{head:n(2)}));"""
new="""  clips.set('idle', makeClip('idle',2,{head:n(2)}));\n  clips.set('sitBed',makeClip('sitBed',1.25,{hips:[[0,0,0,0],[.55,-8,0,0],[1.25,-10,0,0]],spine:[[0,0,0,0],[.55,8,0,0],[1.25,10,0,0]],leftUpperLeg:[[0,0,0,0],[.7,72,0,0],[1.25,78,0,0]],rightUpperLeg:[[0,0,0,0],[.7,72,0,0],[1.25,78,0,0]],leftLowerLeg:[[0,0,0,0],[.7,82,0,0],[1.25,88,0,0]],rightLowerLeg:[[0,0,0,0],[.7,82,0,0],[1.25,88,0,0]]}));\n  clips.set('lieBed',makeClip('lieBed',1.5,{hips:[[0,0,0,0],[1.5,4,0,0]],spine:[[0,0,0,0],[1.5,-5,0,0]],leftUpperLeg:[[0,0,0,0],[1.5,12,0,-5]],rightUpperLeg:[[0,0,0,0],[1.5,18,0,7]],leftLowerLeg:[[0,0,0,0],[1.5,18,0,0]],rightLowerLeg:[[0,0,0,0],[1.5,24,0,0]],leftUpperArm:[[0,0,0,0],[1.5,8,0,22]],rightUpperArm:[[0,0,0,0],[1.5,12,0,-18]]}));\n  clips.set('sleepBed',makeClip('sleepBed',4,{chest:[[0,0,0,0],[1,2,0,0],[2,0,0,0],[3,1.5,0,0],[4,0,0,0]],head:[[0,0,0,0],[2,0,4,0],[4,0,0,0]]}));"""
assert old in s
s=s.replace(old,new,1)
old="""  NivaPhysicsBodySystem.create({vrm,getBone,getFootWorldPosition:(side,out)=>vrmAdapter?.footWorldPosition(side,out),modelHeight,rootHome:modelHome,stageRadius:1.55*Math.max(.4,floor.scale.x||1)}).then((system)=>{bodyPhysics=system;physicsReady=true;physicsError='';runtimeSummary.textContent='Free Life Runtime · Physics Ready';showToast('NIVA 物理身体已就绪');}).catch"""
new="""  NivaPhysicsBodySystem.create({vrm,getBone,getFootWorldPosition:(side,out)=>vrmAdapter?.footWorldPosition(side,out),modelHeight,rootHome:modelHome,stageRadius:1.55*Math.max(.4,floor.scale.x||1)}).then((system)=>{bodyPhysics=system;bedroomWorld?.registerPhysics(bodyPhysics);physicalEmbodiment=new PhysicalEmbodimentController({world:bedroomWorld,getVrm:()=>vrm,getBodyPhysics:()=>bodyPhysics,getActionState:()=>({time:currentAction?.time||0,duration:currentAction?.getClip?.()?.duration||1}),playClip:(name,opts)=>playClip(name,opts),stopAction:()=>stopAction(),faceDirection:(dir,dt,lambda)=>facingController?.faceDirection(dir,dt,lambda),walkSpeed:settings.walkWorldSpeed});physicsReady=true;physicsError='';runtimeSummary.textContent='Free Life Runtime · Physical Room Ready';showToast('NIVA 房间物理身体已就绪');}).catch"""
assert old in s
s=s.replace(old,new,1)
old="""  '走路':{reply:'好，我走给你看看。',emotion:'happy',action:'walk'},"""
new=old+"\n  '去床上睡觉':{reply:'好，我走到床边，掀开被子再躺下。',emotion:'gentle',action:'sleepTask'},\n  '回房睡觉':{reply:'好，我回床上睡觉。',emotion:'gentle',action:'sleepTask'},"
assert old in s
s=s.replace(old,new,1)
old="""  if(action==='breath'){ life.deepBreathUntil=performance.now()+5000; return; }"""
new="""  if(action==='breath'){ life.deepBreathUntil=performance.now()+5000; return; }\n  if(action==='sleepTask'){ physicalEmbodiment?.startSleep?.(); return true; }"""
assert old in s
s=s.replace(old,new,1)
old="""      bodyPhysics.move(dt,dir,speed);"""
new="""      if(physicalEmbodiment)physicalEmbodiment.drive(dt,dir,speed,a);else bodyPhysics.move(dt,dir,speed);"""
assert old in s
s=s.replace(old,new,1)
old="""    if(settings.physicsEnabled&&settings.physicsGroundContact&&bodyPhysics&&physicsReady){\n      bodyPhysics.configure({enabled:true,ikEnabled:settings.footIKEnabled,ikStrength:settings.footIKStrength});"""
new="""    if(settings.physicsEnabled&&settings.physicsGroundContact&&bodyPhysics&&physicsReady&&!physicalEmbodiment?.ownsRootPose?.()){\n      bodyPhysics.configure({enabled:true,ikEnabled:settings.footIKEnabled,ikStrength:settings.footIKStrength});"""
assert old in s
s=s.replace(old,new,1)
old="""requestAnimationFrame(animate); const dt=Math.min(clock.getDelta(),.05),now=performance.now(); controls.update(); if(mixer)mixer.update(dt); lifeSim.update(dt,now);"""
new="""requestAnimationFrame(animate); const dt=Math.min(clock.getDelta(),.05),now=performance.now(); controls.update(); if(mixer)mixer.update(dt); physicalEmbodiment?.update(dt,now); lifeSim.update(dt,now);"""
assert old in s
s=s.replace(old,new,1)
old="""if(settings.physicsEnabled&&bodyPhysics&&physicsReady){const clip=currentAction?.getClip?.();bodyPhysics.configure({enabled:true,ikEnabled:settings.footIKEnabled,ikStrength:settings.footIKStrength});contactPlan=bodyPhysics.solvePostAnimation(dt,{action:currentActionName,actionTime:currentAction?.time||0,duration:clip?.duration||1,crouchDepth:settings.crouchDepth});lifeSim.balancePlan=contactPlan?.balance||null;}"""
new="""if(settings.physicsEnabled&&bodyPhysics&&physicsReady&&!physicalEmbodiment?.ownsRootPose?.()){const clip=currentAction?.getClip?.();bodyPhysics.configure({enabled:true,ikEnabled:settings.footIKEnabled,ikStrength:settings.footIKStrength});contactPlan=bodyPhysics.solvePostAnimation(dt,{action:currentActionName,actionTime:currentAction?.time||0,duration:clip?.duration||1,crouchDepth:settings.crouchDepth,gaitPlan:physicalEmbodiment?.contactGait?.()||null});lifeSim.balancePlan=contactPlan?.balance||null;}"""
assert old in s
s=s.replace(old,new,1)
old="""jointGuard?.apply(dt);selfCollisionProjector?.project();facingController?.tick();coordinateDebug?.update();vrm.update(dt);"""
new="""jointGuard?.apply(dt);selfCollisionProjector?.project();if(!physicalEmbodiment?.ownsRootPose?.())facingController?.tick();coordinateDebug?.update();vrm.update(dt);"""
assert old in s
s=s.replace(old,new,1)
old="""['idle','wave','nod','think','walk','run','smile'].includes(name)?performAction(name,allowWhileSpeaking)"""
new="""['idle','wave','nod','think','walk','run','smile','sleepTask'].includes(name)?performAction(name,allowWhileSpeaking)"""
assert old in s
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

# --- Package tests -------------------------------------------------------------
p=Path('package.json')
s=p.read_text(encoding='utf-8')
old="src/runtime/physics/predictive-stability.test.mjs src/runtime/safety/anatomical-rom-v2.test.mjs"
new="src/runtime/physics/predictive-stability.test.mjs src/runtime/physics/contact-gait-v3.test.mjs src/runtime/world/bedroom-world.test.mjs src/runtime/embodiment/physical-embodiment-v1.test.mjs src/runtime/safety/anatomical-rom-v2.test.mjs"
assert old in s
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

# Self-delete after the workflow has applied the one-time repository patch.
Path(__file__).unlink()
print('NIVA Physical Embodiment V1 wired: planted gait + bedroom + bed/blanket sleep task')
