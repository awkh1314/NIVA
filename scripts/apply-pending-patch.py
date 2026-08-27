from pathlib import Path
import json


def must_replace(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'missing patch anchor: {label}')
    return text.replace(old, new, 1)


def replace_between(text, start_marker, end_marker, replacement, label):
    a=text.find(start_marker)
    if a<0: raise RuntimeError(f'missing start anchor: {label}')
    b=text.find(end_marker,a)
    if b<0: raise RuntimeError(f'missing end anchor: {label}')
    return text[:a]+replacement+text[b:]

# ---------------------------------------------------------------------------
# Physics: Root accepts only bounded deltas produced by a foot plan.
# ---------------------------------------------------------------------------
p=Path('src/runtime/physics/niva-body-physics.mjs')
s=p.read_text(encoding='utf-8')

if '  rebuildGroundBox(width = 44, depth = 44) {' not in s:
    marker='  addFixedBoxCollider({ name = \'room-box\', size, position } = {}) {'
    method="""  rebuildGroundBox(width = 44, depth = 44) {
    if (this.groundCollider) {
      try { this.world.removeCollider(this.groundCollider, true); } catch {}
      this.groundCollider = null;
    }
    if (!this.groundBody) {
      this.groundBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.045, 0));
    }
    this.stageRadius = Math.max(width, depth) * 0.5;
    this.groundCollider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(Math.max(.5,width/2), 0.045, Math.max(.5,depth/2)).setFriction(1).setRestitution(0),
      this.groundBody,
    );
  }

"""
    s=must_replace(s,marker,method+marker,'physics ground box')

s=s.replace('    const entry = { name, body, collider };','    const entry = { name, body, collider, size: size.clone?.() || v3(size), position: position.clone?.() || v3(position) };',1)

move_start='  move(dt, direction, speed) {'
hold_marker='  holdPosition(dt) {'
new_move="""  moveByDelta(dt, delta, { maxDelta = null } = {}) {
    if (!this.enabled || !this.characterBody || !this.characterCollider) return new THREE.Vector3();
    const h = clamp(Number(dt) || 0, 1 / 120, 0.05);
    const d = delta?.clone?.() || v3(delta || { x: 0, y: 0, z: 0 });
    d.y = 0;
    const hardMax = Math.max(this.modelHeight * .02, Number(maxDelta) || this.modelHeight * .06);
    if (d.length() > hardMax) d.setLength(hardMax);
    const desired = { x: d.x, y: -Math.min(0.06, 9.81 * h * h * 1.5), z: d.z };
    this.characterController.computeColliderMovement(this.characterCollider, desired);
    const mv = this.characterController.computedMovement();
    this.grounded = Boolean(this.characterController.computedGrounded?.());
    const pos = this.characterBody.translation();
    this.characterBody.setNextKinematicTranslation({ x: pos.x + mv.x, y: pos.y + mv.y, z: pos.z + mv.z });
    this.world.timestep = clamp(h, 1 / 120, 1 / 30);
    this.world.step();
    const next = this.characterBody.translation();
    this.vrm.scene.position.x = next.x;
    this.vrm.scene.position.z = next.z;
    this.groundY = next.y - this.characterCenterOffset;
    return new THREE.Vector3(mv.x, mv.y, mv.z);
  }

  // Legacy API remains for non-locomotion callers, but walking no longer uses it.
  move(dt, direction, speed) {
    const h = clamp(Number(dt) || 0, 0, .05);
    const dir = direction?.clone?.() || new THREE.Vector3();dir.y=0;if(dir.lengthSq()>1e-7)dir.normalize();
    return this.moveByDelta(h, dir.multiplyScalar(Math.max(0,Number(speed)||0)*h));
  }

"""
s=replace_between(s,move_start,hold_marker,new_move,'physics delta movement')

if '  resolveFootLanding(start, desired' not in s:
    marker='  captureFoot(side) {'
    resolver="""  resolveFootLanding(start, desired, { margin = this.modelHeight * .055 } = {}) {
    const a = start?.clone?.() || v3(start || {x:0,y:this.groundY,z:0});
    const b = desired?.clone?.() || v3(desired || a);
    const delta = b.clone().sub(a);let lastSafe = a.clone();
    const samples = Math.max(8, Math.min(36, Math.ceil(delta.length() / Math.max(.035, this.modelHeight * .035))));
    for (let i = 1; i <= samples; i++) {
      const p = a.clone().lerp(b, i / samples);let blocked = false;
      for (const c of this.roomColliders) {
        if (!c?.size || !c?.position) continue;
        const bottom = c.position.y - c.size.y / 2;
        if (bottom > this.groundY + this.modelHeight * .20) continue;
        const hx = c.size.x / 2 + margin, hz = c.size.z / 2 + margin;
        if (Math.abs(p.x - c.position.x) <= hx && Math.abs(p.z - c.position.z) <= hz) { blocked = true; break; }
      }
      if (blocked) break;lastSafe.copy(p);
    }
    const hit = this.groundHitAt(lastSafe);if (hit) lastSafe.y = hit.point.y + Math.min(this.footOffset.left, this.footOffset.right);
    return lastSafe;
  }

"""
    s=must_replace(s,marker,resolver+marker,'foot landing resolver')

