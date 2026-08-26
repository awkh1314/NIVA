from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, content):
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# --- Physics: estimate COM, follow support foot, and return a smoothed balance plan.
physics = read("src/runtime/physics/niva-body-physics.mjs")
physics = replace_once(
    physics,
    "import RAPIER from '@dimforge/rapier3d-compat';\n",
    "import RAPIER from '@dimforge/rapier3d-compat';\nimport { GaitBalanceController, HUMANOID_MASS_WEIGHTS, weightedCenterOfMass } from './biomechanics-life.mjs';\n",
    "physics import",
)
physics = replace_once(
    physics,
    "    this.lastGroundNormal = new THREE.Vector3(0, 1, 0);\n",
    "    this.lastGroundNormal = new THREE.Vector3(0, 1, 0);\n    this.balanceController = new GaitBalanceController({ modelHeight });\n    this.balancePlan = null;\n",
    "balance fields",
)
physics = replace_once(
    physics,
    "  rebuildGround(radius) {\n",
    """  readBoneWorld(name) {
    const bone = this.getBone?.(name);
    if (!bone) return null;
    this.vrm.scene.updateMatrixWorld(true);
    return bone.getWorldPosition(new THREE.Vector3());
  }

  estimateCenterOfMass() {
    const samples = [];
    for (const [name, mass] of Object.entries(HUMANOID_MASS_WEIGHTS)) {
      const position = this.readBoneWorld(name);
      if (position) samples.push({ mass, position });
    }
    return weightedCenterOfMass(samples);
  }

  rebuildGround(radius) {
""",
    "COM methods",
)
physics = replace_once(
    physics,
    "    const next = this.characterBody.translation();\n    this.groundY = next.y - this.characterCenterOffset;\n  }\n\n  groundHitAt(worldPoint) {",
    "    const next = this.characterBody.translation();\n    this.vrm.scene.position.x = next.x;\n    this.vrm.scene.position.z = next.z;\n    this.groundY = next.y - this.characterCenterOffset;\n  }\n\n  groundHitAt(worldPoint) {",
    "hold resets visual balance",
)
physics = replace_once(
    physics,
    "    this.vrm.scene.position.y = this.groundY + this.postureOffset;\n",
    "    this.vrm.scene.position.y = this.groundY + this.postureOffset + (this.balancePlan?.verticalOffset || 0);\n",
    "vertical gait offset",
)
old_return = """    return {
      owner: 'physics-contact-plan',
      action,
      phase,
      crouchAmount,
      stance,
      footAnchors: {
        left: this.footAnchor.left?.clone?.() || null,
        right: this.footAnchor.right?.clone?.() || null,
      },
      groundNormal: this.lastGroundNormal.clone(),
      grounded: this.grounded,
      postureOffset: this.postureOffset,
    };
"""
new_return = """    const centerOfMass = this.estimateCenterOfMass();
    const leftFoot = this.readFoot('left');
    const rightFoot = this.readFoot('right');
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.vrm.scene.quaternion).setY(0);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.vrm.scene.quaternion).setY(0);
    if (forward.lengthSq() > 1e-8) forward.normalize();
    if (right.lengthSq() > 1e-8) right.normalize();
    this.balancePlan = this.balanceController.update(dt, {
      action,
      phase,
      stance,
      centerOfMass,
      leftFoot,
      rightFoot,
      forward,
      right,
      grounded: this.grounded,
    });

    // Physics owns root translation. A small visual pelvis shift places the
    // projected COM over the support foot; move()/holdPosition() reset this
    // from the Rapier body on the next frame, so the correction never drifts.
    if (this.balancePlan && this.grounded) {
      this.vrm.scene.position.addScaledVector(right, this.balancePlan.rootShiftRight || 0);
      this.vrm.scene.position.addScaledVector(forward, this.balancePlan.rootShiftForward || 0);
    }

    return {
      owner: 'physics-contact-plan',
      action,
      phase,
      crouchAmount,
      stance,
      footAnchors: {
        left: this.footAnchor.left?.clone?.() || null,
        right: this.footAnchor.right?.clone?.() || null,
      },
      groundNormal: this.lastGroundNormal.clone(),
      grounded: this.grounded,
      postureOffset: this.postureOffset,
      balance: this.balancePlan ? { ...this.balancePlan } : null,
    };
"""
physics = replace_once(physics, old_return, new_return, "balance contact plan")
physics = replace_once(
    physics,
    "      owner: 'Rapier + root position + ground contacts only',\n      solver: 'physics-boundary-v1',\n",
    "      owner: 'Rapier + root position + ground contacts + COM balance plan',\n      centerOfMass: this.balancePlan?.com || null,\n      balance: this.balancePlan ? { ...this.balancePlan } : null,\n      solver: 'physics-balance-v2',\n",
    "physics state",
)
write("src/runtime/physics/niva-body-physics.mjs", physics)


