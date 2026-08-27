from pathlib import Path

p=Path('src/main.js')
s=p.read_text(encoding='utf-8')

old="""import { PhysicalEmbodimentController } from './runtime/embodiment/physical-embodiment-v1.mjs';"""
new=old+"\nimport { KeyboardLocomotionController, isMovementCode } from './runtime/input/keyboard-locomotion.mjs';"
assert old in s
s=s.replace(old,new,1)

old="""const clock = new THREE.Clock();\nconst baseQuats = new Map();"""
new="""const clock = new THREE.Clock();\nconst keyboardLocomotion = new KeyboardLocomotionController({acceleration:10,deceleration:13});\nconst keyboardForward = new THREE.Vector3();\nconst keyboardRight = new THREE.Vector3();\nconst keyboardDirection = new THREE.Vector3();\nconst worldUp = new THREE.Vector3(0,1,0);\nlet keyboardOwnsWalk = false;\nconst baseQuats = new Map();"""
assert old in s
s=s.replace(old,new,1)

old="""  clips.set('walk',makeClip('walk',1,{leftUpperLeg:f(legL),rightUpperLeg:f(legR),leftLowerLeg:f(kneeL),rightLowerLeg:f(kneeR),leftFoot:f(footL),rightFoot:f(footR),hips:walkTimes.map((t,i)=>[t,0,(i<4?1.4:-1.4),0]),chest:walkTimes.map((t,i)=>[t,0,(i<4?-1:1),0])}));"""
new="""  const elbowL=armL.map(v=>-(7+Math.abs(v)*.16)),elbowR=armR.map(v=>7+Math.abs(v)*.16);\n  const pelvisRoll=[.5,.9,.5,0,-.5,-.9,-.5,0,.5];\n  clips.set('walk',makeClip('walk',1,{\n    leftUpperLeg:f(legL),rightUpperLeg:f(legR),leftLowerLeg:f(kneeL),rightLowerLeg:f(kneeR),leftFoot:f(footL),rightFoot:f(footR),\n    leftUpperArm:f(armL),rightUpperArm:f(armR),\n    leftLowerArm:walkTimes.map((t,i)=>[t,0,elbowL[i],0]),rightLowerArm:walkTimes.map((t,i)=>[t,0,elbowR[i],0]),\n    hips:walkTimes.map((t,i)=>[t,0,(i<4?1.8:-1.8),pelvisRoll[i]]),\n    chest:walkTimes.map((t,i)=>[t,0,(i<4?-1.35:1.35),-pelvisRoll[i]*.38]),\n    head:walkTimes.map((t,i)=>[t,0,(i<4?.35:-.35),0])\n  }));"""
assert old in s
s=s.replace(old,new,1)

old="""  activity(){if(this.recovering)return'recovery';if(persistentPreview)return persistentPreview;if(currentActionName&&currentActionName!=='idle')return currentActionName;return'idle';},"""
new="""  activity(){if(this.recovering)return'recovery';if(keyboardLocomotion.state().moving)return'walk';if(persistentPreview)return persistentPreview;if(currentActionName&&currentActionName!=='idle')return currentActionName;return'idle';},"""
assert old in s
s=s.replace(old,new,1)

old="""    const actionOwns=currentAction&&['walk','run','wave','think','thinkLoop','reach','weight','nod','crouch','recovery'].includes(currentActionName)&&!manualOffsets.has(name);"""
new="""    const actionOwns=currentAction&&['walk','run','wave','think','thinkLoop','reach','weight','nod','crouch','recovery','crossArms','sitBed','lieBed','sleepBed'].includes(currentActionName)&&!manualOffsets.has(name);"""
assert old in s
s=s.replace(old,new,1)