center_marker='    const centerOfMass = this.estimateCenterOfMass();'
if 'gaitPlan?.footTargets' not in s:
    insertion="""    if (gaitPlan?.footTargets) {
      for (const side of ['left','right']) {
        const target = gaitPlan.footTargets[side];
        if (target) this.footAnchor[side] = target.clone?.() || v3(target);
      }
    }
"""
    s=must_replace(s,center_marker,insertion+center_marker,'gait foot targets')
p.write_text(s,encoding='utf-8')

# ---------------------------------------------------------------------------
# IK: stance feet stay planted; swing feet follow the planner's world arc.
# ---------------------------------------------------------------------------
p=Path('src/runtime/ik/niva-ik-system.mjs')
s=p.read_text(encoding='utf-8')
old="""        const anchor=plan.footAnchors[side];if(!anchor||!plan.stance?.[side])continue;
        this.footIK.solve(side,anchor,plan.groundNormal,this.strength*scale,action);"""
new="""        const anchor=plan.footAnchors?.[side]||plan.footTargets?.[side];
        const stance=Boolean(plan.stance?.[side]),targetWeight=plan.footTargetWeights?.[side];
        const weight=clamp(targetWeight ?? (stance?1:0),0,1);if(!anchor||weight<=0)continue;
        const normal=stance?plan.groundNormal:new THREE.Vector3(0,1,0);
        this.footIK.solve(side,anchor,normal,this.strength*scale*weight,action);"""
s=must_replace(s,old,new,'IK swing foot targets')
p.write_text(s,encoding='utf-8')

# ---------------------------------------------------------------------------
# Main runtime: remove velocity-driven/root-slide locomotion and wire world V2.
# ---------------------------------------------------------------------------
p=Path('src/main.js')
s=p.read_text(encoding='utf-8')
s=must_replace(s,"  runWorldSpeed:1.25,","  runWorldSpeed:1.25,\n  timeOfDay:.30,\n  dayNightAuto:true,\n  dayNightSpeed:1,",'day-night settings')
s=s.replace('renderer.setClearColor(0x0b0d0e, 1);','renderer.setClearColor(0xa9c6d2, 1);',1)
s=s.replace('scene.background = new THREE.Color(0x0b0d0e);','scene.background = new THREE.Color(0xa9c6d2);',1)
s=must_replace(s,"bedroomWorld = new BedroomWorld({scene});\ncamera.position.set(0,1.55,5.2); controls.target.set(.35,.85,-.25); controls.maxDistance=10;","bedroomWorld = new BedroomWorld({scene,timeOfDay:settings.timeOfDay,autoDayNight:settings.dayNightAuto});\nbedroomWorld.setDayNightSpeed(settings.dayNightSpeed);\ncamera.position.set(-3.8,1.72,5.7); controls.target.set(.35,.86,-.28); controls.maxDistance=18; camera.fov=31; camera.updateProjectionMatrix();",'world constructor')
s=must_replace(s,'  controls.target.set(0,modelHeight*.52,0); camera.position.set(0,modelHeight*.55,modelHeight*2.35); controls.update();','  controls.target.set(.35,modelHeight*.56,-.30); camera.position.set(-modelHeight*2.25,modelHeight*1.05,modelHeight*3.35); camera.fov=31; camera.updateProjectionMatrix(); controls.update();','world camera composition')
old_ctor="physicalEmbodiment=new PhysicalEmbodimentController({world:bedroomWorld,getVrm:()=>vrm,getBodyPhysics:()=>bodyPhysics,getActionState:()=>({time:currentAction?.time||0,duration:currentAction?.getClip?.()?.duration||1}),playClip:(name,opts)=>playClip(name,opts),stopAction:()=>stopAction(),faceDirection:(dir,dt,lambda)=>facingController?.faceDirection(dir,dt,lambda),walkSpeed:settings.walkWorldSpeed,stepLength:modelHeight*.42});"
new_ctor="physicalEmbodiment=new PhysicalEmbodimentController({world:bedroomWorld,getVrm:()=>vrm,getBodyPhysics:()=>bodyPhysics,getActionState:()=>({time:currentAction?.time||0,duration:currentAction?.getClip?.()?.duration||1}),playClip:(name,opts)=>playClip(name,opts),stopAction:()=>stopAction(),faceDirection:(dir,dt,lambda)=>facingController?.faceDirection(dir,dt,lambda),setActionPhase:(phase)=>{const clip=currentAction?.getClip?.();if(clip&&['walk','run','marchStepLeft','marchStepRight'].includes(currentActionName))currentAction.time=clamp(phase,0,1)*(clip.duration||1);},walkSpeed:settings.walkWorldSpeed,stepLength:modelHeight*.42,modelHeight});"
s=must_replace(s,old_ctor,new_ctor,'physical embodiment wiring')