# --- Runtime: physiology remains additive on top of authored clips, and balance
#     corrections are applied as whole-body layers rather than random shake.
main = read("src/main.js")
main = replace_once(
    main,
    "import { createPublicMotionBridge } from './runtime/motion/public-motion-bridge.mjs';\n",
    "import { createPublicMotionBridge } from './runtime/motion/public-motion-bridge.mjs';\nimport { PhysiologyOscillator } from './runtime/physics/biomechanics-life.mjs';\n",
    "main physiology import",
)
main = replace_once(
    main,
    "NivaPhysicsBodySystem.create({vrm,getFootWorldPosition:",
    "NivaPhysicsBodySystem.create({vrm,getBone,getFootWorldPosition:",
    "pass bone reader to physics",
)
main = replace_once(
    main,
    "  paceNoise:1,nextPaceNoise:0,lastUi:0,lastPreview:'',stageTarget:new THREE.Vector3(),groundMode:'',\n",
    "  paceNoise:1,nextPaceNoise:0,lastUi:0,lastPreview:'',stageTarget:new THREE.Vector3(),groundMode:'',balancePlan:null,\n",
    "life balance state",
)
random_pace = "    if(this.fatigue>55&&now>=this.nextPaceNoise){this.paceNoise=.90+Math.random()*.12;this.nextPaceNoise=now+1500+Math.random()*2400;}else this.paceNoise+=(1-this.paceNoise)*(1-Math.exp(-dt*2));\n"
smooth_pace = "    const cadenceTarget=this.fatigue>55?.965+.035*Math.sin(now*.0016):1;this.paceNoise+=(cadenceTarget-this.paceNoise)*(1-Math.exp(-dt*1.8));\n"
main = replace_once(main, random_pace, smooth_pace, "remove random cadence jitter")
main = replace_once(
    main,
    "  applyFatigueFace(){\n",
    """  applyBalance(){
    const b=this.balancePlan;if(!b)return;
    const pitch=b.torsoPitchDeg||0,roll=b.torsoRollDeg||0;
    applyAdditive('hips',pitch*.20,0,-roll*.46,'balance');
    applyAdditive('spine',pitch*.36,0,-roll*.30,'balance');
    applyAdditive('chest',pitch*.28,0,-roll*.18,'balance');
    applyAdditive('upperChest',pitch*.16,0,-roll*.08,'balance');
  },
  applyFatigueFace(){
""",
    "apply whole-body balance",
)

life_pattern = re.compile(r"const life=\{\n.*?\n\};\nconst additiveScratch", re.S)
life_replacement = r"""const physiology=new PhysiologyOscillator();
const life={
  nextBlink:performance.now()+2500,
  blinkStart:0,
  blinkDouble:false,
  nextDouble:0,
  deepBreathUntil:0,
  update(now,dt=1/60){
    if(!vrm||!settings.lifeEnabled)return;
    if(settings.blinkEnabled&&vrm.expressionManager){
      if(!this.blinkStart&&now>=this.nextBlink){this.blinkStart=now;this.blinkDouble=Math.random()<.12;}
      if(this.blinkStart){const t=now-this.blinkStart;let v=t<90?t/90:t<145?1:(t<275?1-(t-145)/130:0);vrm.expressionManager.setValue('blink',clamp(v,0,1));if(t>300){this.blinkStart=0;const fatigueBlink=settings.lifeSimulation?clamp(3200-lifeSim.fatigue*18,1300,3200):3200;this.nextBlink=now+fatigueBlink+Math.random()*2200;if(this.blinkDouble)this.nextBlink=now+180;}}
    }
    const vital=physiology.update(dt,{breathsPerMinute:settings.lifeSimulation?lifeSim.breathRate:settings.breaths,heartRate:settings.lifeSimulation?lifeSim.heartRate:settings.bpm,breathAmplitude:settings.breathAmp,deepBreath:now<this.deepBreathUntil,load:settings.lifeSimulation?lifeSim.load:0});
    if(settings.breathingEnabled){
      applyAdditive('spine',vital.spinePitchDeg,0,0,'breath');
      applyAdditive('chest',vital.chestPitchDeg,0,0,'breath');
      applyAdditive('upperChest',vital.upperChestPitchDeg,0,0,'breath');
      applyAdditive('leftShoulder',0,0,vital.shoulderLiftDeg,'breath');
      applyAdditive('rightShoulder',0,0,-vital.shoulderLiftDeg,'breath');
    }
    if(settings.heartbeatEnabled){
      applyAdditive('upperChest',vital.heartbeatDeg,0,0,'heartbeat');
      applyAdditive('chest',vital.heartbeatDeg*.35,0,0,'heartbeat');
    }
  }
};
const additiveScratch"""
main, n = life_pattern.subn(life_replacement, main, count=1)
if n != 1:
    raise RuntimeError(f"physiology block: expected one match, found {n}")

