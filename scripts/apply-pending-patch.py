from pathlib import Path

p=Path('src/main.js')
s=p.read_text(encoding='utf-8')

# Add the discrete march clips immediately after the continuous walk clip.
needle="""  clips.set('walk',makeClip('walk',1,{\n    leftUpperLeg:f(legL),rightUpperLeg:f(legR),leftLowerLeg:f(kneeL),rightLowerLeg:f(kneeR),leftFoot:f(footL),rightFoot:f(footR),\n    leftUpperArm:f(armL),rightUpperArm:f(armR),\n    leftLowerArm:walkTimes.map((t,i)=>[t,0,elbowL[i],0]),rightLowerArm:walkTimes.map((t,i)=>[t,0,elbowR[i],0]),\n    hips:walkTimes.map((t,i)=>[t,0,(i<4?1.8:-1.8),pelvisRoll[i]]),\n    chest:walkTimes.map((t,i)=>[t,0,(i<4?-1.35:1.35),-pelvisRoll[i]*.38]),\n    head:walkTimes.map((t,i)=>[t,0,(i<4?.35:-.35),0])\n  }));"""
insert=needle+"""
  // One complete military-style step: attention -> lead swing -> heel strike ->
  // rear toe-off -> rear-leg recovery -> feet together -> arms back at thighs.
  const marchTimes=[0,.16,.48,.68,.98,1.24,1.48,1.65];
  const marchX=(values)=>marchTimes.map((t,i)=>[t,values[i],0,0]);
  const makeMarchStep=(side)=>{
    const lead=side==='left'?'left':'right',trail=lead==='left'?'right':'left',sgn=lead==='left'?1:-1;
    const tracks={
      hips:marchTimes.map((t,i)=>[t,0,[0,0,sgn*2.2,sgn*1.8,sgn*.7,0,0,0][i],[0,-sgn*1.5,-sgn*.8,sgn*.6,sgn*.8,sgn*.2,0,0][i]]),
      spine:marchTimes.map((t,i)=>[t,[0,1.0,1.8,1.4,1.0,.5,0,0][i],0,[0,sgn*.45,sgn*.35,-sgn*.25,-sgn*.35,-sgn*.1,0,0][i]]),
      chest:marchTimes.map((t,i)=>[t,[0,.4,.8,.7,.4,.2,0,0][i],[0,0,-sgn*1.4,-sgn*1.1,-sgn*.4,0,0,0][i],0]),
      head:marchTimes.map((t,i)=>[t,[0,-.2,-.5,-.4,-.2,0,0,0][i],[0,0,sgn*.45,sgn*.35,0,0,0,0][i],0]),
    };
    tracks[`${lead}UpperLeg`]=marchX([0,6,30,20,5,0,0,0]);
    tracks[`${lead}LowerLeg`]=marchX([0,12,34,8,7,4,0,0]);
    tracks[`${lead}Foot`]=marchX([0,-2,-5,-4,0,1,0,0]);
    tracks[`${trail}UpperLeg`]=marchX([0,-4,-10,-14,-10,22,8,0]);
    tracks[`${trail}LowerLeg`]=marchX([0,3,5,9,14,34,14,0]);
    tracks[`${trail}Foot`]=marchX([0,0,2,7,13,-5,-2,0]);
    // Contralateral arm swings forward; the lead-side arm swings back once.
    tracks[`${lead}UpperArm`]=marchX([0,-5,-18,-14,-7,-2,0,0]);
    tracks[`${trail}UpperArm`]=marchX([0,6,24,18,8,2,0,0]);
    tracks[`${lead}LowerArm`]=marchTimes.map((t)=>[t,0,0,0]);
    tracks[`${trail}LowerArm`]=marchTimes.map((t)=>[t,0,0,0]);
    tracks[`${lead}Hand`]=marchTimes.map((t)=>[t,0,0,0]);
    tracks[`${trail}Hand`]=marchTimes.map((t)=>[t,0,0,0]);
    return makeClip(`marchStep${lead==='left'?'Left':'Right'}`,1.65,tracks);
  };
  clips.set('marchStepLeft',makeMarchStep('left'));
  clips.set('marchStepRight',makeMarchStep('right'));"""
assert needle in s
s=s.replace(needle,insert,1)

old="""physicalEmbodiment=new PhysicalEmbodimentController({world:bedroomWorld,getVrm:()=>vrm,getBodyPhysics:()=>bodyPhysics,getActionState:()=>({time:currentAction?.time||0,duration:currentAction?.getClip?.()?.duration||1}),playClip:(name,opts)=>playClip(name,opts),stopAction:()=>stopAction(),faceDirection:(dir,dt,lambda)=>facingController?.faceDirection(dir,dt,lambda),walkSpeed:settings.walkWorldSpeed});"""
new="""physicalEmbodiment=new PhysicalEmbodimentController({world:bedroomWorld,getVrm:()=>vrm,getBodyPhysics:()=>bodyPhysics,getActionState:()=>({time:currentAction?.time||0,duration:currentAction?.getClip?.()?.duration||1}),playClip:(name,opts)=>playClip(name,opts),stopAction:()=>stopAction(),faceDirection:(dir,dt,lambda)=>facingController?.faceDirection(dir,dt,lambda),walkSpeed:settings.walkWorldSpeed,stepLength:modelHeight*.42});"""
assert old in s
s=s.replace(old,new,1)

old="""  '走一下':{reply:'好，我走给你看看。',emotion:'happy',action:'walk'},"""
new="""  '走一步':{reply:'好，我完整迈一步，然后收腿立正。',emotion:'neutral',action:'marchStep'},\n"""+old
assert old in s
s=s.replace(old,new,1)