old_keyboard="""function updateKeyboardWalk(dt,now,state){
  if(!state?.moving||!vrm||physicalEmbodiment?.ownsRootPose?.()){
    if(state?.stopped&&keyboardOwnsWalk){keyboardOwnsWalk=false;if(currentActionName==='walk'&&!persistentPreview)stopAction();}
    return;
  }
  if(!keyboardOwnsWalk)beginKeyboardWalk();
  if(!keyboardOwnsWalk)return;
  manualOverrideUntil=now+700;director.resumeAt=now+1200;
  camera.getWorldDirection(keyboardForward);keyboardForward.y=0;if(keyboardForward.lengthSq()<1e-8)keyboardForward.set(0,0,-1);else keyboardForward.normalize();
  keyboardRight.crossVectors(keyboardForward,worldUp).normalize();
  keyboardDirection.copy(keyboardForward).multiplyScalar(state.axisZ).addScaledVector(keyboardRight,state.axisX);
  if(keyboardDirection.lengthSq()<1e-8)return;keyboardDirection.normalize();
  const speed=settings.walkWorldSpeed*state.speed01;
  if(settings.physicsEnabled&&physicsReady&&bodyPhysics){
    bodyPhysics.configure({enabled:true,ikEnabled:settings.footIKEnabled,ikStrength:settings.footIKStrength});
    if(physicalEmbodiment)physicalEmbodiment.drive(dt,keyboardDirection,speed,'walk');else bodyPhysics.move(dt,keyboardDirection,speed);
  }else{
    vrm.scene.position.addScaledVector(keyboardDirection,speed*dt);
    vrm.scene.position.x=clamp(vrm.scene.position.x,-2.75,2.75);vrm.scene.position.z=clamp(vrm.scene.position.z,-2.25,2.25);
  }
  facingController?.faceDirection(keyboardDirection,dt,state.inputActive?9:6);
  if(currentActionName==='walk'&&currentAction){
    const fatigueSlow=1-clamp((lifeSim.fatigue-28)/150,0,.30);
    currentAction.setEffectiveTimeScale((settings.motionSpeed||1)*fatigueSlow*lifeSim.paceNoise*(.70+.34*state.speed01));
  }
}"""
new_keyboard="""function updateKeyboardWalk(dt,now,state){
  if(!vrm||physicalEmbodiment?.ownsRootPose?.())return;
  const settling=keyboardOwnsWalk&&!physicalEmbodiment?.walkSettled?.();
  if(!state?.moving&&!settling){if(keyboardOwnsWalk){keyboardOwnsWalk=false;if(currentActionName==='walk'&&!persistentPreview)stopAction();}return;}
  if(state?.moving&&!keyboardOwnsWalk)beginKeyboardWalk();if(!keyboardOwnsWalk)return;
  manualOverrideUntil=now+700;director.resumeAt=now+1200;
  camera.getWorldDirection(keyboardForward);keyboardForward.y=0;if(keyboardForward.lengthSq()<1e-8)keyboardForward.set(0,0,-1);else keyboardForward.normalize();keyboardRight.crossVectors(keyboardForward,worldUp).normalize();
  keyboardDirection.copy(keyboardForward).multiplyScalar(state?.axisZ??1).addScaledVector(keyboardRight,state?.axisX??0);if(keyboardDirection.lengthSq()<1e-8)keyboardDirection.copy(keyboardForward);else keyboardDirection.normalize();
  if(!settings.physicsEnabled||!physicsReady||!bodyPhysics||!physicalEmbodiment)return;
  bodyPhysics.configure({enabled:true,ikEnabled:settings.footIKEnabled,ikStrength:settings.footIKStrength});
  const continueSteps=Boolean(state?.inputActive),speed=continueSteps?settings.walkWorldSpeed*state.speed01:0;const plan=physicalEmbodiment.drive(dt,keyboardDirection,speed,'walk',{continueSteps});
  if(!continueSteps&&plan?.settled){keyboardOwnsWalk=false;if(currentActionName==='walk'&&!persistentPreview)stopAction();}
}"""
s=must_replace(s,old_keyboard,new_keyboard,'keyboard foot-driven movement')