old="""document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='c'&&document.activeElement!==composerInput)$('#panelToggle').click();});"""
new="""function isTypingTarget(target){\n  const tag=target?.tagName?.toLowerCase?.()||'';\n  return target?.isContentEditable||tag==='input'||tag==='textarea'||tag==='select';\n}\nfunction beginKeyboardWalk(){\n  if(!modelReady||physicalEmbodiment?.ownsRootPose?.())return false;\n  physicalEmbodiment?.cancelTask?.();\n  persistentPreview='';lifeSim.recovering=false;manualOverrideUntil=performance.now()+1200;director.resumeAt=performance.now()+1800;\n  if(currentActionName!=='walk')playClip('walk',{loop:true});\n  keyboardOwnsWalk=true;return true;\n}\nfunction updateKeyboardWalk(dt,now,state){\n  if(!state?.moving||!vrm||physicalEmbodiment?.ownsRootPose?.()){\n    if(state?.stopped&&keyboardOwnsWalk){keyboardOwnsWalk=false;if(currentActionName==='walk'&&!persistentPreview)stopAction();}\n    return;\n  }\n  if(!keyboardOwnsWalk)beginKeyboardWalk();\n  if(!keyboardOwnsWalk)return;\n  manualOverrideUntil=now+700;director.resumeAt=now+1200;\n  camera.getWorldDirection(keyboardForward);keyboardForward.y=0;if(keyboardForward.lengthSq()<1e-8)keyboardForward.set(0,0,-1);else keyboardForward.normalize();\n  keyboardRight.crossVectors(keyboardForward,worldUp).normalize();\n  keyboardDirection.copy(keyboardForward).multiplyScalar(state.axisZ).addScaledVector(keyboardRight,state.axisX);\n  if(keyboardDirection.lengthSq()<1e-8)return;keyboardDirection.normalize();\n  const speed=settings.walkWorldSpeed*state.speed01;\n  if(settings.physicsEnabled&&physicsReady&&bodyPhysics){\n    bodyPhysics.configure({enabled:true,ikEnabled:settings.footIKEnabled,ikStrength:settings.footIKStrength});\n    if(physicalEmbodiment)physicalEmbodiment.drive(dt,keyboardDirection,speed,'walk');else bodyPhysics.move(dt,keyboardDirection,speed);\n  }else{\n    vrm.scene.position.addScaledVector(keyboardDirection,speed*dt);\n    vrm.scene.position.x=clamp(vrm.scene.position.x,-2.75,2.75);vrm.scene.position.z=clamp(vrm.scene.position.z,-2.25,2.25);\n  }\n  facingController?.faceDirection(keyboardDirection,dt,state.inputActive?9:6);\n  if(currentActionName==='walk'&&currentAction){\n    const fatigueSlow=1-clamp((lifeSim.fatigue-28)/150,0,.30);\n    currentAction.setEffectiveTimeScale((settings.motionSpeed||1)*fatigueSlow*lifeSim.paceNoise*(.70+.34*state.speed01));\n  }\n}\ndocument.addEventListener('keydown',e=>{\n  if(isMovementCode(e.code)&&!isTypingTarget(e.target)){e.preventDefault();if(keyboardLocomotion.keyDown(e.code))beginKeyboardWalk();return;}\n  if(e.key.toLowerCase()==='c'&&!isTypingTarget(e.target))$('#panelToggle').click();\n});\ndocument.addEventListener('keyup',e=>{if(isMovementCode(e.code)){e.preventDefault();keyboardLocomotion.keyUp(e.code);}});\nwindow.addEventListener('blur',()=>keyboardLocomotion.clear());"""
assert old in s
s=s.replace(old,new,1)

old="""  requestAnimationFrame(animate); const dt=Math.min(clock.getDelta(),.05),now=performance.now(); controls.update(); if(mixer)mixer.update(dt); physicalEmbodiment?.update(dt,now); lifeSim.update(dt,now); life.update(now,dt); director.update(now); updateGaze(now); expressionTick(now); lifeSim.applyFatigueFace();"""
new="""  requestAnimationFrame(animate); const dt=Math.min(clock.getDelta(),.05),now=performance.now(),keyboardState=keyboardLocomotion.update(dt); controls.update(); if(mixer)mixer.update(dt); physicalEmbodiment?.update(dt,now); lifeSim.update(dt,now); updateKeyboardWalk(dt,now,keyboardState); life.update(now,dt); director.update(now); updateGaze(now); expressionTick(now); lifeSim.applyFatigueFace();"""
assert old in s
s=s.replace(old,new,1)

old="""window.NIVA={version:'0.99.1',speak,act:(name)=>performAction(name),play:publicPlay,stop:stopAction,state:()=>({modelReady,speaking,currentAction:currentActionName,director:director.state,frame:characterFrame?.describe?.(),facing:facingController?.state?.(),ik:ikSystem?.state?.(),physics:{ready:physicsReady,error:physicsError,...(bodyPhysics?.state?.()||{})},life:{fatigue:lifeSim.fatigue,energy:lifeSim.energy,heartRate:lifeSim.heartRate,breathRate:lifeSim.breathRate,recovering:lifeSim.recovering}})};"""
new="""window.NIVA={version:'0.99.1',speak,act:(name)=>performAction(name),play:publicPlay,stop:stopAction,state:()=>({modelReady,speaking,currentAction:currentActionName,director:director.state,input:{keyboard:keyboardLocomotion.state()},frame:characterFrame?.describe?.(),facing:facingController?.state?.(),ik:ikSystem?.state?.(),physics:{ready:physicsReady,error:physicsError,...(bodyPhysics?.state?.()||{})},life:{fatigue:lifeSim.fatigue,energy:lifeSim.energy,heartRate:lifeSim.heartRate,breathRate:lifeSim.breathRate,recovering:lifeSim.recovering}})};"""
assert old in s
s=s.replace(old,new,1)

p.write_text(s,encoding='utf-8')

p=Path('package.json')
s=p.read_text(encoding='utf-8')
old="src/runtime/physics/contact-gait-v3.test.mjs src/runtime/world/bedroom-world.test.mjs"
new="src/runtime/physics/contact-gait-v3.test.mjs src/runtime/input/keyboard-locomotion.test.mjs src/runtime/world/bedroom-world.test.mjs"
assert old in s
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

Path(__file__).unlink()
print('NIVA Keyboard Walk V4 wired: WASD/arrows + camera-relative motion + arm swing + smooth acceleration/braking')
