from pathlib import Path

# 1) Wire the predictive projector after final joint limits and before render.
p=Path('src/main.js')
s=p.read_text(encoding='utf-8')
repls=[
("import { JointRotationGuard } from './runtime/safety/joint-rotation-guard.mjs';\n", "import { JointRotationGuard } from './runtime/safety/joint-rotation-guard.mjs';\nimport { SelfCollisionProjector } from './runtime/safety/self-collision-projector.mjs';\n"),
("let jointGuard = null;\n", "let jointGuard = null;\nlet selfCollisionProjector = null;\n"),
("ikSystem=new NivaIKSystem({vrm,getBone,frame:characterFrame,modelHeight}); jointGuard=new JointRotationGuard({getBone,baseQuats});jointGuard.reset(); coordinateDebug=", "ikSystem=new NivaIKSystem({vrm,getBone,frame:characterFrame,modelHeight}); jointGuard=new JointRotationGuard({getBone,baseQuats});jointGuard.reset(); selfCollisionProjector=new SelfCollisionProjector({vrm,getBone,baseQuats,getHeight:()=>modelHeight});selfCollisionProjector.calibrate(); coordinateDebug="),
("}jointGuard?.apply(dt);facingController?.tick();coordinateDebug?.update();vrm.update(dt);", "}jointGuard?.apply(dt);selfCollisionProjector?.project();facingController?.tick();coordinateDebug?.update();vrm.update(dt);")
]
for old,new in repls:
    if old not in s:
        raise SystemExit(f'main patch anchor missing: {old[:120]!r}')
    s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

# 2) Expand anatomy coverage and tighten visual shells. Calibration preserves neutral pose.
p=Path('runtime/niva-vrm-collision-guard.mjs')
s=p.read_text(encoding='utf-8')
for old,new in [
("radius: h * 0.118", "radius: h * 0.128"),
("radius: h * 0.102", "radius: h * 0.112"),
("h * 0.108", "h * 0.116"),
("h * 0.112", "h * 0.120"),
("h * 0.082", "h * 0.088"),
("h * 0.034),\n    rightUpperArm", "h * 0.038),\n    rightUpperArm"),
("h * 0.034),\n    leftForearm", "h * 0.038),\n    leftForearm"),
("h * 0.030),\n    rightForearm", "h * 0.034),\n    rightForearm"),
("h * 0.030),\n    leftHand", "h * 0.034),\n    leftHand"),
("leftHand', h * 0.034", "leftHand', h * 0.039"),
("rightHand', h * 0.034", "rightHand', h * 0.039"),
("h * 0.043),\n    rightThigh", "h * 0.047),\n    rightThigh"),
("h * 0.043),\n    leftShin", "h * 0.047),\n    leftShin"),
("h * 0.034),\n    rightShin", "h * 0.038),\n    rightShin"),
("h * 0.034),\n    leftFoot", "h * 0.038),\n    leftFoot"),
("h * 0.036, 0, 1),\n    rightFoot", "h * 0.041, 0, 1),\n    rightFoot"),
("h * 0.036, 0, 1),\n  };", "h * 0.041, 0, 1),\n  };")
]:
    if old in s:
        s=s.replace(old,new,1)

s=s.replace("neutralSlackScale = 0.003", "neutralSlackScale = 0.0015",1)
anchor="  pair('right-forearm-left-thigh', 'rightForearm', 'leftThigh', R_ARM, 0.007),\n]);"
extra="""  pair('right-forearm-left-thigh', 'rightForearm', 'leftThigh', R_ARM, 0.007),

  // V0.90 predictive full-body coverage: no chain may tunnel through another.
  pair('left-upperarm-head', 'leftUpperArm', 'head', L_ARM, 0.012),
  pair('right-upperarm-head', 'rightUpperArm', 'head', R_ARM, 0.012),
  pair('left-upperarm-pelvis', 'leftUpperArm', 'pelvis', L_ARM, 0.012),
  pair('right-upperarm-pelvis', 'rightUpperArm', 'pelvis', R_ARM, 0.012),
  pair('left-forearm-pelvis', 'leftForearm', 'pelvis', L_ARM, 0.014),
  pair('right-forearm-pelvis', 'rightForearm', 'pelvis', R_ARM, 0.014),

  pair('left-hand-left-shin', 'leftHand', 'leftShin', L_ARM, 0.011),
  pair('left-hand-right-shin', 'leftHand', 'rightShin', L_ARM, 0.011),
  pair('right-hand-left-shin', 'rightHand', 'leftShin', R_ARM, 0.011),
  pair('right-hand-right-shin', 'rightHand', 'rightShin', R_ARM, 0.011),
  pair('left-hand-left-foot', 'leftHand', 'leftFoot', L_ARM, 0.010),
  pair('left-hand-right-foot', 'leftHand', 'rightFoot', L_ARM, 0.010),
  pair('right-hand-left-foot', 'rightHand', 'leftFoot', R_ARM, 0.010),
  pair('right-hand-right-foot', 'rightHand', 'rightFoot', R_ARM, 0.010),
  pair('left-forearm-left-shin', 'leftForearm', 'leftShin', L_ARM, 0.009),
  pair('left-forearm-right-shin', 'leftForearm', 'rightShin', L_ARM, 0.009),
  pair('right-forearm-left-shin', 'rightForearm', 'leftShin', R_ARM, 0.009),
  pair('right-forearm-right-shin', 'rightForearm', 'rightShin', R_ARM, 0.009),

  pair('left-thigh-torso', 'leftThigh', 'torso', L_LEG, 0.012),
  pair('right-thigh-torso', 'rightThigh', 'torso', R_LEG, 0.012),
  pair('left-shin-torso', 'leftShin', 'torso', L_LEG, 0.012),
  pair('right-shin-torso', 'rightShin', 'torso', R_LEG, 0.012),
  pair('left-foot-torso', 'leftFoot', 'torso', L_LEG, 0.012),
  pair('right-foot-torso', 'rightFoot', 'torso', R_LEG, 0.012),
  pair('left-thigh-head', 'leftThigh', 'head', L_LEG, 0.010),
  pair('right-thigh-head', 'rightThigh', 'head', R_LEG, 0.010),
  pair('left-shin-head', 'leftShin', 'head', L_LEG, 0.010),
  pair('right-shin-head', 'rightShin', 'head', R_LEG, 0.010),
  pair('left-foot-head', 'leftFoot', 'head', L_LEG, 0.010),
  pair('right-foot-head', 'rightFoot', 'head', R_LEG, 0.010),
]);"""
if anchor not in s:
    raise SystemExit('collision pair insertion anchor missing')
s=s.replace(anchor,extra,1)
p.write_text(s,encoding='utf-8')

# 3) Add projector tests to the standard CI command.
p=Path('package.json')
s=p.read_text(encoding='utf-8')
old='src/runtime/safety/joint-rotation-guard.test.mjs"'
new='src/runtime/safety/joint-rotation-guard.test.mjs src/runtime/safety/self-collision-projector.test.mjs"'
if old not in s:
    raise SystemExit('package test anchor missing')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

# One-shot patch: remove itself so later pushes can never reapply it.
Path(__file__).unlink()
print('NIVA predictive no-rollback collision projection wired')