new_locomotion="""  updateLocomotion(dt,a){
    if(!vrm||this.recovering||!['walk','run'].includes(a)||persistentPreview!==a)return;
    const baseX=modelHome.x+settings.modelX,baseZ=modelHome.z+settings.modelZ;const pos=new THREE.Vector3(vrm.scene.position.x-baseX,0,vrm.scene.position.z-baseZ),to=this.stageTarget.clone().sub(pos);to.y=0;
    if(to.length()<.14){this.chooseStageTarget();return;}const dir=to.normalize(),fatigueSlow=1-clamp((this.fatigue-35)/170,0,.28),speed=(a==='run'?settings.runWorldSpeed:settings.walkWorldSpeed)*fatigueSlow;
    if(!settings.physicsEnabled||!physicsReady||!bodyPhysics||!physicalEmbodiment)return;bodyPhysics.configure({enabled:true,ikEnabled:settings.footIKEnabled,ikStrength:settings.footIKStrength});physicalEmbodiment.drive(dt,dir,speed,a,{continueSteps:true});
  },
"""
s=replace_between(s,'  updateLocomotion(dt,a){','  forceRecovery(now){',new_locomotion,'autonomous foot-driven movement')

stage_fn="""function renderStageControls(){
  const ws=bedroomWorld?.state?.()?.outdoor||{};const hour=Number.isFinite(ws.hour)?ws.hour:(((settings.timeOfDay||0)*24+6)%24);controlPage.innerHTML=`<section class=\"panel-section\"><h3>世界 · 卧室与草地</h3><div class=\"life-readout\">当前 ${hour.toFixed(1)} 时 · ${ws.dayFactor>.55?'白天':ws.nightFactor>.7?'夜晚':'晨昏'}</div>${rowSlider('时间 0-24h',0,24,.1,hour)}${rowSlider('昼夜倍率',.1,8,.1,settings.dayNightSpeed)}<label class=\"switch-row\"><span>自动昼夜</span><input id=\"dayAuto\" type=\"checkbox\" ${settings.dayNightAuto?'checked':''}></label><div class=\"button-grid\"><button data-hour=\"6\">06:00 清晨</button><button data-hour=\"12\">12:00 白天</button><button data-hour=\"18\">18:00 黄昏</button><button data-hour=\"0\">00:00 夜晚</button></div><small>旧圆形舞台已禁用。世界地面覆盖卧室与室外草地，门口可连续步行通过。</small></section>`;
  const ranges=[...controlPage.querySelectorAll('input[type=range]')],setHour=(h)=>{const hour=((Number(h)||0)%24+24)%24;settings.timeOfDay=(((hour-6)/24)%1+1)%1;bedroomWorld?.setTimeOfDay?.(settings.timeOfDay);ranges[0].parentElement.querySelector('output').textContent=hour.toFixed(1);saveSettings();};ranges[0].oninput=()=>setHour(ranges[0].value);ranges[1].oninput=()=>{settings.dayNightSpeed=+ranges[1].value;bedroomWorld?.setDayNightSpeed?.(settings.dayNightSpeed);ranges[1].parentElement.querySelector('output').textContent=ranges[1].value;saveSettings();};$('#dayAuto').onchange=e=>{settings.dayNightAuto=e.target.checked;if(settings.dayNightAuto)bedroomWorld?.resumeDayNight?.();else bedroomWorld?.pauseDayNight?.();saveSettings();};controlPage.querySelectorAll('[data-hour]').forEach(b=>b.onclick=()=>setHour(+b.dataset.hour));
}
"""
s=replace_between(s,'function renderStageControls(){','function renderLightControls(){',stage_fn,'world control panel')

s=s.replace('function applyLighting(){ambient.intensity=settings.ambient;key.intensity=settings.key;fill.intensity=settings.fill;rim.intensity=settings.rim;', 'function applyLighting(){ambient.intensity=settings.ambient*.32;key.intensity=settings.key*.38;fill.intensity=settings.fill*.28;rim.intensity=settings.rim*.30;',1)
s=s.replace('applyLighting();floor.visible=ring.visible=innerRing.visible=settings.stageVisible!==false;','applyLighting();floor.visible=false;ring.visible=false;innerRing.visible=false;',1)
p.write_text(s,encoding='utf-8')

# ---------------------------------------------------------------------------
# Ensure the new invariant and world tests run in the standard suite.
# ---------------------------------------------------------------------------
p=Path('package.json')
data=json.loads(p.read_text(encoding='utf-8'))
cmd=data['scripts']['test']
for test_file in ['src/runtime/physics/foot-driven-walk.test.mjs','src/runtime/world/day-night-cycle.test.mjs','src/runtime/world/outdoor-environment.test.mjs']:
    if test_file not in cmd: cmd += ' ' + test_file
data['scripts']['test']=cmd
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

print('NIVA Foot-Driven World V2 wired: step-distance root coupling + cozy room + grass + sky + sun/moon cycle')
Path(__file__).unlink()