manual_pattern = re.compile(
    r"  for\(const \[name,base\] of baseQuats\.entries\(\)\)\{\n"
    r"    if\(currentAction && \['walk','run','wave','think','thinkLoop','reach','weight','nod','crouch','recovery'\]\.includes\(currentActionName\) && !manualOffsets\.has\(name\)\) continue;\n"
    r"    const node=getBone\(name\); if\(!node\)continue; const m=manualOffsets\.get\(name\)\|\|\[0,0,0\],layers=additiveScratch\.get\(name\)\|\|\{\};let lx=0,ly=0,lz=0;for\(const v of Object\.values\(layers\)\)\{lx\+=v\?\.\[0\]\|\|0;ly\+=v\?\.\[1\]\|\|0;lz\+=v\?\.\[2\]\|\|0;\}\n"
    r"    node\.quaternion\.copy\(base\)\.multiply\(new THREE\.Quaternion\(\)\.setFromEuler\(new THREE\.Euler\(rad\(m\[0\]\+lx\),rad\(m\[1\]\+ly\),rad\(m\[2\]\+lz\),'XYZ'\)\)\);\n"
    r"  \}"
)
manual_replacement = r"""  for(const [name,base] of baseQuats.entries()){
    const node=getBone(name);if(!node)continue;const layers=additiveScratch.get(name)||{};let lx=0,ly=0,lz=0;for(const v of Object.values(layers)){lx+=v?.[0]||0;ly+=v?.[1]||0;lz+=v?.[2]||0;}
    const delta=new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(lx),rad(ly),rad(lz),'XYZ'));
    const actionOwns=currentAction&&['walk','run','wave','think','thinkLoop','reach','weight','nod','crouch','recovery'].includes(currentActionName)&&!manualOffsets.has(name);
    if(actionOwns){if(Math.abs(lx)+Math.abs(ly)+Math.abs(lz)>1e-7)node.quaternion.multiply(delta);continue;}
    const m=manualOffsets.get(name)||[0,0,0];node.quaternion.copy(base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(m[0]),rad(m[1]),rad(m[2]),'XYZ'))).multiply(delta));
  }"""
main, n = manual_pattern.subn(manual_replacement, main, count=1)
if n != 1:
    raise RuntimeError(f"additive animation layering: expected one match, found {n}")

main = replace_once(
    main,
    "lifeSim.update(dt,now); life.update(now); director.update(now);",
    "lifeSim.update(dt,now); life.update(now,dt); director.update(now);",
    "pass dt to physiology",
)
main = replace_once(
    main,
    "  applyManualAndLife(); if(vrm){lifeSim.applyGroundContact(dt);",
    "  lifeSim.applyBalance(); applyManualAndLife(); if(vrm){lifeSim.applyGroundContact(dt);",
    "balance before additive application",
)
main = replace_once(
    main,
    "contactPlan=bodyPhysics.solvePostAnimation(dt,{action:currentActionName,actionTime:currentAction?.time||0,duration:clip?.duration||1,crouchDepth:settings.crouchDepth});}",
    "contactPlan=bodyPhysics.solvePostAnimation(dt,{action:currentActionName,actionTime:currentAction?.time||0,duration:clip?.duration||1,crouchDepth:settings.crouchDepth});lifeSim.balancePlan=contactPlan?.balance||null;}",
    "capture balance plan",
)
main = replace_once(main, "window.NIVA={version:'0.99.0'", "window.NIVA={version:'0.99.1'", "runtime version")
write("src/main.js", main)

# One-shot patch only.
Path(__file__).unlink()
print("NIVA biomechanics life physics v1 applied")