old="""function performAction(action,allowWhileSpeaking=false){\n  if(action==='idle'){stopAction();return true;}"""
new="""let nextMarchSide='left';\nfunction performAction(action,allowWhileSpeaking=false){\n  if(action==='idle'){physicalEmbodiment?.cancelTask?.();stopAction();return true;}"""
assert old in s
s=s.replace(old,new,1)

old="""  if(action==='walk'){ if(playClip('walk',{loop:true,allowWhileSpeaking})){setTimeout(stopAction,3100);} return; }"""
new=old+"""\n  if(action==='marchStep'||action==='marchStepLeft'||action==='marchStepRight'){\n    const side=action==='marchStepLeft'?'left':action==='marchStepRight'?'right':nextMarchSide;\n    const started=physicalEmbodiment?.startMarchStep?.(side);\n    if(action==='marchStep'&&started)nextMarchSide=side==='left'?'right':'left';\n    if(started)return true;\n    return playClip(side==='left'?'marchStepLeft':'marchStepRight',{duration:1.65,allowWhileSpeaking});\n  }"""
assert old in s
s=s.replace(old,new,1)

old="""const previewActions=[['停止','stop'],['思考','thinkLoop'],['抱胸','crossArms'],['走路','walk'],['跑步','run'],['蹲下','crouch']];"""
new="""const previewActions=[['停止','stop'],['思考','thinkLoop'],['抱胸','crossArms'],['走一步','marchStep'],['走路','walk'],['跑步','run'],['蹲下','crouch']];"""
assert old in s
s=s.replace(old,new,1)

old="""function startPreviewMotion(name){\n  if(name==='stop'){stopAction();lifeSim.recovering=false;setExpression('neutral',0);return;}"""
new="""function startPreviewMotion(name){\n  if(name==='stop'){physicalEmbodiment?.cancelTask?.();stopAction();lifeSim.recovering=false;setExpression('neutral',0);return;}\n  if(name==='marchStep'){physicalEmbodiment?.cancelTask?.();stopAction();persistentPreview='';setTimeout(()=>performAction('marchStep'),190);return;}"""
assert old in s
s=s.replace(old,new,1)

old="""  activity(){if(this.recovering)return'recovery';if(keyboardLocomotion.state().moving)return'walk';if(persistentPreview)return persistentPreview;if(currentActionName&&currentActionName!=='idle')return currentActionName;return'idle';},"""
new="""  activity(){if(this.recovering)return'recovery';if(keyboardLocomotion.state().moving)return'walk';if(physicalEmbodiment?.state?.().task==='march-step')return'walk';if(persistentPreview)return persistentPreview;if(currentActionName&&currentActionName!=='idle')return currentActionName;return'idle';},"""
assert old in s
s=s.replace(old,new,1)

old="""    const actionOwns=currentAction&&['walk','run','wave','think','thinkLoop','reach','weight','nod','crouch','recovery','crossArms','sitBed','lieBed','sleepBed'].includes(currentActionName)&&!manualOffsets.has(name);"""
new="""    const actionOwns=currentAction&&['walk','run','wave','think','thinkLoop','reach','weight','nod','crouch','recovery','crossArms','sitBed','lieBed','sleepBed','marchStepLeft','marchStepRight'].includes(currentActionName)&&!manualOffsets.has(name);"""
assert old in s
s=s.replace(old,new,1)

old="""contactPlan=bodyPhysics.solvePostAnimation(dt,{action:currentActionName,actionTime:currentAction?.time||0,duration:clip?.duration||1,crouchDepth:settings.crouchDepth,gaitPlan:physicalEmbodiment?.contactGait?.()||null});"""
new="""const physicsAction=['marchStepLeft','marchStepRight'].includes(currentActionName)?'walk':currentActionName;contactPlan=bodyPhysics.solvePostAnimation(dt,{action:physicsAction,actionTime:currentAction?.time||0,duration:clip?.duration||1,crouchDepth:settings.crouchDepth,gaitPlan:physicalEmbodiment?.contactGait?.()||null});"""
assert old in s
s=s.replace(old,new,1)

old="""runMotion:(name,allowWhileSpeaking=false)=>['idle','wave','nod','think','walk','run','smile','crossArms','sleepTask'].includes(name)?performAction(name,allowWhileSpeaking):playClip(name,{duration:clips.get(name)?.duration||2,allowWhileSpeaking}),"""
new="""runMotion:(name,allowWhileSpeaking=false)=>['idle','wave','nod','think','walk','run','smile','crossArms','marchStep','marchStepLeft','marchStepRight','sleepTask'].includes(name)?performAction(name,allowWhileSpeaking):playClip(name,{duration:clips.get(name)?.duration||2,allowWhileSpeaking}),"""
assert old in s
s=s.replace(old,new,1)

old="""input:{keyboard:keyboardLocomotion.state()},frame:"""
new="""input:{keyboard:keyboardLocomotion.state()},embodiment:physicalEmbodiment?.state?.()||null,frame:"""
assert old in s
s=s.replace(old,new,1)

p.write_text(s,encoding='utf-8')

pkg=Path('package.json')
t=pkg.read_text(encoding='utf-8')
old="src/runtime/physics/contact-gait-v3.test.mjs src/runtime/input/keyboard-locomotion.test.mjs"
new="src/runtime/physics/contact-gait-v3.test.mjs src/runtime/physics/single-step-march.test.mjs src/runtime/input/keyboard-locomotion.test.mjs"
assert old in t
t=t.replace(old,new,1)
pkg.write_text(t,encoding='utf-8')

Path(__file__).unlink()
print('NIVA Single-Step March V1 wired: grounded pressure transfer + one stride + rear-leg recovery + attention finish')
